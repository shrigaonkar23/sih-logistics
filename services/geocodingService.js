const https = require("https");

// ============================================================
// HTTP GET JSON
// ============================================================

function getJSON(url) {
    return new Promise(
        (resolve, reject) => {
            const request = https.get(
                url,
                {
                    headers: {
                        "User-Agent":
                            "SILP-Logistics/1.0",

                        "Accept":
                            "application/json"
                    },

                    timeout: 10000
                },

                response => {
                    let data = "";

                    // ------------------------------------------------
                    // HTTP STATUS CHECK
                    // ------------------------------------------------

                    if (
                        response.statusCode < 200 ||
                        response.statusCode >= 300
                    ) {
                        response.resume();

                        reject(
                            new Error(
                                `Geocoding API returned HTTP ${response.statusCode}`
                            )
                        );

                        return;
                    }

                    // ------------------------------------------------
                    // RECEIVE DATA
                    // ------------------------------------------------

                    response.on(
                        "data",
                        chunk => {
                            data += chunk;
                        }
                    );

                    // ------------------------------------------------
                    // PARSE JSON
                    // ------------------------------------------------

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
                                        "Invalid geocoding API response"
                                    )
                                );
                            }
                        }
                    );

                    response.on(
                        "error",
                        error => {
                            reject(error);
                        }
                    );
                }
            );

            // --------------------------------------------------------
            // REQUEST TIMEOUT
            // --------------------------------------------------------

            request.on(
                "timeout",
                () => {
                    request.destroy(
                        new Error(
                            "Geocoding API request timed out after 10 seconds"
                        )
                    );
                }
            );

            // --------------------------------------------------------
            // REQUEST ERROR
            // --------------------------------------------------------

            request.on(
                "error",
                error => {
                    reject(error);
                }
            );
        }
    );
}

// ============================================================
// ORS GEOCODING
// ============================================================

async function geocodePlace(place) {

    const apiKey =
        process.env.ORS_API_KEY;

    if (!apiKey) {
        throw new Error(
            "ORS_API_KEY is missing from .env"
        );
    }

    // --------------------------------------------------------
    // BUILD ORS GEOCODING URL
    // --------------------------------------------------------

    const url =
        "https://api.openrouteservice.org/geocode/search" +
        "?api_key=" +
        encodeURIComponent(apiKey) +
        "&text=" +
        encodeURIComponent(place) +
        "&size=1";

    // --------------------------------------------------------
    // REQUEST
    // --------------------------------------------------------

    const data =
        await getJSON(url);

    // --------------------------------------------------------
    // VALIDATE RESPONSE
    // --------------------------------------------------------

    if (
        !data.features ||
        data.features.length === 0
    ) {
        throw new Error(
            `Could not find location: ${place}`
        );
    }

    const feature =
        data.features[0];

    const coordinates =
        feature.geometry &&
        feature.geometry.coordinates;

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {
        throw new Error(
            `Invalid coordinates returned for location: ${place}`
        );
    }

    // --------------------------------------------------------
    // ORS LOCATION PROPERTIES
    // --------------------------------------------------------

    const properties =
        feature.properties || {};

    // --------------------------------------------------------
    // COUNTRY INFORMATION
    //
    // ORS normally provides country / country_a in the
    // geocoding feature properties.
    //
    // Keep multiple fallbacks because the exact property
    // names can vary depending on the ORS response.
    // --------------------------------------------------------

    const country =
        properties.country ||
        properties.country_name ||
        null;

    const countryCode =
        properties.country_a ||
        properties.country_code ||
        properties.iso_a3 ||
        properties.ISO_A3 ||
        null;

    // --------------------------------------------------------
    // RETURN GEOCODE RESULT
    // --------------------------------------------------------

    return {

        name:
            place,

        longitude:
            coordinates[0],

        latitude:
            coordinates[1],

        country,

        countryCode
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    geocodePlace
};