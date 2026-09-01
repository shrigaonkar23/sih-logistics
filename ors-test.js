function convertRoute(route, index) {
    return {
        name: `Route ${index + 1}`,
        distance: route.summary.distance / 1000,
        time: route.summary.duration / 3600,
        geometry: route.geometry
    };
}

const https = require("https");

const API_KEY = process.env.ORS_API_KEY;

const url =
    "https://api.openrouteservice.org/v2/directions/driving-car";

const data = JSON.stringify({
    coordinates: [
        [91.7362, 26.1445],
        [91.8933, 25.5788]
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
        console.log("Number of routes:", result.routes.length);
    
        const routes = result.routes.map(convertRoute);

        console.log(routes);
    });

});

req.on("error", (error) => {
    console.error("Error:", error.message);
});

req.write(data);
req.end();