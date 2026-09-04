// ========================================
// SIH LOGISTICS - CHECKPOINT TEST
// OSRM + 5 KM CHECKPOINTS + ETA WEATHER
// No npm packages required
// ========================================

const https = require("https");


// ========================================
// TEST COORDINATES
// ========================================

const source = [91.774975, 26.174722];
const destination = [91.879421, 25.577511];


// ========================================
// API URLs
// ========================================

const OSRM_URL =
    "https://router.project-osrm.org";

const OPEN_METEO_URL =
    "https://api.open-meteo.com/v1/forecast";


// ========================================
// HTTP GET JSON
// ========================================

function getJSON(url) {

    return new Promise((resolve, reject) => {

        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent":
                        "SIH-Logistics-Prototype/1.0",

                    "Accept":
                        "application/json"
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

                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {

                            reject(
                                new Error(
                                    `HTTP ${response.statusCode}: ${data.substring(0, 300)}`
                                )
                            );

                            return;
                        }

                        try {

                            resolve(
                                JSON.parse(data)
                            );

                        } catch (error) {

                            reject(
                                new Error(
                                    "Invalid JSON returned by API"
                                )
                            );
                        }
                    }
                );
            }
        );

        request.on(
            "error",
            error => {
                reject(error);
            }
        );
    });
}


// ========================================
// HAVERSINE DISTANCE
// ========================================

function getDistance(
    lon1,
    lat1,
    lon2,
    lat2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;

    const dLon =
        (lon2 - lon1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(
            lat1 * Math.PI / 180
        )

        *

        Math.cos(
            lat2 * Math.PI / 180
        )

        *

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


// ========================================
// GENERATE 5 KM CHECKPOINTS
// ========================================
//
// Checkpoints are approximately every 5 km.
//
// We ALWAYS include:
// - Start
// - 5 km
// - 10 km
// - ...
// - Destination
//
// ETA is calculated from OSRM segment
// durations.
//

function generateCheckpoints(
    coordinates,
    durations,
    intervalKm = 5
) {

    const checkpoints = [];

    let accumulatedDistance = 0;
    let accumulatedTime = 0;

    let nextCheckpoint =
        intervalKm;


    // ------------------------------------
    // START CHECKPOINT
    // ------------------------------------

    checkpoints.push({
        checkpoint: 1,
        coordinate: coordinates[0],
        distanceFromStartKm: 0,
        etaSeconds: 0
    });


    // ------------------------------------
    // WALK THROUGH ROUTE SEGMENTS
    // ------------------------------------

    for (
        let i = 1;
        i < coordinates.length;
        i++
    ) {

        const [
            lon1,
            lat1
        ] = coordinates[i - 1];

        const [
            lon2,
            lat2
        ] = coordinates[i];


        const segmentDistance =
            getDistance(
                lon1,
                lat1,
                lon2,
                lat2
            );


        const segmentTime =
            durations[i - 1] || 0;


        const previousDistance =
            accumulatedDistance;


        const previousTime =
            accumulatedTime;


        accumulatedDistance +=
            segmentDistance;

        accumulatedTime +=
            segmentTime;


        // --------------------------------
        // CREATE CHECKPOINTS
        // --------------------------------

        while (
            accumulatedDistance >=
            nextCheckpoint
        ) {

            const distanceIntoSegment =
                nextCheckpoint -
                previousDistance;


            let ratio = 0;

            if (
                segmentDistance > 0
            ) {

                ratio =
                    distanceIntoSegment /
                    segmentDistance;
            }


            ratio =
                Math.max(
                    0,
                    Math.min(
                        1,
                        ratio
                    )
                );


            const checkpointLon =
                lon1 +
                (
                    lon2 - lon1
                ) *
                ratio;


            const checkpointLat =
                lat1 +
                (
                    lat2 - lat1
                ) *
                ratio;


            const checkpointTime =
                previousTime +
                (
                    segmentTime *
                    ratio
                );


            checkpoints.push({

                checkpoint:
                    checkpoints.length + 1,

                coordinate:
                    [
                        checkpointLon,
                        checkpointLat
                    ],

                distanceFromStartKm:
                    Number(
                        nextCheckpoint.toFixed(2)
                    ),

                etaSeconds:
                    Math.round(
                        checkpointTime
                    )
            });


            nextCheckpoint +=
                intervalKm;
        }
    }


    // ------------------------------------
    // GUARANTEE DESTINATION
    // ------------------------------------

    const finalDistance =
        accumulatedDistance;


    const finalTime =
        accumulatedTime;


    const lastCheckpoint =
        checkpoints[
            checkpoints.length - 1
        ];


    if (
        !lastCheckpoint ||

        getDistance(
            lastCheckpoint.coordinate[0],
            lastCheckpoint.coordinate[1],

            destination[0],
            destination[1]
        ) > 0.01
    ) {

        checkpoints.push({

            checkpoint:
                checkpoints.length + 1,

            coordinate:
                coordinates[
                    coordinates.length - 1
                ],

            distanceFromStartKm:
                Number(
                    finalDistance.toFixed(2)
                ),

            etaSeconds:
                Math.round(
                    finalTime
                )
        });
    }


    return checkpoints;
}


// ========================================
// GENERATE ROUTE SEGMENTS
// ========================================
//
// Each OSRM annotation corresponds to a
// segment between two geometry points.
//
// We use:
// distance
// duration
// speed
//

function generateSegments(
    coordinates,
    distances,
    durations
) {

    const segments = [];

    for (
        let i = 0;
        i < distances.length;
        i++
    ) {

        const distanceMeters =
            distances[i];

        const durationSeconds =
            durations[i];


        const distanceKm =
            distanceMeters / 1000;


        let speedKmh = 0;


        if (
            durationSeconds > 0
        ) {

            speedKmh =
                distanceKm /
                (
                    durationSeconds /
                    3600
                );
        }


        segments.push({

            segment:
                i + 1,

            start:
                coordinates[i],

            end:
                coordinates[i + 1],

            distanceKm:
                Number(
                    distanceKm.toFixed(4)
                ),

            durationSeconds:
                Number(
                    durationSeconds.toFixed(2)
                ),

            speedKmh:
                Number(
                    speedKmh.toFixed(2)
                )
        });
    }


    return segments;
}


// ========================================
// NORMALIZE SPEED
// ========================================
//
// Higher speed = better.
//
// Lowest speed = 0
// Highest speed = 10
//

function normalizeSpeed(
    segments
) {

    if (
        segments.length === 0
    ) {

        return segments;
    }


    let minSpeed =
        segments[0].speedKmh;

    let maxSpeed =
        segments[0].speedKmh;


    for (
        const segment of segments
    ) {

        if (
            segment.speedKmh <
            minSpeed
        ) {

            minSpeed =
                segment.speedKmh;
        }


        if (
            segment.speedKmh >
            maxSpeed
        ) {

            maxSpeed =
                segment.speedKmh;
        }
    }


    for (
        const segment of segments
    ) {

        let score = 0;


        if (
            maxSpeed !== minSpeed
        ) {

            score =
                10 *
                (
                    (
                        segment.speedKmh -
                        minSpeed
                    ) /
                    (
                        maxSpeed -
                        minSpeed
                    )
                );
        }


        segment.speedScore =
            Number(
                score.toFixed(2)
            );
    }


    return segments;
}


// ========================================
// AFFECTEDNESS
// ========================================
//
// Faster road = less affected.
//
// Therefore:
//
// affectedness = 10 - speedScore
//
// 0 = least affected
// 10 = most affected
//

function addAffectedness(
    segments
) {

    for (
        const segment of segments
    ) {

        segment.affectedness =
            Number(
                (
                    10 -
                    segment.speedScore
                ).toFixed(2)
            );
    }


    return segments;
}


// ========================================
// WEATHER SEVERITY
// ========================================
//
// Open-Meteo WMO weather codes.
//

function calculateWeatherSeverity(
    weatherCode
) {

    // Clear

    if (
        weatherCode === 0
    ) {
        return 0;
    }


    // Cloudy

    if (
        weatherCode >= 1 &&
        weatherCode <= 3
    ) {
        return 0.5;
    }


    // Fog

    if (
        weatherCode === 45 ||
        weatherCode === 48
    ) {
        return 1;
    }


    // Drizzle

    if (
        weatherCode === 51 ||
        weatherCode === 53 ||
        weatherCode === 55
    ) {
        return 1.5;
    }


    // Freezing drizzle

    if (
        weatherCode === 56 ||
        weatherCode === 57
    ) {
        return 2;
    }


    // Rain

    if (
        weatherCode === 61 ||
        weatherCode === 63
    ) {
        return 2;
    }


    // Heavy rain

    if (
        weatherCode === 65
    ) {
        return 2.5;
    }


    // Freezing rain

    if (
        weatherCode === 66 ||
        weatherCode === 67
    ) {
        return 3;
    }


    // Snow

    if (
        weatherCode === 71 ||
        weatherCode === 73 ||
        weatherCode === 75 ||
        weatherCode === 77
    ) {
        return 3;
    }


    // Snow showers

    if (
        weatherCode === 85 ||
        weatherCode === 86
    ) {
        return 3.5;
    }


    // Rain showers

    if (
        weatherCode === 80 ||
        weatherCode === 81
    ) {
        return 2;
    }


    // Heavy showers

    if (
        weatherCode === 82
    ) {
        return 3;
    }


    // Thunderstorm

    if (
        weatherCode === 95
    ) {
        return 4;
    }


    // Thunderstorm + hail

    if (
        weatherCode === 96 ||
        weatherCode === 99
    ) {
        return 5;
    }


    return 0;
}


// ========================================
// WEATHER SCORE
// ========================================

function calculateCheckpointWeatherScore(
    weatherSeverity,
    affectedness
) {

    return (
        weatherSeverity *
        affectedness
    );
}


// ========================================
// MEDIAN
// ========================================

function calculateMedian(
    values
) {

    if (
        values.length === 0
    ) {
        return 0;
    }


    const sorted =
        [...values].sort(
            (a, b) => a - b
        );


    const middle =
        Math.floor(
            sorted.length / 2
        );


    if (
        sorted.length % 2 === 0
    ) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }


    return sorted[middle];
}


// ========================================
// ROUTE WEATHER SCORE
// ========================================
//
// Final weather score:
//
// (Average + Median) / 2
//

function calculateRouteWeatherScore(
    checkpoints
) {

    const scores =
        checkpoints
            .map(
                checkpoint =>
                    checkpoint.weatherScore
            )
            .filter(
                score =>
                    typeof score === "number"
            );


    if (
        scores.length === 0
    ) {

        return 0;
    }


    const average =
        scores.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        scores.length;


    const median =
        calculateMedian(
            scores
        );


    return Number(
        (
            (
                average +
                median
            ) / 2
        ).toFixed(2)
    );
}


// ========================================
// CONVERT ETA TO INDIA TIME
// ========================================

function getWeatherAtETA(
    hourlyData,
    etaSeconds
) {

    if (
        !hourlyData ||
        !hourlyData.time
    ) {

        return null;
    }


    const etaDate =
        new Date(
            Date.now() +
            etaSeconds * 1000
        );


    const etaISOString =
        etaDate.toISOString();


    const etaHour =
        etaISOString.substring(
            0,
            13
        );


    let closestIndex = 0;

    let smallestDifference =
        Infinity;


    for (
        let i = 0;
        i < hourlyData.time.length;
        i++
    ) {

        const forecastTime =
            new Date(
                hourlyData.time[i]
            );


        const difference =
            Math.abs(
                forecastTime.getTime() -
                etaDate.getTime()
            );


        if (
            difference <
            smallestDifference
        ) {

            smallestDifference =
                difference;

            closestIndex =
                i;
        }
    }


    return {

        time:
            hourlyData.time[
                closestIndex
            ],

        temperature:
            hourlyData.temperature_2m[
                closestIndex
            ],

        precipitation:
            hourlyData.precipitation[
                closestIndex
            ],

        weatherCode:
            hourlyData.weather_code[
                closestIndex
            ]
    };
}


// ========================================
// GET WEATHER
// ========================================

async function getWeather(
    latitude,
    longitude
) {

    const url =
        `${OPEN_METEO_URL}` +

        `?latitude=${latitude}` +

        `&longitude=${longitude}` +

        "&hourly=temperature_2m,precipitation,weather_code" +

        "&forecast_days=2" +

        "&timezone=Asia%2FKolkata";


    const data =
        await getJSON(url);


    return data.hourly;
}


// ========================================
// PROCESS CHECKPOINT WEATHER
// ========================================

async function processCheckpointWeather(
    checkpoints,
    segments
) {

    // ------------------------------------
    // For each checkpoint
    // ------------------------------------

    for (
        const checkpoint of checkpoints
    ) {

        const [
            longitude,
            latitude
        ] = checkpoint.coordinate;


        console.log(
            `\nWeather request for checkpoint ${checkpoint.checkpoint}`
        );


        console.log(
            `Location: ${latitude}, ${longitude}`
        );


        console.log(
            `ETA: ${Math.round(checkpoint.etaSeconds / 60)} minutes`
        );


        try {

            const hourly =
                await getWeather(
                    latitude,
                    longitude
                );


            const weather =
                getWeatherAtETA(
                    hourly,
                    checkpoint.etaSeconds
                );


            if (
                !weather
            ) {

                checkpoint.weatherCode =
                    null;

                checkpoint.weatherSeverity =
                    0;

                checkpoint.affectedness =
                    0;

                checkpoint.weatherScore =
                    0;

                continue;
            }


            // --------------------------------
            // Find nearest route segment
            // --------------------------------

            let nearestSegment =
                segments[0];

            let nearestDistance =
                Infinity;


            for (
                const segment of segments
            ) {

                const distance =
                    getDistance(
                        longitude,
                        latitude,

                        segment.start[0],
                        segment.start[1]
                    );


                if (
                    distance <
                    nearestDistance
                ) {

                    nearestDistance =
                        distance;

                    nearestSegment =
                        segment;
                }
            }


            const severity =
                calculateWeatherSeverity(
                    weather.weatherCode
                );


            const affectedness =
                nearestSegment
                    ? nearestSegment.affectedness
                    : 0;


            const weatherScore =
                calculateCheckpointWeatherScore(
                    severity,
                    affectedness
                );


            checkpoint.weatherTime =
                weather.time;


            checkpoint.temperature =
                weather.temperature;


            checkpoint.precipitation =
                weather.precipitation;


            checkpoint.weatherCode =
                weather.weatherCode;


            checkpoint.weatherSeverity =
                severity;


            checkpoint.affectedness =
                Number(
                    affectedness.toFixed(2)
                );


            checkpoint.weatherScore =
                Number(
                    weatherScore.toFixed(2)
                );


            console.log(
                `Weather code: ${weather.weatherCode}`
            );


            console.log(
                `Severity: ${severity}`
            );


            console.log(
                `Affectedness: ${affectedness.toFixed(2)}`
            );


            console.log(
                `Weather score: ${weatherScore.toFixed(2)}`
            );


        } catch (error) {

            console.log(
                `Weather request failed: ${error.message}`
            );


            checkpoint.weatherCode =
                null;

            checkpoint.weatherSeverity =
                0;

            checkpoint.affectedness =
                0;

            checkpoint.weatherScore =
                0;
        }
    }


    return checkpoints;
}


// ========================================
// NORMALIZE ROUTE VALUE
// ========================================

function normalizeRouteValue(
    routes,
    parameter
) {

    if (
        routes.length === 0
    ) {

        return routes;
    }


    let min =
        routes[0][parameter];

    let max =
        routes[0][parameter];


    for (
        const route of routes
    ) {

        if (
            route[parameter] < min
        ) {

            min =
                route[parameter];
        }


        if (
            route[parameter] > max
        ) {

            max =
                route[parameter];
        }
    }


    for (
        const route of routes
    ) {

        if (
            max === min
        ) {

            route[
                `${parameter}Score`
            ] = 0;

        } else {

            route[
                `${parameter}Score`
            ] =
                Number(
                    (
                        10 *
                        (
                            (
                                route[parameter] -
                                min
                            ) /
                            (
                                max -
                                min
                            )
                        )
                    ).toFixed(2)
                );
        }
    }


    return routes;
}


// ========================================
// PROCESS ONE OSRM ROUTE
// ========================================

async function processRoute(
    route,
    routeNumber
) {

    console.log(
        "\n----------------------------------------"
    );

    console.log(
        `PROCESSING ROUTE ${routeNumber}`
    );

    console.log(
        "----------------------------------------"
    );


    const coordinates =
        route.geometry.coordinates;


    const annotation =
        route.legs &&
        route.legs[0] &&
        route.legs[0].annotation
            ? route.legs[0].annotation
            : null;


    if (
        !annotation
    ) {

        throw new Error(
            "OSRM annotation data not available"
        );
    }


    const distances =
        annotation.distance || [];


    const durations =
        annotation.duration || [];


    console.log(
        `Polyline points: ${coordinates.length}`
    );


    console.log(
        `OSRM segments: ${distances.length}`
    );


    // ------------------------------------
    // SEGMENTS
    // ------------------------------------

    let segments =
        generateSegments(
            coordinates,
            distances,
            durations
        );


    segments =
        normalizeSpeed(
            segments
        );


    segments =
        addAffectedness(
            segments
        );


    // ------------------------------------
    // CHECKPOINTS
    // ------------------------------------

    const checkpoints =
        generateCheckpoints(
            coordinates,
            durations,
            5
        );


    console.log(
        `Weather checkpoints: ${checkpoints.length}`
    );


    // ------------------------------------
    // WEATHER
    // ------------------------------------

    await processCheckpointWeather(
        checkpoints,
        segments
    );


    // ------------------------------------
    // ROUTE WEATHER SCORE
    // ------------------------------------

    const weatherScore =
        calculateRouteWeatherScore(
            checkpoints
        );


    // ------------------------------------
    // ROUTE DATA
    // ------------------------------------

    return {

        routeNumber:

            routeNumber,


        distanceKm:

            Number(
                (
                    route.distance /
                    1000
                ).toFixed(2)
            ),


        durationMinutes:

            Number(
                (
                    route.duration /
                    60
                ).toFixed(2)
            ),


        durationSeconds:

            Number(
                route.duration.toFixed(2)
            ),


        osrmWeight:

            route.weight,


        coordinates:

            coordinates,


        segments:

            segments,


        checkpoints:

            checkpoints,


        weatherScore:

            weatherScore
    };
}


// ========================================
// GET OSRM ROUTES
// ========================================

async function getOSRMRoutes() {

    const coordinateString =
        `${source[0]},${source[1]};` +
        `${destination[0]},${destination[1]}`;


    const url =
        `${OSRM_URL}/route/v1/driving/` +
        coordinateString +

        "?overview=full" +

        "&geometries=geojson" +

        "&steps=true" +

        "&annotations=true" +

        "&alternatives=3";


    console.log(
        "\n========================================"
    );

    console.log(
        "   REQUESTING OSRM ROUTES"
    );

    console.log(
        "========================================"
    );


    console.log(
        "\nRequest URL:"
    );


    console.log(url);


    const data =
        await getJSON(url);


    if (
        data.code !== "Ok"
    ) {

        throw new Error(
            `OSRM returned ${data.code}`
        );
    }


    return data.routes;
}


// ========================================
// MAIN
// ========================================

async function main() {

    console.log(
        "\n========================================"
    );

    console.log(
        "      OSRM SMART ROUTE TEST"
    );

    console.log(
        "========================================"
    );


    try {

        // --------------------------------
        // GET ROUTES
        // --------------------------------

        const osrmRoutes =
            await getOSRMRoutes();


        console.log(
            `\nOSRM returned ${osrmRoutes.length} route(s).`
        );


        // --------------------------------
        // PROCESS ROUTES
        // --------------------------------

        const processedRoutes = [];


        for (
            let i = 0;
            i < osrmRoutes.length;
            i++
        ) {

            const processed =
                await processRoute(
                    osrmRoutes[i],
                    i + 1
                );


            processedRoutes.push(
                processed
            );
        }


        // --------------------------------
        // ROUTE COMPARISON
        // --------------------------------

        console.log(
            "\n========================================"
        );

        console.log(
            "          ROUTE COMPARISON"
        );

        console.log(
            "========================================"
        );


        for (
            const route of processedRoutes
        ) {

            console.log(
                `\nROUTE ${route.routeNumber}`
            );


            console.log(
                `Distance       : ${route.distanceKm} km`
            );


            console.log(
                `Time           : ${route.durationMinutes} min`
            );


            console.log(
                `OSRM Weight    : ${route.osrmWeight}`
            );


            console.log(
                `Weather Score  : ${route.weatherScore}`
            );


            console.log(
                `Checkpoints    : ${route.checkpoints.length}`
            );
        }


        // --------------------------------
        // DISTANCE NORMALIZATION
        // --------------------------------

        normalizeRouteValue(
            processedRoutes,
            "distanceKm"
        );


        // --------------------------------
        // TIME NORMALIZATION
        // --------------------------------

        normalizeRouteValue(
            processedRoutes,
            "durationMinutes"
        );


        // --------------------------------
        // FINAL CURRENT TEST SCORE
        // --------------------------------
        //
        // NOTE:
        // This is NOT the final SIH
        // logistics score.
        //
        // We are only keeping it here
        // for comparison.
        //

        for (
            const route of processedRoutes
        ) {

            const distanceScore =
                route.distanceKmScore;


            const timeScore =
                route.durationMinutesScore;


            const weatherScore =
                route.weatherScore;


            route.finalTestScore =
                Number(
                    (
                        (
                            distanceScore +
                            timeScore
                        ) / 2
                    ).toFixed(2)
                );
        }


        // --------------------------------
        // PRINT FINAL COMPARISON
        // --------------------------------

        console.log(
            "\n========================================"
        );

        console.log(
            "       FINAL ROUTE COMPARISON"
        );

        console.log(
            "========================================"
        );


        for (
            const route of processedRoutes
        ) {

            console.log(
                `\nROUTE ${route.routeNumber}`
            );


            console.log(
                `Distance       : ${route.distanceKm} km`
            );


            console.log(
                `Time           : ${route.durationMinutes} min`
            );


            console.log(
                `Distance Score : ${route.distanceKmScore} / 10`
            );


            console.log(
                `Time Score     : ${route.durationMinutesScore} / 10`
            );


            console.log(
                `Weather Score  : ${route.weatherScore}`
            );


            console.log(
                `Checkpoints    : ${route.checkpoints.length}`
            );
        }


        // --------------------------------
        // SAMPLE CHECKPOINTS
        // --------------------------------

        if (
            processedRoutes.length > 0
        ) {

            const route =
                processedRoutes[0];


            console.log(
                "\n========================================"
            );

            console.log(
                "       ROUTE 1 CHECKPOINT SAMPLE"
            );

            console.log(
                "========================================"
            );


            route.checkpoints
                .slice(0, 10)
                .forEach(
                    checkpoint => {

                        console.log(
                            `\nCP ${checkpoint.checkpoint}`
                        );


                        console.log(
                            `Distance: ${checkpoint.distanceFromStartKm} km`
                        );


                        console.log(
                            `ETA: ${Math.round(checkpoint.etaSeconds / 60)} min`
                        );


                        console.log(
                            `Weather code: ${checkpoint.weatherCode}`
                        );


                        console.log(
                            `Severity: ${checkpoint.weatherSeverity}`
                        );


                        console.log(
                            `Affectedness: ${checkpoint.affectedness}`
                        );


                        console.log(
                            `Weather score: ${checkpoint.weatherScore}`
                        );
                    }
                );
        }


        console.log(
            "\n========================================"
        );

        console.log(
            "             TEST COMPLETE"
        );

        console.log(
            "========================================"
        );


    } catch (error) {

        console.error(
            "\n========================================"
        );

        console.error(
            "ERROR"
        );

        console.error(
            "========================================"
        );


        console.error(
            error.message
        );
    }
}


// ========================================
// RUN
// ========================================

main();