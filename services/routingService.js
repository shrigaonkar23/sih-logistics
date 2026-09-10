const https = require("https");

// ============================================================
// HTTP GET JSON
// ============================================================

function getJSON(url) {

    return new Promise(
        (resolve, reject) => {

            https.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            "SIH-Logistics/1.0",

                        "Accept":
                            "application/json"
                    }
                },
                response => {

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
        }
    );
}

// ============================================================
// ROUTE DISTANCE
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
// ALTERNATIVE WAYPOINTS
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

    const deltaLat =
        destinationLat -
        sourceLat;

    const deltaLon =
        destinationLon -
        sourceLon;

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

    const offset = 0.12;

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
// SINGLE OSRM ROUTE
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
// MULTIPLE OSRM ROUTES
// ============================================================

async function getOSRMRoutes(
    source,
    destination
) {

    console.log("");
    console.log(
        "========== ROUTE GENERATION =========="
    );

    const routes = [];

    // --------------------------------------------------------
    // ROUTE 1
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

    if (directRoute) {

        routes.push(
            directRoute
        );

        console.log(
            "Route 1 generated successfully"
        );
    }

    // --------------------------------------------------------
    // ALTERNATIVE WAYPOINTS
    // --------------------------------------------------------

    const waypoints =
        generateAlternativeWaypoints(
            source,
            destination
        );

    // --------------------------------------------------------
    // ROUTE 2
    // --------------------------------------------------------

    if (waypoints[0]) {

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
        }
    }

    // --------------------------------------------------------
    // ROUTE 3
    // --------------------------------------------------------

    if (waypoints[1]) {

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
        }
    }

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

    if (routes.length === 0) {

        throw new Error(
            "OSRM could not find any route"
        );
    }

    return routes;
}

// ============================================================
// CONVERT OSRM ROUTE
// ============================================================

function convertOSRMRoute(route) {

    return {

        distanceKm:
            route.distance / 1000,

        durationMin:
            route.duration / 60,

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
// EXPORTS
// ============================================================

module.exports = {

    getOSRMRoutes,

    convertOSRMRoute,

    haversineDistance
};