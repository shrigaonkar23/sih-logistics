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

                                resolve(
                                    JSON.parse(data)
                                );

                            } catch (error) {

                                reject(
                                    new Error(
                                        "Invalid weather API response"
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
// CLAMP
// ============================================================

function clamp(
    value,
    minimum = 0,
    maximum = 1
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );
}

// ============================================================
// WEATHER RISK
// ============================================================

function calculateRainRisk(
    precipitation,
    precipitationProbability
) {

    const rainAmount =
        Number(
            precipitation || 0
        );

    const probability =
        Number(
            precipitationProbability || 0
        ) / 100;

    const amountRisk =
        clamp(
            rainAmount / 20
        );

    const probabilityRisk =
        clamp(
            probability
        );

    return clamp(
        (
            amountRisk * 0.6
        ) +
        (
            probabilityRisk * 0.4
        )
    );
}

// ============================================================
// WEATHER CODE RISK
// ============================================================

function calculateWeatherCodeRisk(
    weatherCode
) {

    const code =
        Number(
            weatherCode
        );

    // Clear
    if (code === 0) {
        return 0;
    }

    // Mainly clear / partly cloudy
    if (
        code === 1 ||
        code === 2 ||
        code === 3
    ) {
        return 0.05;
    }

    // Fog
    if (
        code === 45 ||
        code === 48
    ) {
        return 0.20;
    }

    // Drizzle
    if (
        code >= 51 &&
        code <= 57
    ) {
        return 0.30;
    }

    // Rain
    if (
        code >= 61 &&
        code <= 67
    ) {
        return 0.55;
    }

    // Snow
    if (
        code >= 71 &&
        code <= 77
    ) {
        return 0.60;
    }

    // Showers
    if (
        code >= 80 &&
        code <= 82
    ) {
        return 0.70;
    }

    // Thunderstorm
    if (
        code >= 95
    ) {
        return 0.90;
    }

    return 0.20;
}

// ============================================================
// OPEN-METEO WEATHER
// ============================================================

async function getWeather(
    latitude,
    longitude
) {

    const url =
        "https://api.open-meteo.com/v1/forecast" +
        "?latitude=" +
        encodeURIComponent(latitude) +
        "&longitude=" +
        encodeURIComponent(longitude) +
        "&current=temperature_2m,precipitation,weather_code" +
        "&hourly=precipitation_probability" +
        "&forecast_days=1";

    return await getJSON(url);
}

// ============================================================
// ROUTE HAZARD ASSESSMENT
// ============================================================
//
// For the first implementation we assess several points along
// the route instead of assigning one weather value to the
// entire route.
//
// This architecture can later consume:
// - flood prediction
// - landslide prediction
// - disaster alerts
// - rainfall forecasts
// - government hazard APIs
// - ML predictions
//
// ============================================================

async function assessRouteHazards(
    route,
    source,
    destination
) {

    const coordinates =
        route.coordinates || [];

    let samplePoints = [];

    if (
        coordinates.length >= 3
    ) {

        const firstIndex = 0;

        const middleIndex =
            Math.floor(
                coordinates.length / 2
            );

        const lastIndex =
            coordinates.length - 1;

        samplePoints = [
            coordinates[firstIndex],
            coordinates[middleIndex],
            coordinates[lastIndex]
        ];

    } else {

        samplePoints = [
            [
                source.longitude,
                source.latitude
            ],
            [
                destination.longitude,
                destination.latitude
            ]
        ];
    }

    const pointRisks = [];

    for (
        const point
        of samplePoints
    ) {

        const longitude =
            point[0];

        const latitude =
            point[1];

        try {

            const weather =
                await getWeather(
                    latitude,
                    longitude
                );

            const current =
                weather.current || {};

            const precipitation =
                current.precipitation || 0;

            const weatherCode =
                current.weather_code || 0;

            const hourly =
                weather.hourly || {};

            const probabilityArray =
                hourly.precipitation_probability ||
                [];

            const precipitationProbability =
                probabilityArray.length > 0
                    ? probabilityArray[0]
                    : 0;

            const rainfallRisk =
                calculateRainRisk(
                    precipitation,
                    precipitationProbability
                );

            const weatherRisk =
                calculateWeatherCodeRisk(
                    weatherCode
                );

            // ------------------------------------------------
            // Temporary placeholders
            //
            // These will later come from the disaster/
            // prediction component.
            // ------------------------------------------------

            const floodRisk = 0;

            const landslideRisk = 0;

            const stormRisk =
                weatherCode >= 95
                    ? 0.70
                    : 0;

            const disasterRisk = 0;

            const overallRisk =
                clamp(
                    (
                        rainfallRisk * 0.35
                    ) +
                    (
                        weatherRisk * 0.20
                    ) +
                    (
                        floodRisk * 0.20
                    ) +
                    (
                        landslideRisk * 0.15
                    ) +
                    (
                        stormRisk * 0.05
                    ) +
                    (
                        disasterRisk * 0.05
                    )
                );

            pointRisks.push({

                latitude,

                longitude,

                rainfall:
                    rainfallRisk,

                floodRisk,

                landslideRisk,

                stormRisk,

                disasterRisk,

                weatherRisk,

                overallRisk
            });

        } catch (error) {

            console.error(
                "Weather assessment failed:",
                error.message
            );

            // Conservative fallback
            pointRisks.push({

                latitude,

                longitude,

                rainfall: 0.50,

                floodRisk: 0,

                landslideRisk: 0,

                stormRisk: 0,

                disasterRisk: 0,

                weatherRisk: 0.50,

                overallRisk: 0.50
            });
        }
    }

    // ========================================================
    // AGGREGATE ROUTE RISK
    // ========================================================

    const averageRisk =
        pointRisks.length > 0

            ? pointRisks.reduce(
                (
                    total,
                    point
                ) =>
                    total +
                    point.overallRisk,
                0
            ) /
            pointRisks.length

            : 0;

    const maximumRisk =
        pointRisks.length > 0

            ? Math.max(
                ...pointRisks.map(
                    point =>
                        point.overallRisk
                )
            )

            : 0;

    // Give some importance to the worst section.
    const overallRisk =
        clamp(
            (
                averageRisk * 0.60
            ) +
            (
                maximumRisk * 0.40
            )
        );

    const rainfall =
        average(
            pointRisks.map(
                point =>
                    point.rainfall
            )
        );

    const floodRisk =
        average(
            pointRisks.map(
                point =>
                    point.floodRisk
            )
        );

    const landslideRisk =
        average(
            pointRisks.map(
                point =>
                    point.landslideRisk
            )
        );

    const stormRisk =
        average(
            pointRisks.map(
                point =>
                    point.stormRisk
            )
        );

    const disasterRisk =
        average(
            pointRisks.map(
                point =>
                    point.disasterRisk
            )
        );

    return {

        rainfall,

        floodRisk,

        landslideRisk,

        stormRisk,

        disasterRisk,

        overallRisk,

        pointRisks
    };
}

// ============================================================
// AVERAGE
// ============================================================

function average(values) {

    if (
        !values ||
        values.length === 0
    ) {
        return 0;
    }

    return values.reduce(
        (
            total,
            value
        ) =>
            total + value,
        0
    ) / values.length;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    assessRouteHazards
};