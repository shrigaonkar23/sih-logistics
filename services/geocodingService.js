const https = require("https");

// ============================================================
// SILP GEOCODING SERVICE
// ============================================================
//
// Purpose:
// Convert a place name into coordinates and country information.
//
// Provider:
// OpenRouteService (ORS)
//
// IMPORTANT:
// This service is responsible ONLY for geocoding.
// Routing and India-only route verification are handled elsewhere.
//
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const GEOCODING_TIMEOUT_MS = 30000;


// ============================================================
// HTTP GET JSON
// ============================================================

function getJSON(url) {

    return new Promise((resolve, reject) => {

        let settled = false;

        const finishReject = (error) => {

            if (settled) {
                return;
            }

            settled = true;
            reject(error);
        };

        const finishResolve = (data) => {

            if (settled) {
                return;
            }

            settled = true;
            resolve(data);
        };


        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent": "SILP-Logistics/1.0",
                    "Accept": "application/json"
                },
                timeout: GEOCODING_TIMEOUT_MS
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

                    finishReject(
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

                            const json = JSON.parse(data);

                            finishResolve(json);

                        } catch (error) {

                            finishReject(
                                new Error(
                                    "Invalid geocoding API response"
                                )
                            );
                        }
                    }
                );


                // ------------------------------------------------
                // RESPONSE ERROR
                // ------------------------------------------------

                response.on(
                    "error",
                    error => {
                        finishReject(error);
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

                request.destroy();

                finishReject(
                    new Error(
                        `Geocoding API request timed out after ${GEOCODING_TIMEOUT_MS / 1000} seconds`
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
                finishReject(error);
            }
        );
    });
}


// ============================================================
// ORS GEOCODING
// ============================================================

async function geocodePlace(place) {

    const apiKey =
        process.env.ORS_API_KEY;


    // --------------------------------------------------------
    // API KEY CHECK
    // --------------------------------------------------------

    if (!apiKey) {

        throw new Error(
            "ORS_API_KEY is missing from .env"
        );
    }


    // --------------------------------------------------------
    // VALIDATE PLACE
    // --------------------------------------------------------

    if (
        typeof place !== "string" ||
        place.trim().length === 0
    ) {

        throw new Error(
            "Place name is required for geocoding"
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
        encodeURIComponent(place.trim()) +
        "&size=1";


    // --------------------------------------------------------
    // REQUEST
    // --------------------------------------------------------

    console.log("");
    console.log("Geocoding:", place);
    console.log("Geocoding provider: OpenRouteService");
    console.log(
        `Geocoding timeout: ${GEOCODING_TIMEOUT_MS / 1000}s`
    );


    const data =
        await getJSON(url);


    // --------------------------------------------------------
    // VALIDATE RESPONSE
    // --------------------------------------------------------

    if (
        !data.features ||
        !Array.isArray(data.features) ||
        data.features.length === 0
    ) {

        throw new Error(
            `Could not find location: ${place}`
        );
    }


    const feature =
        data.features[0];


    // --------------------------------------------------------
    // COORDINATES
    // --------------------------------------------------------

    const coordinates =
        feature.geometry &&
        feature.geometry.coordinates;


    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        typeof coordinates[0] !== "number" ||
        typeof coordinates[1] !== "number"
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
    // --------------------------------------------------------
    //
    // ORS normally provides country / country_a.
    //
    // Keep multiple fallbacks because the exact property
    // names can vary depending on the ORS response.
    //
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

    const result = {

        name: place,

        longitude:
            coordinates[0],

        latitude:
            coordinates[1],

        country,

        countryCode
    };


    console.log(
        "Geocoding successful:",
        result
    );


    return result;
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    geocodePlace
};