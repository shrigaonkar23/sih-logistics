const http = require("http");
const https = require("https");

const routeTools = require("./scoring");


function geocode(place) {

    const url =
        `https://api.openrouteservice.org/geocode/search?api_key=${process.env.ORS_API_KEY}&text=${encodeURIComponent(place)}`;

    return new Promise((resolve, reject) => {

        https.get(url, (res) => {

            let body = "";

            res.on("data", (chunk) => {
                body += chunk;
            });

            res.on("end", () => {

                const result = JSON.parse(body);

                if (result.features && result.features.length > 0) {

                    const coordinates =
                        result.features[0].geometry.coordinates;

                    resolve(coordinates);

                } else {

                    reject(new Error(`Place not found: ${place}`));

                }

            });

        }).on("error", (error) => {

            reject(error);

        });

    });
}


function convertRoute(route, index) {

    return {

        name: `Route ${index + 1}`,
        distance: route.summary.distance / 1000,
        time: route.summary.duration / 3600,
        geometry: route.geometry

    };

}


const server = http.createServer((req, res) => {

    if (req.method === "POST" && req.url === "/find-route") {

        let body = "";

        req.on("data", (chunk) => {
            body += chunk;
        });

        req.on("end", () => {

            const shipment = JSON.parse(body);


            // REQUIRED FIELD VALIDATION

            if (
                !shipment.source ||
                !shipment.destination ||
                !shipment.urgency ||
                !shipment.weatherCondition
            ) {

                res.statusCode = 400;

                res.end(
                    "Source, Destination, Urgency and Weather Condition are required!"
                );

                return;
            }


            // DATA TYPE VALIDATION

            if (
                typeof shipment.source !== "string" ||
                typeof shipment.destination !== "string" ||
                typeof shipment.urgency !== "string" ||
                typeof shipment.weatherCondition !== "string" ||
                shipment.source === "" ||
                shipment.destination === "" ||
                shipment.urgency === "" ||
                shipment.weatherCondition === ""
            ) {

                res.statusCode = 400;

                res.end(
                    "Source, Destination, Urgency and Weather Condition must be valid"
                );

                return;
            }


            const source = shipment.source;
            const destination = shipment.destination;


            // GEOCODE SOURCE AND DESTINATION

            Promise.all([
                geocode(source),
                geocode(destination)
            ])

            .then(([sourceCoordinates, destinationCoordinates]) => {

                console.log("Source coordinates:", sourceCoordinates);

                console.log(
                    "Destination coordinates:",
                    destinationCoordinates
                );


                // ORS DIRECTIONS REQUEST

                const url =
                    "https://api.openrouteservice.org/v2/directions/driving-car";


                const data = JSON.stringify({

                    coordinates: [
                        sourceCoordinates,
                        destinationCoordinates
                    ],

                    alternative_routes: {

                        target_count: 3,
                        share_factor: 0.8,
                        weight_factor: 2

                    }

                });


                const options = {

                    method: "POST",

                    headers: {

                        "Authorization": process.env.ORS_API_KEY,

                        "Content-Type": "application/json",

                        "Content-Length": Buffer.byteLength(data)

                    }

                };


                const orsRequest = https.request(
                    url,
                    options,
                    (orsResponse) => {

                        let orsBody = "";


                        orsResponse.on("data", (chunk) => {

                            orsBody += chunk;

                        });


                        orsResponse.on("end", () => {

                            const result = JSON.parse(orsBody);


                            console.log(
                                "ORS Status:",
                                orsResponse.statusCode
                            );


                            if (!result.routes) {

                                res.statusCode = 500;

                                res.end(
                                    JSON.stringify({
                                        error: "ORS did not return any routes",
                                        details: result
                                    })
                                );

                                return;

                            }


                            const routes =
                                result.routes.map(convertRoute);


                            console.log(
                                "Number of routes:",
                                routes.length
                            );


                            const distanceLimits = routeTools.MaxMin(routes, "distance");
                            const timeLimits = routeTools.MaxMin(routes, "time");
                            
                            const severity = routeTools.valueSeverity(
                                shipment.weatherCondition
                            );
                            
                            let scoredRoutes = [];
                            
                            for (const route of routes) {
                            
                                const distanceScore = routeTools.calculateScore(
                                    route,
                                    "distance",
                                    distanceLimits.Max,
                                    distanceLimits.Min
                                );
                            
                                const timeScore = routeTools.calculateScore(
                                    route,
                                    "time",
                                    timeLimits.Max,
                                    timeLimits.Min
                                );
                            
                                const urgencyFactor =
                                    routeTools.urgencyFactor(shipment.urgency);
                            
                                const affectedness =
                                    routeTools.valueAffectedness(route);
                            
                                const weatherScore =
                                    routeTools.calculateAffectedness(
                                        affectedness,
                                        severity
                                    );
                            
                                const score =
                                    urgencyFactor * timeScore +
                                    distanceScore +
                                    weatherScore;
                            
                                scoredRoutes.push({
                            
                                    route: route,
                            
                                    score: score
                            
                                });
                            }

                            let bestRoute = scoredRoutes[0];

                            for (const route of scoredRoutes) {

                                if (route.score < bestRoute.score) {
                                    bestRoute = route;
                                }

                            }
                            res.statusCode = 200;

                            res.setHeader(
                                "Content-Type",
                                "application/json"
                            );


                            res.end(
                                JSON.stringify({
                                    source: source,
                                    destination: destination,
                                    bestRoute: bestRoute.route,
                                    score: bestRoute.score,
                                    allRoutes: scoredRoutes
                                })
                            );

                        });

                    }
                );


                orsRequest.on("error", (error) => {

                    console.error(
                        "ORS Error:",
                        error.message
                    );

                    res.statusCode = 500;

                    res.end(
                        JSON.stringify({
                            error: "ORS request failed",
                            message: error.message
                        })
                    );

                });


                orsRequest.write(data);

                orsRequest.end();

            })

            .catch((error) => {

                console.error(
                    "Geocoding Error:",
                    error.message
                );

                res.statusCode = 500;

                res.end(
                    JSON.stringify({
                        error: "Geocoding failed",
                        message: error.message
                    })
                );

            });

        });

    }


    else if (req.url === "/") {

        res.statusCode = 200;

        res.end(
            "LOGISTICS PLATFORM IS RUNNING"
        );

    }

});


server.listen(3000, () => {

    console.log(
        "SERVER IS RUNNING ON PORT 3000"
    );

});