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
        data.features[0]
            .geometry
            .coordinates;

    return {

        name: place,

        longitude:
            coordinates[0],

        latitude:
            coordinates[1]
    };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    geocodePlace
};