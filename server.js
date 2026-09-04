const http = require("http");
const https = require("https");

const PORT = 3000;

// ======================================================
// SETTINGS
// ======================================================

// Route diversity is a benefit.
// 0.30 means diversity helps the route,
// but does not overpower distance and time.
const DIVERSITY_WEIGHT = 0.30;


// ======================================================
// HTTP / HTTPS HELPER
// ======================================================

function getJSON(url) {

    return new Promise((resolve, reject) => {

        https.get(
            url,
            {
                headers: {
                    "User-Agent": "SIH-Logistics-Prototype/1.0",
                    "Accept": "application/json"
                }
            },
            (res) => {

                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {

                    if (res.statusCode < 200 || res.statusCode >= 300) {

                        reject(
                            new Error(
                                `Request failed with status ${res.statusCode}: ${data}`
                            )
                        );

                        return;
                    }

                    try {

                        resolve(JSON.parse(data));

                    } catch (error) {

                        reject(
                            new Error("Invalid JSON response")
                        );

                    }

                });

            }
        ).on("error", reject);

    });

}


// ======================================================
// READ REQUEST BODY
// ======================================================

function readBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", () => {
            resolve(body);
        });

        req.on("error", reject);

    });

}


// ======================================================
// SEND JSON
// ======================================================

function sendJSON(res, statusCode, data) {

    res.statusCode = statusCode;

    res.setHeader(
        "Content-Type",
        "application/json"
    );

    res.end(
        JSON.stringify(data, null, 2)
    );

}


// ======================================================
// GEOCODING USING ORS
// ======================================================

async function geocodePlace(place) {

    const apiKey = process.env.ORS_API_KEY;

    if (!apiKey) {
        throw new Error("ORS_API_KEY is missing from .env");
    }

    const url =
        "https://api.openrouteservice.org/geocode/search" +
        "?api_key=" + encodeURIComponent(apiKey) +
        "&text=" + encodeURIComponent(place) +
        "&size=1";

    const data = await getJSON(url);

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


// ======================================================
// HAVERSINE DISTANCE
// ======================================================

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
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;

}


// ======================================================
// FIND NEAREST POINT ON REFERENCE ROUTE
// ======================================================

function findNearestDistanceToRoute(
    point,
    routeCoordinates
) {

    let minimumDistance = Infinity;

    for (const coordinate of routeCoordinates) {

        const distance =
            haversineDistance(
                point[1],
                point[0],
                coordinate[1],
                coordinate[0]
            );

        if (distance < minimumDistance) {

            minimumDistance =
                distance;

        }

    }

    return minimumDistance;

}


// ======================================================
// CALCULATE ROUTE DIVERSITY
// ======================================================
//
// Share %:
// Percentage of the alternative route that follows
// the reference route.
//
// Diversity %:
// 100 - Share %
//
// Higher diversity = better resilience.
//
// Diversity Benefit:
// Diversity % converted to a 0–10 scale.
//
// Example:
//
// Share      = 20%
// Diversity = 80%
// Benefit   = 8
// ======================================================

function calculateRouteDiversity(
    referenceCoordinates,
    alternativeCoordinates
) {

    if (
        !referenceCoordinates ||
        !alternativeCoordinates ||
        referenceCoordinates.length === 0 ||
        alternativeCoordinates.length === 0
    ) {

        return {

            sharedDistanceKm: 0,

            sharePercent: 0,

            diversityPercent: 100,

            diversityBenefit: 10

        };

    }


    // 50 metre tolerance
    const toleranceKm = 0.05;

    let sharedDistanceKm = 0;

    let alternativeDistanceKm = 0;


    for (
        let i = 1;
        i < alternativeCoordinates.length;
        i++
    ) {

        const start =
            alternativeCoordinates[i - 1];

        const end =
            alternativeCoordinates[i];


        const segmentDistance =
            haversineDistance(
                start[1],
                start[0],
                end[1],
                end[0]
            );


        alternativeDistanceKm +=
            segmentDistance;


        const midpoint = [

            (start[0] + end[0]) / 2,

            (start[1] + end[1]) / 2

        ];


        const nearestDistance =
            findNearestDistanceToRoute(
                midpoint,
                referenceCoordinates
            );


        if (nearestDistance <= toleranceKm) {

            sharedDistanceKm +=
                segmentDistance;

        }

    }


    if (alternativeDistanceKm === 0) {

        return {

            sharedDistanceKm: 0,

            sharePercent: 0,

            diversityPercent: 100,

            diversityBenefit: 10

        };

    }


    const sharePercent =
        (
            sharedDistanceKm /
            alternativeDistanceKm
        ) * 100;


    const diversityPercent =
        100 - sharePercent;


    const diversityBenefit =
        diversityPercent / 10;


    return {

        sharedDistanceKm:
            Number(
                sharedDistanceKm.toFixed(2)
            ),

        sharePercent:
            Number(
                sharePercent.toFixed(2)
            ),

        diversityPercent:
            Number(
                diversityPercent.toFixed(2)
            ),

        diversityBenefit:
            Number(
                diversityBenefit.toFixed(2)
            )

    };

}


// ======================================================
// URGENCY FACTOR
// ======================================================
//
// LOW      = 0.5
// MEDIUM   = 1.0
// HIGH     = 1.5
// CRITICAL = 2.0
// ======================================================

function getUrgencyFactor(urgency) {

    const value =
        String(urgency).toUpperCase();

    switch (value) {

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


// ======================================================
// DISTANCE + TIME PENALTIES
// ======================================================
//
// Alternative routes are compared against Route 1.
//
// Distance penalty:
// Extra distance % / 10
//
// Time penalty:
// Extra time % / 10
// multiplied by urgency factor.
//
// Lower penalty = better.
// ======================================================

function calculateWeightFactor(
    referenceRoute,
    alternativeRoute,
    urgency
) {

    const referenceDistance =
        referenceRoute.distanceKm;

    const alternativeDistance =
        alternativeRoute.distanceKm;

    const referenceTime =
        referenceRoute.durationMin;

    const alternativeTime =
        alternativeRoute.durationMin;


    let distancePenaltyPercent = 0;

    let timePenaltyPercent = 0;


    if (referenceDistance > 0) {

        distancePenaltyPercent =
            (
                (
                    alternativeDistance -
                    referenceDistance
                ) /
                referenceDistance
            ) * 100;

    }


    if (referenceTime > 0) {

        timePenaltyPercent =
            (
                (
                    alternativeTime -
                    referenceTime
                ) /
                referenceTime
            ) * 100;

    }


    // Never give a negative penalty.
    // If an alternative is shorter/faster,
    // its penalty for that factor is simply 0.

    distancePenaltyPercent =
        Math.max(
            0,
            distancePenaltyPercent
        );

    timePenaltyPercent =
        Math.max(
            0,
            timePenaltyPercent
        );


    const urgencyFactor =
        getUrgencyFactor(urgency);


    const distancePenalty =
        Math.min(
            10,
            distancePenaltyPercent / 10
        );


    const timePenalty =
        Math.min(
            10,
            (
                timePenaltyPercent / 10
            ) * urgencyFactor
        );


    const weightFactor =
        distancePenalty +
        timePenalty;


    return {

        distancePenaltyPercent:
            Number(
                distancePenaltyPercent.toFixed(2)
            ),

        timePenaltyPercent:
            Number(
                timePenaltyPercent.toFixed(2)
            ),

        distancePenalty:
            Number(
                distancePenalty.toFixed(2)
            ),

        timePenalty:
            Number(
                timePenalty.toFixed(2)
            ),

        urgencyFactor:
            urgencyFactor,

        weightFactor:
            Number(
                weightFactor.toFixed(2)
            )

    };

}


// ======================================================
// RAW SCORE
// ======================================================
//
// Raw Score:
//
//     Distance Penalty
//   + Time Penalty
//   - Diversity Benefit
//
// Diversity is a BENEFIT, so it is subtracted.
//
// Lower Raw Score = better.
//
// Example:
//
// Weight Factor    = 1.55
// Diversity        = 3.94
// Diversity Weight = 0.30
//
// Diversity benefit = 3.94 × 0.30
//                   = 1.182
//
// Raw Score = 1.55 - 1.182
//           = 0.368
//           ≈ 0.37
// ======================================================

function calculateRawScore(
    weightFactor,
    diversityBenefit
) {

    const weightedDiversityBenefit =
        diversityBenefit *
        DIVERSITY_WEIGHT;


    const rawScore =
        weightFactor -
        weightedDiversityBenefit;


    return Number(
        rawScore.toFixed(2)
    );

}


// ======================================================
// SAFETY SCORE
// ======================================================
//
// Safety Score is NOT relative.
//
// It is directly derived from the route's
// calculated raw penalty.
//
// Safety Score:
//
//     100 - Raw Score
//
// Higher = safer.
//
// Example:
//
// Raw Score = 0
// Safety    = 100
//
// Raw Score = 0.37
// Safety    = 99.63
//
// Raw Score = 20
// Safety    = 80
//
// Score is clamped between 0 and 100.
// ======================================================

function calculateSafetyScore(
    rawScore
) {

    let safetyScore =
        100 - rawScore;


    safetyScore =
        Math.max(
            0,
            Math.min(
                100,
                safetyScore
            )
        );


    return Number(
        safetyScore.toFixed(2)
    );

}


// ======================================================
// PROCESS ROUTES
// ======================================================

function processRoutes(
    osrmRoutes,
    urgency
) {

    const processedRoutes = [];


    // --------------------------------------------------
    // FIRST PASS
    // --------------------------------------------------

    for (
        let i = 0;
        i < osrmRoutes.length;
        i++
    ) {

        const route =
            osrmRoutes[i];


        const coordinates =
            route.geometry.coordinates;


        const distanceKm =
            route.distance / 1000;


        const durationMin =
            route.duration / 60;


        processedRoutes.push({

            routeNumber:
                i + 1,

            distanceKm:
                Number(
                    distanceKm.toFixed(2)
                ),

            durationMin:
                Number(
                    durationMin.toFixed(2)
                ),

            coordinates:
                coordinates,

            distanceMeters:
                route.distance,

            durationSeconds:
                route.duration,

            share:
                null,

            weightFactor:
                null,

            rawScore:
                null,

            safetyScore:
                null

        });

    }


    // --------------------------------------------------
    // REFERENCE ROUTE
    // --------------------------------------------------

    const referenceRoute =
        processedRoutes[0];


    // --------------------------------------------------
    // SCORE EVERY ROUTE
    // --------------------------------------------------

    for (
        let i = 0;
        i < processedRoutes.length;
        i++
    ) {

        const route =
            processedRoutes[i];


        // ==============================================
        // ROUTE 1
        // ==============================================

        if (i === 0) {

            route.share = {

                sharedDistanceKm:
                    route.distanceKm,

                sharePercent:
                    100,

                diversityPercent:
                    0,

                diversityBenefit:
                    0

            };


            route.weightFactor = {

                distancePenaltyPercent:
                    0,

                timePenaltyPercent:
                    0,

                distancePenalty:
                    0,

                timePenalty:
                    0,

                urgencyFactor:
                    getUrgencyFactor(urgency),

                weightFactor:
                    0

            };


            route.rawScore = 0;

            route.safetyScore = 100;

            continue;

        }


        // ==============================================
        // ALTERNATIVE ROUTE
        // ==============================================

        const diversity =
            calculateRouteDiversity(
                referenceRoute.coordinates,
                route.coordinates
            );


        const weight =
            calculateWeightFactor(
                referenceRoute,
                route,
                urgency
            );


        const rawScore =
            calculateRawScore(
                weight.weightFactor,
                diversity.diversityBenefit
            );


        const safetyScore =
            calculateSafetyScore(
                rawScore
            );


        route.share =
            diversity;

        route.weightFactor =
            weight;

        route.rawScore =
            rawScore;

        route.safetyScore =
            safetyScore;

    }


    return processedRoutes;

}


// ======================================================
// SELECT BEST ROUTE
// ======================================================
//
// HIGHER SAFETY SCORE = BETTER
// ======================================================

function selectBestRoute(routes) {

    let bestRoute =
        routes[0];


    for (const route of routes) {

        if (
            route.safetyScore >
            bestRoute.safetyScore
        ) {

            bestRoute = route;

        }

    }


    return bestRoute;

}


// ======================================================
// PRINT FINAL RESULT
// ======================================================

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


    // ==================================================
    // BEST ROUTE
    // ==================================================

    console.log("");

    console.log(
        "**************** BEST ROUTE ****************"
    );

    console.log("");

    console.log(
        `Route Number       : ${bestRoute.routeNumber}`
    );

    console.log(
        `Distance           : ${bestRoute.distanceKm} km`
    );

    console.log(
        `Estimated Time     : ${bestRoute.durationMin} min`
    );

    console.log(
        `Safety Score       : ${bestRoute.safetyScore}/100`
    );

    console.log(
        `Raw Risk Penalty   : ${bestRoute.rawScore}`
    );


    // ==================================================
    // ALTERNATIVE ROUTES
    // ==================================================

    console.log("");

    console.log(
        "*************** ALTERNATIVE ROUTES ***************"
    );


    let alternativeNumber = 0;


    for (const route of routes) {

        if (
            route.routeNumber ===
            bestRoute.routeNumber
        ) {

            continue;

        }


        alternativeNumber++;


        console.log("");

        console.log(
            `Alternative ${alternativeNumber}`
        );

        console.log(
            "----------------------------------------------"
        );

        console.log(
            `Route Number       : ${route.routeNumber}`
        );

        console.log(
            `Distance           : ${route.distanceKm} km`
        );

        console.log(
            `Estimated Time     : ${route.durationMin} min`
        );

        console.log(
            `Safety Score       : ${route.safetyScore}/100`
        );

        console.log(
            `Raw Risk Penalty   : ${route.rawScore}`
        );

        console.log(
            `Route Shared       : ${route.share.sharePercent}%`
        );

        console.log(
            `Route Diversity    : ${route.share.diversityPercent}%`
        );

    }


    // ==================================================
    // FINAL RECOMMENDATION
    // ==================================================

    console.log("");

    console.log(
        "================================================"
    );

    console.log(
        `RECOMMENDED ROUTE : Route ${bestRoute.routeNumber}`
    );

    console.log(
        `SAFETY SCORE      : ${bestRoute.safetyScore}/100`
    );

    console.log(
        "Higher safety score = safer route"
    );

    console.log(
        "================================================"
    );

    console.log("");

}


// ======================================================
// GET OSRM ROUTES
// ======================================================

async function getOSRMRoutes(
    source,
    destination
) {

    const url =
        "https://router.project-osrm.org/route/v1/driving/" +

        `${source.longitude},${source.latitude};` +

        `${destination.longitude},${destination.latitude}` +

        "?overview=full" +
        "&geometries=geojson" +
        "&steps=true" +
        "&annotations=true" +
        "&alternatives=3";


    const data =
        await getJSON(url);


    if (
        data.code !== "Ok" ||
        !data.routes ||
        data.routes.length === 0
    ) {

        throw new Error(
            "OSRM could not find a route"
        );

    }


    return data.routes;

}


// ======================================================
// POST /find-route
// ======================================================

async function handleFindRoute(
    req,
    res
) {

    try {

        const body =
            await readBody(req);


        let shipment;


        try {

            shipment =
                JSON.parse(body);

        } catch (error) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Request body must contain valid JSON"
                }
            );

            return;

        }


        // ------------------------------------------------
        // VALIDATION
        // ------------------------------------------------

        if (
            !shipment.source ||
            !shipment.destination
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


        if (
            typeof shipment.source !== "string" ||
            typeof shipment.destination !== "string"
        ) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Source and destination must be strings"
                }
            );

            return;

        }


        const urgency =
            String(
                shipment.urgency || "MEDIUM"
            ).toUpperCase();


        const validUrgencies = [

            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"

        ];


        if (
            !validUrgencies.includes(
                urgency
            )
        ) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Urgency must be LOW, MEDIUM, HIGH or CRITICAL"
                }
            );

            return;

        }


        // ------------------------------------------------
        // GEOCODE SOURCE
        // ------------------------------------------------

        console.log("");

        console.log(
            `Geocoding source: ${shipment.source}`
        );


        const source =
            await geocodePlace(
                shipment.source
            );


        // ------------------------------------------------
        // GEOCODE DESTINATION
        // ------------------------------------------------

        console.log(
            `Geocoding destination: ${shipment.destination}`
        );


        const destination =
            await geocodePlace(
                shipment.destination
            );


        // ------------------------------------------------
        // GET ROUTES
        // ------------------------------------------------

        console.log("");

        console.log(
            "Getting routes from OSRM..."
        );


        const osrmRoutes =
            await getOSRMRoutes(
                source,
                destination
            );


        console.log(
            `OSRM returned ${osrmRoutes.length} routes`
        );


        // ------------------------------------------------
        // PROCESS ROUTES
        // ------------------------------------------------

        const routes =
            processRoutes(
                osrmRoutes,
                urgency
            );


        // ------------------------------------------------
        // SELECT BEST
        // ------------------------------------------------

        const bestRoute =
            selectBestRoute(
                routes
            );


        // ------------------------------------------------
        // PRINT RESULT
        // ------------------------------------------------

        printFinalResult(
            routes,
            bestRoute
        );


        // ------------------------------------------------
        // SEND RESPONSE
        // ------------------------------------------------

        sendJSON(
            res,
            200,
            {

                source:
                    source,

                destination:
                    destination,

                urgency:
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

                routes:
                    routes

            }
        );


    } catch (error) {

        console.error("");

        console.error(
            "ERROR:",
            error.message
        );


        sendJSON(
            res,
            500,
            {
                error:
                    error.message
            }
        );

    }

}


// ======================================================
// GET /routes
// ======================================================

function handleRoutes(
    req,
    res
) {

    sendJSON(
        res,
        200,
        {
            message:
                "Use POST /find-route to calculate routes"
        }
    );

}


// ======================================================
// HOME
// ======================================================

function handleHome(
    req,
    res
) {

    res.statusCode = 200;

    res.setHeader(
        "Content-Type",
        "text/plain"
    );

    res.end(
        "LOGISTICS PLATFORM IS RUNNING"
    );

}


// ======================================================
// SERVER
// ======================================================

const server =
    http.createServer(
        async (req, res) => {

            if (
                req.method === "POST" &&
                req.url === "/find-route"
            ) {

                await handleFindRoute(
                    req,
                    res
                );

            }

            else if (
                req.method === "GET" &&
                req.url === "/routes"
            ) {

                handleRoutes(
                    req,
                    res
                );

            }

            else if (
                req.method === "GET" &&
                req.url === "/"
            ) {

                handleHome(
                    req,
                    res
                );

            }

            else {

                sendJSON(
                    res,
                    404,
                    {
                        error:
                            "Endpoint not found"
                    }
                );

            }

        }
    );


// ======================================================
// START SERVER
// ======================================================

server.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "             SIH LOGISTICS SERVER"
        );

        console.log(
            "================================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            "POST /find-route"
        );

        console.log(
            "GET  /routes"
        );

        console.log(
            "GET  /"
        );

        console.log(
            "================================================"
        );

        console.log("");

    }
);