const http = require("http");
const https = require("https");

process.loadEnvFile(".env");

const PORT = 3000;


// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};


// ============================================================
// HTTP HELPERS
// ============================================================

function getJSON(url) {

    return new Promise((resolve, reject) => {

        https.get(
            url,
            {
                headers: {
                    "User-Agent": "SIH-Logistics/1.0",
                    "Accept": "application/json"
                }
            },
            (response) => {

                let data = "";

                response.on(
                    "data",
                    chunk => {
                        data += chunk;
                    }
                );

                response.on(
                    "end",
                    () => {

                        try {

                            const json =
                                JSON.parse(data);

                            resolve(json);

                        } catch (error) {

                            reject(
                                new Error(
                                    "Invalid JSON response"
                                )
                            );
                        }
                    }
                );

            }
        ).on(
            "error",
            reject
        );

    });

}


function readBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";

        req.on(
            "data",
            chunk => {
                body += chunk;
            }
        );

        req.on(
            "end",
            () => {

                try {

                    resolve(
                        JSON.parse(body)
                    );

                } catch (error) {

                    reject(
                        new Error(
                            "Invalid JSON body"
                        )
                    );
                }
            }
        );

        req.on(
            "error",
            reject
        );

    });

}


function sendJSON(
    res,
    statusCode,
    data
) {

    res.writeHead(
        statusCode,
        {
            ...CORS_HEADERS,
            "Content-Type":
                "application/json"
        }
    );

    res.end(
        JSON.stringify(data)
    );

}


// ============================================================
// GEOCODING
// ============================================================

async function geocodePlace(place) {

    const apiKey =
        process.env.ORS_API_KEY;

    if (!apiKey) {

        throw new Error(
            "ORS_API_KEY is missing from .env"
        );
    }

    const url =
        "https://api.openrouteservice.org/geocode/search" +
        "?api_key=" +
        encodeURIComponent(apiKey) +
        "&text=" +
        encodeURIComponent(place) +
        "&size=1";

    const data =
        await getJSON(url);

    if (
        !data.features ||
        data.features.length === 0
    ) {

        throw new Error(
            `Could not find location: ${place}`
        );
    }

    const coordinates =
        data.features[0].geometry.coordinates;

    return {

        name: place,

        longitude:
            coordinates[0],

        latitude:
            coordinates[1]

    };

}


// ============================================================
// DISTANCE CALCULATIONS
// ============================================================

function haversineDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            lat1 * Math.PI / 180
        ) *

        Math.cos(
            lat2 * Math.PI / 180
        ) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;

}


// ============================================================
// ROUTE DIVERSITY
// ============================================================

function findNearestDistanceToRoute(
    point,
    routeCoordinates
) {

    let minimumDistance =
        Infinity;

    for (
        let i = 0;
        i < routeCoordinates.length;
        i++
    ) {

        const coordinate =
            routeCoordinates[i];

        const longitude =
            coordinate[0];

        const latitude =
            coordinate[1];

        const distance =
            haversineDistance(
                point[1],
                point[0],
                latitude,
                longitude
            );

        if (
            distance <
            minimumDistance
        ) {

            minimumDistance =
                distance;
        }
    }

    return minimumDistance;
}


function calculateRouteDiversity(
    route,
    referenceRoute
) {

    if (
        !route.coordinates ||
        !referenceRoute.coordinates
    ) {

        return {
            share: 0,
            diversity: 0,
            diversityBenefit: 0
        };
    }

    const toleranceKm =
        0.05;

    let sharedPoints = 0;

    for (
        const point
        of route.coordinates
    ) {

        const distance =
            findNearestDistanceToRoute(
                point,
                referenceRoute.coordinates
            );

        if (
            distance <= toleranceKm
        ) {

            sharedPoints++;
        }
    }

    const share =
        route.coordinates.length > 0
            ? sharedPoints /
              route.coordinates.length
            : 1;

    const diversity =
        Math.max(
            0,
            1 - share
        );

    const diversityBenefit =
        diversity * 10;

    return {

        share:
            Number(
                (share * 100)
                .toFixed(1)
            ),

        diversity:
            Number(
                (diversity * 100)
                .toFixed(1)
            ),

        diversityBenefit:
            Number(
                diversityBenefit
                .toFixed(2)
            )
    };

}


// ============================================================
// URGENCY
// ============================================================

function getUrgencyFactor(
    urgency
) {

    switch (
        String(urgency)
            .toUpperCase()
    ) {

        case "LOW":
            return 0.5;

        case "MEDIUM":
            return 1.0;

        case "HIGH":
            return 1.5;

        case "CRITICAL":
            return 2.0;

        default:
            return 1.0;
    }

}


// ============================================================
// ROUTE SCORING
// ============================================================

function calculateWeightFactor(
    route,
    referenceRoute,
    urgency
) {

    const distanceDifference =
        route.distanceKm -
        referenceRoute.distanceKm;

    const distancePenalty =
        referenceRoute.distanceKm > 0
            ? (
                distanceDifference /
                referenceRoute.distanceKm
            ) * 10
            : 0;

    const timeDifference =
        route.durationMin -
        referenceRoute.durationMin;

    const urgencyFactor =
        getUrgencyFactor(
            urgency
        );

    const timePenalty =
        referenceRoute.durationMin > 0
            ? (
                timeDifference /
                referenceRoute.durationMin
            ) *
            10 *
            urgencyFactor
            : 0;

    return Number(
        (
            Math.max(
                0,
                distancePenalty
            ) +

            Math.max(
                0,
                timePenalty
            )
        ).toFixed(2)
    );

}


function calculateRawScore(
    route,
    referenceRoute,
    urgency
) {

    const weightFactor =
        calculateWeightFactor(
            route,
            referenceRoute,
            urgency
        );

    const diversity =
        calculateRouteDiversity(
            route,
            referenceRoute
        );

    const diversityBenefit =
        diversity.diversityBenefit;

    const rawScore =
        weightFactor -
        (
            diversityBenefit *
            0.30
        );

    return {

        weightFactor,

        rawScore:
            Number(
                Math.max(
                    0,
                    rawScore
                ).toFixed(2)
            ),

        share:
            diversity.share,

        diversity:
            diversity.diversity,

        diversityBenefit

    };

}


function calculateSafetyScore(
    rawScore
) {

    return Number(
        Math.max(
            0,
            Math.min(
                100,
                100 - rawScore
            )
        ).toFixed(2)
    );

}


// ============================================================
// CONVERT OSRM ROUTE
// ============================================================

function convertOSRMRoute(
    route
) {

    return {

        distanceKm:
            route.distance /
            1000,

        durationMin:
            route.duration /
            60,

        coordinates:
            route.geometry?.coordinates ||
            [],

        distanceMeters:
            route.distance,

        durationSeconds:
            route.duration

    };

}


// ============================================================
// NEW: GENERATE WAYPOINTS
// ============================================================

function generateAlternativeWaypoints(
    source,
    destination
) {

    const sourceLat =
        source.latitude;

    const sourceLon =
        source.longitude;

    const destinationLat =
        destination.latitude;

    const destinationLon =
        destination.longitude;


    // Midpoint between source and destination

    const midLat =
        (
            sourceLat +
            destinationLat
        ) / 2;

    const midLon =
        (
            sourceLon +
            destinationLon
        ) / 2;


    // Difference between coordinates

    const deltaLat =
        destinationLat -
        sourceLat;

    const deltaLon =
        destinationLon -
        sourceLon;


    // Calculate perpendicular direction

    const length =
        Math.sqrt(
            deltaLat * deltaLat +
            deltaLon * deltaLon
        );


    if (length === 0) {

        return [];

    }


    const perpendicularLat =
        -deltaLon / length;

    const perpendicularLon =
        deltaLat / length;


    /*
        Offset size.

        Around 0.12 degrees gives
        a meaningful detour for
        North-East India distances.

        We keep it relatively small
        so routes don't become
        unnecessarily huge.
    */

    const offset =
        0.12;


    const waypointNorth = {

        latitude:
            midLat +
            (
                perpendicularLat *
                offset
            ),

        longitude:
            midLon +
            (
                perpendicularLon *
                offset
            )

    };


    const waypointSouth = {

        latitude:
            midLat -
            (
                perpendicularLat *
                offset
            ),

        longitude:
            midLon -
            (
                perpendicularLon *
                offset
            )

    };


    return [

        waypointNorth,

        waypointSouth

    ];

}


// ============================================================
// OSRM ROUTING
// ============================================================

async function getSingleOSRMRoute(
    coordinates
) {

    const coordinateString =
        coordinates
            .map(
                point =>
                    `${point.longitude},${point.latitude}`
            )
            .join(";");


    const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        coordinateString +

        "?overview=full" +

        "&geometries=geojson" +

        "&steps=true" +

        "&annotations=true";


    const data =
        await getJSON(url);


    if (
        data.code !== "Ok" ||
        !data.routes ||
        data.routes.length === 0
    ) {

        return null;

    }


    return data.routes[0];

}


// ============================================================
// GET MULTIPLE ROUTES
// ============================================================

async function getOSRMRoutes(
    source,
    destination
) {

    console.log("");
    console.log(
        "========== ROUTE GENERATION =========="
    );


    // --------------------------------------------------------
    // ROUTE 1
    // Direct route
    // --------------------------------------------------------

    console.log(
        "Generating Route 1..."
    );


    const directRoute =
        await getSingleOSRMRoute(
            [
                source,
                destination
            ]
        );


    const routes = [];


    if (directRoute) {

        routes.push(
            directRoute
        );

        console.log(
            "Route 1 generated successfully"
        );

    }


    // --------------------------------------------------------
    // Generate alternative waypoints
    // --------------------------------------------------------

    const waypoints =
        generateAlternativeWaypoints(
            source,
            destination
        );


    // --------------------------------------------------------
    // ROUTE 2
    // Via first waypoint
    // --------------------------------------------------------

    if (
        waypoints[0]
    ) {

        console.log(
            "Generating Route 2..."
        );


        const route2 =
            await getSingleOSRMRoute(
                [
                    source,

                    {
                        latitude:
                            waypoints[0].latitude,

                        longitude:
                            waypoints[0].longitude
                    },

                    destination
                ]
            );


        if (route2) {

            routes.push(
                route2
            );

            console.log(
                "Route 2 generated successfully"
            );

        } else {

            console.log(
                "Route 2 could not be generated"
            );

        }

    }


    // --------------------------------------------------------
    // ROUTE 3
    // Via second waypoint
    // --------------------------------------------------------

    if (
        waypoints[1]
    ) {

        console.log(
            "Generating Route 3..."
        );


        const route3 =
            await getSingleOSRMRoute(
                [
                    source,

                    {
                        latitude:
                            waypoints[1].latitude,

                        longitude:
                            waypoints[1].longitude
                    },

                    destination
                ]
            );


        if (route3) {

            routes.push(
                route3
            );

            console.log(
                "Route 3 generated successfully"
            );

        } else {

            console.log(
                "Route 3 could not be generated"
            );

        }

    }


    // --------------------------------------------------------
    // DEBUG
    // --------------------------------------------------------

    console.log("");

    console.log(
        "TOTAL GENERATED ROUTES:",
        routes.length
    );


    console.log(
        "ROUTE DISTANCES:",
        routes.map(
            route =>
                (
                    route.distance /
                    1000
                ).toFixed(2) +
                " km"
        )
    );


    console.log(
        "ROUTE DURATIONS:",
        routes.map(
            route =>
                (
                    route.duration /
                    60
                ).toFixed(2) +
                " min"
        )
    );


    console.log(
        "======================================"
    );

    console.log("");


    if (
        routes.length === 0
    ) {

        throw new Error(
            "OSRM could not find any route"
        );

    }


    return routes;

}


// ============================================================
// PROCESS ROUTES
// ============================================================

function processRoutes(
    osrmRoutes,
    urgency
) {

    const convertedRoutes =
        osrmRoutes.map(
            route =>
                convertOSRMRoute(
                    route
                )
        );


    if (
        convertedRoutes.length === 0
    ) {

        return [];

    }


    // First route = reference route

    const referenceRoute =
        convertedRoutes[0];


    const processedRoutes =
        convertedRoutes.map(
            (
                route,
                index
            ) => {

                const routeNumber =
                    index + 1;


                // Reference route

                if (
                    index === 0
                ) {

                    return {

                        routeNumber,

                        distanceKm:
                            Number(
                                route.distanceKm
                                    .toFixed(2)
                            ),

                        durationMin:
                            Number(
                                route.durationMin
                                    .toFixed(2)
                            ),

                        coordinates:
                            route.coordinates,

                        distanceMeters:
                            route.distanceMeters,

                        durationSeconds:
                            route.durationSeconds,

                        share: 100,

                        diversity: 0,

                        diversityBenefit: 0,

                        weightFactor: 0,

                        rawScore: 0,

                        safetyScore: 100

                    };

                }


                // Alternative routes

                const scoring =
                    calculateRawScore(
                        route,
                        referenceRoute,
                        urgency
                    );


                return {

                    routeNumber,

                    distanceKm:
                        Number(
                            route.distanceKm
                                .toFixed(2)
                        ),

                    durationMin:
                        Number(
                            route.durationMin
                                .toFixed(2)
                        ),

                    coordinates:
                        route.coordinates,

                    distanceMeters:
                        route.distanceMeters,

                    durationSeconds:
                        route.durationSeconds,

                    share:
                        scoring.share,

                    diversity:
                        scoring.diversity,

                    diversityBenefit:
                        scoring.diversityBenefit,

                    weightFactor:
                        scoring.weightFactor,

                    rawScore:
                        scoring.rawScore,

                    safetyScore:
                        calculateSafetyScore(
                            scoring.rawScore
                        )

                };

            }
        );


    return processedRoutes;

}


// ============================================================
// SELECT BEST ROUTE
// ============================================================

function selectBestRoute(
    routes
) {

    if (
        !routes ||
        routes.length === 0
    ) {

        return null;

    }


    return routes.reduce(
        (
            best,
            current
        ) => {

            if (
                current.safetyScore >
                best.safetyScore
            ) {

                return current;

            }

            return best;

        }
    );

}


// ============================================================
// PRINT RESULT
// ============================================================

function printFinalResult(
    routes,
    bestRoute
) {

    console.log("");
    console.log(
        "================================================"
    );

    console.log(
        "             SIH LOGISTICS RESULT"
    );

    console.log(
        "================================================"
    );


    console.log("");
    console.log(
        "**************** BEST ROUTE ****************"
    );

    console.log(
        "Route Number       :",
        bestRoute.routeNumber
    );

    console.log(
        "Distance           :",
        bestRoute.distanceKm,
        "km"
    );

    console.log(
        "Estimated Time     :",
        bestRoute.durationMin,
        "min"
    );

    console.log(
        "Safety Score       :",
        `${bestRoute.safetyScore}/100`
    );

    console.log(
        "Raw Risk Penalty   :",
        bestRoute.rawScore
    );


    console.log("");
    console.log(
        "**************** ALTERNATIVE ROUTES ****************"
    );


    routes.forEach(
        route => {

            console.log(
                `Route ${route.routeNumber} : ` +
                `${route.distanceKm} km | ` +
                `${route.durationMin} min | ` +
                `Safety ${route.safetyScore}/100`
            );

        }
    );


    console.log("");
    console.log(
        "================================================"
    );

    console.log(
        "RECOMMENDED ROUTE :",
        `Route ${bestRoute.routeNumber}`
    );

    console.log(
        "SAFETY SCORE      :",
        `${bestRoute.safetyScore}/100`
    );

    console.log(
        "Higher safety score = safer route"
    );

    console.log(
        "================================================"
    );

}


// ============================================================
// FIND ROUTE HANDLER
// ============================================================

async function handleFindRoute(
    req,
    res
) {

    try {

        const body =
            await readBody(req);


        console.log("");
        console.log(
            "Incoming shipment request:"
        );

        console.log(
            body
        );


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (
            !body.source ||
            !body.destination
        ) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Source and destination are required"
                }
            );

            return;

        }


        const urgency =
            String(
                body.urgency ||
                "MEDIUM"
            ).toUpperCase();


        // ----------------------------------------------------
        // GEOCODE
        // ----------------------------------------------------

        console.log(
            "Geocoding source..."
        );


        const source =
            await geocodePlace(
                body.source
            );


        console.log(
            "Source:",
            source
        );


        console.log(
            "Geocoding destination..."
        );


        const destination =
            await geocodePlace(
                body.destination
            );


        console.log(
            "Destination:",
            destination
        );


        // ----------------------------------------------------
        // GET ROUTES
        // ----------------------------------------------------

        const osrmRoutes =
            await getOSRMRoutes(
                source,
                destination
            );


        // ----------------------------------------------------
        // PROCESS / SCORE
        // ----------------------------------------------------

        const routes =
            processRoutes(
                osrmRoutes,
                urgency
            );


        console.log(
            "Processed routes:",
            routes.length
        );


        // ----------------------------------------------------
        // BEST ROUTE
        // ----------------------------------------------------

        const bestRoute =
            selectBestRoute(
                routes
            );


        printFinalResult(
            routes,
            bestRoute
        );


        // ----------------------------------------------------
        // SEND RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            200,
            {

                source,

                destination,

                urgency,

                routeCount:
                    routes.length,

                bestRoute: {

                    routeNumber:
                        bestRoute.routeNumber,

                    distanceKm:
                        bestRoute.distanceKm,

                    durationMin:
                        bestRoute.durationMin,

                    safetyScore:
                        bestRoute.safetyScore

                },

                routes

            }
        );


    } catch (error) {

        console.error(
            "FIND ROUTE ERROR:",
            error
        );


        sendJSON(
            res,
            500,
            {

                error:
                    error.message ||
                    "Failed to find route"

            }
        );

    }

}


// ============================================================
// SERVER
// ============================================================

const server =
    http.createServer(
        async (
            req,
            res
        ) => {

            // ------------------------------------------------
            // CORS
            // ------------------------------------------------

            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    CORS_HEADERS
                );

                res.end();

                return;

            }


            // ------------------------------------------------
            // ROOT
            // ------------------------------------------------

            if (
                req.method === "GET" &&
                req.url === "/"
            ) {

                sendJSON(
                    res,
                    200,
                    {

                        message:
                            "SILP backend is running",

                        status:
                            "OK"

                    }
                );

                return;

            }


            // ------------------------------------------------
            // GET ROUTES
            // ------------------------------------------------

            if (
                req.method === "GET" &&
                req.url === "/routes"
            ) {

                sendJSON(
                    res,
                    200,
                    {

                        message:
                            "Route API is working"

                    }
                );

                return;

            }


            // ------------------------------------------------
            // FIND ROUTE
            // ------------------------------------------------

            if (
                req.method === "POST" &&
                req.url === "/find-route"
            ) {

                await handleFindRoute(
                    req,
                    res
                );

                return;

            }


            // ------------------------------------------------
            // 404
            // ------------------------------------------------

            sendJSON(
                res,
                404,
                {

                    error:
                        "Endpoint not found"

                }
            );

        }
    );


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "======================================"
        );

        console.log(
            "       SILP BACKEND SERVER"
        );

        console.log(
            "======================================"
        );

        console.log(
            `Server running on http://localhost:${PORT}`
        );

        console.log(
            "POST /find-route"
        );

        console.log(
            "GET  /routes"
        );

        console.log(
            "======================================"
        );

        console.log("");

    }
);