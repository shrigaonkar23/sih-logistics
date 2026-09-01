const https = require("https");

const API_KEY = process.env.ORS_API_KEY;

const source = "Guwahati";
const destination = "Shillong";


function geocode(place) {

    const url =
        `https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(place)}`;

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


Promise.all([
    geocode(source),
    geocode(destination)
])
.then((coordinates) => {

    const sourceCoordinates = coordinates[0];
    const destinationCoordinates = coordinates[1];

    console.log("Source:", source);
    console.log("Source coordinates:", sourceCoordinates);

    console.log("Destination:", destination);
    console.log("Destination coordinates:", destinationCoordinates);


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

            "Authorization": API_KEY,

            "Content-Type": "application/json",

            "Content-Length": Buffer.byteLength(data)

        }

    };


    const req = https.request(url, options, (res) => {

        let body = "";

        res.on("data", (chunk) => {

            body += chunk;

        });


        res.on("end", () => {

            const result = JSON.parse(body);

            console.log("Status:", res.statusCode);


            if (!result.routes) {

                console.log("No routes returned");

                console.log(result);

                return;

            }


            console.log("Number of routes:", result.routes.length);


            const routes = result.routes.map(convertRoute);


            console.log("\nConverted routes:");

            console.log(routes);

        });

    });


    req.on("error", (error) => {

        console.error("Error:", error.message);

    });


    req.write(data);

    req.end();

})
.catch((error) => {

    console.error("Error:", error.message);

});