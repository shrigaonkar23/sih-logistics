// ============================================================
// SILP - HAZARD / ENVIRONMENTAL SERVICE
// ============================================================
//
// Architecture:
//
// 1. Generate candidate routes
// 2. Generate 5% checkpoints for ALL routes
// 3. Deduplicate shared checkpoints
// 4. Collect live weather data
// 5. Assess each route locally
// 6. Calculate hazard risk
// 7. Safety score = 100 - (hazardRisk * 100)
//
// IMPORTANT:
// - Distance is NOT part of safety.
// - Duration is NOT part of safety.
// - Weather/disaster conditions determine safety.
// - Network calls happen ONLY during data collection.
// - Route assessment itself is local computation.
//
// RATE-LIMIT PROTECTION:
// - Weather requests are NOT fired all at once.
// - Requests are processed in small batches.
// - A short delay is inserted between batches.
// - HTTP 429 responses are retried with backoff.
// - Retry-After is respected when supplied.
// - Duplicate coordinates are cached within the collection run.
// ============================================================

const https = require("https");

// ============================================================
// CONFIGURATION
// ============================================================

const CHECKPOINT_PERCENTAGE_STEP = 5;
const REQUEST_TIMEOUT_MS = 10000;

// ------------------------------------------------------------
// WEATHER RATE-LIMIT CONFIGURATION
// ------------------------------------------------------------

// Number of Open-Meteo requests allowed to run simultaneously.
const WEATHER_BATCH_SIZE = 4;

// Delay between request batches.
const WEATHER_BATCH_DELAY_MS = 1200;

// Maximum number of retries after HTTP 429.
const WEATHER_MAX_RETRIES = 3;

// Initial retry delay for HTTP 429.
const WEATHER_INITIAL_RETRY_DELAY_MS = 2000;

// Maximum retry delay.
const WEATHER_MAX_RETRY_DELAY_MS = 15000;

// ============================================================
// UTILITY - SLEEP
// ============================================================

function sleep(milliseconds) {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

// ============================================================
// HTTPS JSON REQUEST
// ============================================================
//
// Returns parsed JSON.
//
// IMPORTANT:
// HTTP status is preserved in the error so fetchWeather()
// can specifically identify HTTP 429 and retry it.
//

function getJSON(url) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent": "SILP-Logistics/0.4"
                }
            },
            response => {
                let data = "";

                response.setEncoding("utf8");

                response.on("data", chunk => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (settled) {
                        return;
                    }

                    settled = true;

                    if (
                        response.statusCode < 200 ||
                        response.statusCode >= 300
                    ) {
                        const error = new Error(
                            `HTTP ${response.statusCode}`
                        );

                        error.statusCode =
                            response.statusCode;

                        error.retryAfter =
                            response.headers[
                                "retry-after"
                            ] || null;

                        reject(error);
                        return;
                    }

                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        const jsonError = new Error(
                            "Invalid JSON response"
                        );

                        jsonError.statusCode =
                            response.statusCode;

                        reject(jsonError);
                    }
                });
            }
        );

        request.setTimeout(
            REQUEST_TIMEOUT_MS,
            () => {
                if (settled) {
                    return;
                }

                request.destroy(
                    new Error("Request timeout")
                );
            }
        );

        request.on("error", error => {
            if (settled) {
                return;
            }

            settled = true;
            reject(error);
        });
    });
}

// ============================================================
// RETRY DELAY
// ============================================================

function getRetryDelay(error, retryNumber) {
    // --------------------------------------------------------
    // Prefer Retry-After supplied by the API.
    // --------------------------------------------------------

    if (error && error.retryAfter) {
        const retryAfterValue =
            Number(error.retryAfter);

        if (
            Number.isFinite(retryAfterValue) &&
            retryAfterValue >= 0
        ) {
            return Math.min(
                retryAfterValue * 1000,
                WEATHER_MAX_RETRY_DELAY_MS
            );
        }

        // Retry-After may also be an HTTP date.
        const retryDate =
            Date.parse(error.retryAfter);

        if (Number.isFinite(retryDate)) {
            const waitTime =
                retryDate - Date.now();

            if (waitTime > 0) {
                return Math.min(
                    waitTime,
                    WEATHER_MAX_RETRY_DELAY_MS
                );
            }
        }
    }

    // --------------------------------------------------------
    // Exponential backoff.
    //
    // Retry 1 -> 2 seconds
    // Retry 2 -> 4 seconds
    // Retry 3 -> 8 seconds
    // --------------------------------------------------------

    const exponentialDelay =
        WEATHER_INITIAL_RETRY_DELAY_MS *
        Math.pow(2, Math.max(0, retryNumber - 1));

    return Math.min(
        exponentialDelay,
        WEATHER_MAX_RETRY_DELAY_MS
    );
}

// ============================================================
// DISTANCE
// ============================================================

function distanceKm(pointA, pointB) {
    if (
        !Array.isArray(pointA) ||
        !Array.isArray(pointB)
    ) {
        return 0;
    }

    const lng1 = Number(pointA[0]);
    const lat1 = Number(pointA[1]);
    const lng2 = Number(pointB[0]);
    const lat2 = Number(pointB[1]);

    if (
        !Number.isFinite(lng1) ||
        !Number.isFinite(lat1) ||
        !Number.isFinite(lng2) ||
        !Number.isFinite(lat2)
    ) {
        return 0;
    }

    const earthRadiusKm = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;

    const dLng =
        (lng2 - lng1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            lat1 * Math.PI / 180
        ) *
        Math.cos(
            lat2 * Math.PI / 180
        ) *
        Math.sin(dLng / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadiusKm * c;
}

// ============================================================
// ROUTE LENGTH
// ============================================================

function calculateRouteLength(coordinates) {
    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {
        return 0;
    }

    let total = 0;

    for (
        let i = 1;
        i < coordinates.length;
        i++
    ) {
        total += distanceKm(
            coordinates[i - 1],
            coordinates[i]
        );
    }

    return total;
}

// ============================================================
// GET ACTUAL ROUTE POINT AT PERCENTAGE
// ============================================================

function getPointAtRouteProgress(
    coordinates,
    percentage
) {
    if (
        !Array.isArray(coordinates) ||
        coordinates.length === 0
    ) {
        return null;
    }

    if (coordinates.length === 1) {
        return coordinates[0];
    }

    const targetPercentage = Math.max(
        0,
        Math.min(
            100,
            Number(percentage)
        )
    );

    const totalDistance =
        calculateRouteLength(
            coordinates
        );

    if (totalDistance <= 0) {
        return coordinates[0];
    }

    const targetDistance =
        totalDistance *
        targetPercentage /
        100;

    let cumulativeDistance = 0;

    for (
        let i = 1;
        i < coordinates.length;
        i++
    ) {
        const start =
            coordinates[i - 1];

        const end =
            coordinates[i];

        const segmentDistance =
            distanceKm(
                start,
                end
            );

        const nextDistance =
            cumulativeDistance +
            segmentDistance;

        if (
            targetDistance <=
            nextDistance
        ) {
            if (segmentDistance <= 0) {
                return end;
            }

            const ratio =
                (
                    targetDistance -
                    cumulativeDistance
                ) /
                segmentDistance;

            return [
                start[0] +
                    (
                        end[0] -
                        start[0]
                    ) *
                    ratio,

                start[1] +
                    (
                        end[1] -
                        start[1]
                    ) *
                    ratio
            ];
        }

        cumulativeDistance =
            nextDistance;
    }

    return coordinates[
        coordinates.length - 1
    ];
}

// ============================================================
// GENERATE 5% ROUTE CHECKPOINTS
// ============================================================

function generateRouteCheckpoints(
    coordinates,
    percentageStep =
        CHECKPOINT_PERCENTAGE_STEP
) {
    if (
        !Array.isArray(coordinates) ||
        coordinates.length === 0
    ) {
        return [];
    }

    const checkpoints = [];

    const step = Math.max(
        1,
        Number(percentageStep) ||
            CHECKPOINT_PERCENTAGE_STEP
    );

    for (
        let percentage = 0;
        percentage <= 100;
        percentage += step
    ) {
        const coordinate =
            getPointAtRouteProgress(
                coordinates,
                percentage
            );

        if (!coordinate) {
            continue;
        }

        checkpoints.push({
            progress: percentage,
            coordinate: [
                Number(coordinate[0]),
                Number(coordinate[1])
            ]
        });
    }

    // Guarantee exact destination.

    const last =
        checkpoints[
            checkpoints.length - 1
        ];

    if (
        !last ||
        last.progress !== 100
    ) {
        const destination =
            coordinates[
                coordinates.length - 1
            ];

        checkpoints.push({
            progress: 100,
            coordinate: [
                Number(destination[0]),
                Number(destination[1])
            ]
        });
    }

    return checkpoints;
}

// ============================================================
// COORDINATE KEY
// ============================================================
//
// 4 decimal places gives roughly 10 m-level geographic
// precision, which is more than enough for checkpoint
// deduplication.
//

function coordinateKey(coordinate) {
    return [
        Number(
            coordinate[0]
        ).toFixed(4),

        Number(
            coordinate[1]
        ).toFixed(4)
    ].join(",");
}

// ============================================================
// RAINFALL RISK
// ============================================================

function calculateRainRisk(
    precipitation,
    precipitationProbability
) {
    const rain =
        Number(precipitation) || 0;

    const probability =
        Number(
            precipitationProbability
        ) || 0;

    const rainAmountRisk =
        Math.min(
            rain / 20,
            1
        );

    const probabilityRisk =
        probability / 100;

    return Math.min(
        1,
        rainAmountRisk * 0.7 +
            probabilityRisk * 0.3
    );
}

// ============================================================
// WEATHER CODE RISK
// ============================================================

function calculateWeatherCodeRisk(
    weatherCode
) {
    const code =
        Number(weatherCode);

    if (!Number.isFinite(code)) {
        return 0;
    }

    // Thunderstorms
    if (code >= 95) {
        return 1.0;
    }

    // Heavy rain showers
    if (
        code >= 80 &&
        code <= 82
    ) {
        return 0.75;
    }

    // Rain
    if (
        code >= 61 &&
        code <= 67
    ) {
        return 0.65;
    }

    // Drizzle
    if (
        code >= 51 &&
        code <= 57
    ) {
        return 0.45;
    }

    // Snow
    if (
        code >= 71 &&
        code <= 77
    ) {
        return 0.70;
    }

    // Fog
    if (
        code >= 45 &&
        code <= 48
    ) {
        return 0.35;
    }

    // Clear / mainly clear / cloudy
    return 0;
}

// ============================================================
// FETCH LIVE WEATHER
// ============================================================
//
// Rate-limit-aware Open-Meteo request.
//
// Only HTTP 429 is retried automatically.
// Other failures are allowed to propagate to the
// environmental collection layer.
//

async function fetchWeather(
    latitude,
    longitude
) {
    const url =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${encodeURIComponent(
            latitude
        )}` +
        `&longitude=${encodeURIComponent(
            longitude
        )}` +
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m" +
        "&hourly=precipitation_probability" +
        "&forecast_days=1" +
        "&timezone=auto";

    let retryNumber = 0;

    while (true) {
        try {
            return await getJSON(url);
        } catch (error) {
            const statusCode =
                Number(
                    error.statusCode
                );

            // ------------------------------------------------
            // Retry ONLY rate-limit responses.
            // ------------------------------------------------

            if (
                statusCode !== 429 ||
                retryNumber >=
                    WEATHER_MAX_RETRIES
            ) {
                throw error;
            }

            retryNumber++;

            const delay =
                getRetryDelay(
                    error,
                    retryNumber
                );

            console.warn(
                `Weather API rate limited (HTTP 429) at ${latitude}, ${longitude}. ` +
                `Retry ${retryNumber}/${WEATHER_MAX_RETRIES} in ${delay} ms.`
            );

            await sleep(delay);
        }
    }
}

// ============================================================
// EXTRACT WEATHER
// ============================================================

function extractWeatherData(data) {
    if (!data) {
        return null;
    }

    const current =
        data.current || {};

    const hourly =
        data.hourly || {};

    let precipitationProbability = 0;

    if (
        Array.isArray(
            hourly.precipitation_probability
        ) &&
        hourly
            .precipitation_probability
            .length > 0
    ) {
        precipitationProbability =
            Number(
                hourly
                    .precipitation_probability[0]
            ) || 0;
    }

    const precipitation =
        Number(
            current.precipitation
        ) || 0;

    const weatherCode =
        Number(
            current.weather_code
        );

    const windSpeed =
        Number(
            current.wind_speed_10m
        ) || 0;

    const temperature =
        Number(
            current.temperature_2m
        );

    const rainfallRisk =
        calculateRainRisk(
            precipitation,
            precipitationProbability
        );

    const weatherCodeRisk =
        calculateWeatherCodeRisk(
            weatherCode
        );

    const stormRisk =
        weatherCode >= 95
            ? 1
            : 0;

    return {
        temperature,
        precipitation,
        precipitationProbability,
        weatherCode,
        windSpeed,
        rainfallRisk,
        weatherCodeRisk,
        stormRisk
    };
}

// ============================================================
// PROCESS ONE WEATHER CHECKPOINT
// ============================================================

async function collectCheckpointWeather(
    checkpoint,
    weatherCache
) {
    const [
        longitude,
        latitude
    ] = checkpoint.coordinate;

    // --------------------------------------------------------
    // Check in-request cache first.
    // --------------------------------------------------------

    if (
        weatherCache.has(
            checkpoint.key
        )
    ) {
        const cached =
            weatherCache.get(
                checkpoint.key
            );

        return {
            ...checkpoint,
            weather:
                cached.weather,
            dataUnavailable:
                cached.dataUnavailable,
            error:
                cached.error
        };
    }

    console.log(
        `Weather data request: ${latitude}, ${longitude}`
    );

    try {
        const weather =
            await fetchWeather(
                latitude,
                longitude
            );

        const extracted =
            extractWeatherData(
                weather
            );

        // ----------------------------------------------------
        // A successful HTTP request with a malformed
        // weather payload is still treated as unavailable.
        // ----------------------------------------------------

        if (!extracted) {
            throw new Error(
                "Weather response contained no usable data"
            );
        }

        const result = {
            weather: extracted,
            dataUnavailable: false,
            error: null
        };

        weatherCache.set(
            checkpoint.key,
            result
        );

        return {
            ...checkpoint,
            ...result
        };
    } catch (error) {
        console.warn(
            `Weather data unavailable at ${latitude}, ${longitude}: ${error.message}`
        );

        const result = {
            weather: null,
            dataUnavailable: true,
            error: error.message
        };

        weatherCache.set(
            checkpoint.key,
            result
        );

        return {
            ...checkpoint,
            ...result
        };
    }
}

// ============================================================
// PROCESS WEATHER IN RATE-LIMITED BATCHES
// ============================================================
//
// This replaces the old:
//
// Promise.all(uniqueCheckpoints.map(...))
//
// which caused the 429 burst.
//

async function collectWeatherInBatches(
    uniqueCheckpoints
) {
    const results = [];

    const weatherCache =
        new Map();

    const total =
        uniqueCheckpoints.length;

    for (
        let start = 0;
        start < total;
        start += WEATHER_BATCH_SIZE
    ) {
        const batch =
            uniqueCheckpoints.slice(
                start,
                start + WEATHER_BATCH_SIZE
            );

        const batchNumber =
            Math.floor(
                start /
                    WEATHER_BATCH_SIZE
            ) + 1;

        const totalBatches =
            Math.ceil(
                total /
                    WEATHER_BATCH_SIZE
            );

        console.log(
            `Weather batch ${batchNumber}/${totalBatches}: ` +
            `${batch.length} request(s)`
        );

        const batchResults =
            await Promise.all(
                batch.map(
                    checkpoint =>
                        collectCheckpointWeather(
                            checkpoint,
                            weatherCache
                        )
                )
            );

        results.push(
            ...batchResults
        );

        const hasMore =
            start +
                WEATHER_BATCH_SIZE <
            total;

        if (hasMore) {
            await sleep(
                WEATHER_BATCH_DELAY_MS
            );
        }
    }

    return results;
}

// ============================================================
// COLLECT ENVIRONMENTAL DATA
// ============================================================
//
// ALL external weather requests happen here.
//
// assessRouteHazards() only reads from this data.
//

async function collectEnvironmentalData(
    routes,
    source,
    destination
) {
    console.log(
        "\n================================================"
    );

    console.log(
        "COLLECTING LIVE ENVIRONMENTAL DATA"
    );

    console.log(
        "================================================"
    );

    if (
        !Array.isArray(routes) ||
        routes.length === 0
    ) {
        return {
            checkpoints: [],
            lookup: {},
            checkpointCount: 0,
            unavailableCount: 0,
            collectedAt:
                new Date().toISOString(),
            source: "Open-Meteo",
            checkpointStrategy:
                "5% route-progress intervals"
        };
    }

    // --------------------------------------------------------
    // Generate checkpoints for every route.
    // --------------------------------------------------------

    const allRouteCheckpoints = [];

    for (
        const route of routes
    ) {
        const checkpoints =
            generateRouteCheckpoints(
                route.coordinates,
                CHECKPOINT_PERCENTAGE_STEP
            );

        console.log(
            `Route ${route.routeNumber}: ${checkpoints.length} checkpoints at 5% intervals`
        );

        allRouteCheckpoints.push({
            routeNumber:
                route.routeNumber,

            checkpoints
        });
    }

    // --------------------------------------------------------
    // Deduplicate coordinates.
    // --------------------------------------------------------

    const uniqueCheckpointMap =
        new Map();

    for (
        const routeData of
            allRouteCheckpoints
    ) {
        for (
            const checkpoint of
                routeData.checkpoints
        ) {
            const key =
                coordinateKey(
                    checkpoint.coordinate
                );

            if (
                !uniqueCheckpointMap.has(
                    key
                )
            ) {
                uniqueCheckpointMap.set(
                    key,
                    {
                        key,

                        coordinate:
                            checkpoint.coordinate,

                        routes: []
                    }
                );
            }

            uniqueCheckpointMap
                .get(key)
                .routes.push({
                    routeNumber:
                        routeData.routeNumber,

                    progress:
                        checkpoint.progress
                });
        }
    }

    const uniqueCheckpoints =
        Array.from(
            uniqueCheckpointMap.values()
        );

    console.log(
        `Environmental data collection: ${uniqueCheckpoints.length} unique checkpoints`
    );

    console.log(
        `Weather request strategy: batches of ${WEATHER_BATCH_SIZE}`
    );

    console.log(
        `Weather batch delay: ${WEATHER_BATCH_DELAY_MS} ms`
    );

    console.log(
        `Weather 429 retries: ${WEATHER_MAX_RETRIES}`
    );

    // --------------------------------------------------------
    // Fetch weather using rate-limited batches.
    // --------------------------------------------------------

    const results =
        await collectWeatherInBatches(
            uniqueCheckpoints
        );

    // --------------------------------------------------------
    // Build lookup.
    // --------------------------------------------------------

    const lookup = {};

    let unavailableCount = 0;

    for (
        const result of results
    ) {
        lookup[result.key] =
            result;

        if (
            result.dataUnavailable
        ) {
            unavailableCount++;
        }
    }

    console.log(
        "Environmental data collection complete."
    );

    console.log(
        `Environmental checkpoints: ${results.length}`
    );

    if (
        unavailableCount > 0
    ) {
        console.warn(
            `Environmental data unavailable at ${unavailableCount} checkpoints.`
        );
    } else {
        console.log(
            "All environmental checkpoints have usable weather data."
        );
    }

    console.log(
        "Live environmental data collection complete."
    );

    return {
        checkpoints: results,

        lookup,

        checkpointCount:
            results.length,

        unavailableCount,

        collectedAt:
            new Date().toISOString(),

        source:
            "Open-Meteo",

        checkpointStrategy:
            "5% route-progress intervals",

        routes:
            allRouteCheckpoints,

        sourceLocation:
            source
                ? {
                      latitude:
                          source.latitude,

                      longitude:
                          source.longitude
                  }
                : null,

        destinationLocation:
            destination
                ? {
                      latitude:
                          destination.latitude,

                      longitude:
                          destination.longitude
                  }
                : null
    };
}

// ============================================================
// FLOOD RISK
// ============================================================
//
// Current live-data proxy.
//
// Later this can be replaced with a dedicated flood model/API.
//

function calculateFloodRisk(weather) {
    if (!weather) {
        return 0;
    }

    const rainfallRisk =
        Number(
            weather.rainfallRisk
        ) || 0;

    const precipitation =
        Number(
            weather.precipitation
        ) || 0;

    const heavyRain =
        Math.min(
            precipitation / 50,
            1
        );

    return Math.min(
        1,
        rainfallRisk * 0.6 +
            heavyRain * 0.4
    );
}

// ============================================================
// LANDSLIDE RISK
// ============================================================
//
// Current rainfall-based proxy.
//
// Later this can incorporate:
// - slope
// - soil
// - geological data
// - dedicated landslide prediction
//

function calculateLandslideRisk(weather) {
    if (!weather) {
        return 0;
    }

    const rainfallRisk =
        Number(
            weather.rainfallRisk
        ) || 0;

    return Math.min(
        1,
        rainfallRisk * 0.8
    );
}

// ============================================================
// STORM RISK
// ============================================================

function calculateStormRisk(weather) {
    if (!weather) {
        return 0;
    }

    return Math.min(
        1,
        Number(
            weather.stormRisk
        ) || 0
    );
}

// ============================================================
// DISASTER RISK
// ============================================================
//
// Reserved for future live disaster feeds.
//
// Do NOT artificially set this to 1.
//

function calculateDisasterRisk(weather) {
    return 0;
}

// ============================================================
// POINT HAZARD
// ============================================================

function calculatePointHazard(weather) {
    if (!weather) {
        return null;
    }

    const rainfallRisk =
        Math.min(
            1,
            Number(
                weather.rainfallRisk
            ) || 0
        );

    const weatherRisk =
        Math.min(
            1,
            Number(
                weather.weatherCodeRisk
            ) || 0
        );

    const floodRisk =
        calculateFloodRisk(
            weather
        );

    const landslideRisk =
        calculateLandslideRisk(
            weather
        );

    const stormRisk =
        calculateStormRisk(
            weather
        );

    const disasterRisk =
        calculateDisasterRisk(
            weather
        );

    // --------------------------------------------------------
    // ENVIRONMENT-ONLY WEIGHTING
    //
    // No distance.
    // No ETA.
    // No route length.
    // No urgency.
    // --------------------------------------------------------

    const overallRisk =
        rainfallRisk * 0.35 +
        weatherRisk * 0.20 +
        floodRisk * 0.20 +
        landslideRisk * 0.15 +
        stormRisk * 0.05 +
        disasterRisk * 0.05;

    return {
        rainfallRisk,
        weatherRisk,
        floodRisk,
        landslideRisk,
        stormRisk,
        disasterRisk,

        overallRisk:
            Math.max(
                0,
                Math.min(
                    1,
                    overallRisk
                )
            )
    };
}

// ============================================================
// ROUTE HAZARD ASSESSMENT
// ============================================================
//
// The route assessment itself performs NO network calls.
//
// Available checkpoints are used normally.
// Unavailable checkpoints are ignored.
// The route is considered unavailable ONLY when there are
// ZERO usable environmental checkpoints.
//

async function assessRouteHazards(
    route,
    source,
    destination,
    environmentalData
) {
    if (!route) {
        return {
            overallRisk: 0,
            averageRisk: 0,
            maximumRisk: 0,
            checkpoints: [],
            dataUnavailable: true,
            dataUnavailableReason:
                "Route data unavailable"
        };
    }

    if (
        !environmentalData ||
        !environmentalData.lookup
    ) {
        return {
            overallRisk: 0,
            averageRisk: 0,
            maximumRisk: 0,
            checkpoints: [],
            dataUnavailable: true,
            dataUnavailableReason:
                "Environmental data collection object unavailable"
        };
    }

    const routeCheckpoints =
        generateRouteCheckpoints(
            route.coordinates,
            CHECKPOINT_PERCENTAGE_STEP
        );

    const assessedCheckpoints = [];

    const validRisks = [];

    let unavailableCount = 0;

    // --------------------------------------------------------
    // Assess each checkpoint.
    // --------------------------------------------------------

    for (
        const checkpoint of
            routeCheckpoints
    ) {
        const key =
            coordinateKey(
                checkpoint.coordinate
            );

        const environmental =
            environmentalData.lookup[
                key
            ];

        // ----------------------------------------------------
        // Missing checkpoint.
        //
        // DO NOT assign fake high hazard values.
        // ----------------------------------------------------

        if (
            !environmental ||
            environmental.dataUnavailable ||
            !environmental.weather
        ) {
            unavailableCount++;

            assessedCheckpoints.push({
                progress:
                    checkpoint.progress,

                coordinate:
                    checkpoint.coordinate,

                dataUnavailable:
                    true,

                weather: null,

                hazards: null,

                overallRisk: null
            });

            continue;
        }

        // ----------------------------------------------------
        // Calculate actual local hazard.
        // ----------------------------------------------------

        const hazards =
            calculatePointHazard(
                environmental.weather
            );

        if (!hazards) {
            unavailableCount++;

            assessedCheckpoints.push({
                progress:
                    checkpoint.progress,

                coordinate:
                    checkpoint.coordinate,

                dataUnavailable:
                    true,

                weather:
                    environmental.weather,

                hazards: null,

                overallRisk: null
            });

            continue;
        }

        validRisks.push(
            hazards.overallRisk
        );

        assessedCheckpoints.push({
            progress:
                checkpoint.progress,

            coordinate:
                checkpoint.coordinate,

            dataUnavailable:
                false,

            weather:
                environmental.weather,

            hazards,

            overallRisk:
                hazards.overallRisk
        });
    }

    // --------------------------------------------------------
    // No usable environmental data at all.
    // --------------------------------------------------------

    if (
        validRisks.length === 0
    ) {
        return {
            overallRisk: 0,
            averageRisk: 0,
            maximumRisk: 0,

            checkpoints:
                assessedCheckpoints,

            dataUnavailable:
                true,

            dataUnavailableReason:
                "No usable environmental data was available for this route"
        };
    }

    // --------------------------------------------------------
    // Average environmental risk.
    // --------------------------------------------------------

    const averageRisk =
        validRisks.reduce(
            (
                total,
                value
            ) =>
                total + value,
            0
        ) /
        validRisks.length;

    // --------------------------------------------------------
    // Worst environmental point.
    // --------------------------------------------------------

    const maximumRisk =
        Math.max(
            ...validRisks
        );

    // --------------------------------------------------------
    // Final route environmental risk.
    //
    // 60% average conditions
    // 40% worst observed condition
    // --------------------------------------------------------

    const overallRisk =
        averageRisk * 0.60 +
        maximumRisk * 0.40;

    return {
        overallRisk:
            Math.max(
                0,
                Math.min(
                    1,
                    overallRisk
                )
            ),

        averageRisk:
            Math.max(
                0,
                Math.min(
                    1,
                    averageRisk
                )
            ),

        maximumRisk:
            Math.max(
                0,
                Math.min(
                    1,
                    maximumRisk
                )
            ),

        checkpoints:
            assessedCheckpoints,

        // IMPORTANT:
        // Partial unavailability is reported,
        // but does not invalidate the route.

        dataUnavailable:
            unavailableCount > 0,

        dataUnavailableReason:
            unavailableCount > 0
                ? `${unavailableCount} of ${routeCheckpoints.length} environmental checkpoints were unavailable`
                : null
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    generateRouteCheckpoints,
    collectEnvironmentalData,
    assessRouteHazards,
    calculateRainRisk,
    calculateWeatherCodeRisk
};