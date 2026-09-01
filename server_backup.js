const http = require("http");
const routes = require("./routes.json");
const routeTools = require("./scoring");
const filter = require("./routeFilter");

const server = http.createServer((req,res) =>{

    if(req.method === "POST" && req.url === "/find-route"){
        let body = "";
        
        req.on("data",(chunk) =>{
            body += chunk;
        });

        req.on("end",() =>{
            const shipment = JSON.parse(body);

            if (
                !shipment.source ||
                !shipment.destination ||
                !shipment.urgency ||
                !shipment.weatherCondition
            ) {
                res.statusCode = 400;
                res.end("Source, Destination, Urgency and Weather Condition are required!");
                return;
            }
            
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
                res.end("Source, Destination, Urgency and Weather Condition must be valid");
                return;
            }

            const filteredRoutes = filter(routes, shipment.source, shipment.destination);

            if (filteredRoutes.length === 0) {
                res.statusCode = 404;
                res.end("No routes found for this source and destination");
                return;
            }

            let scoredRoutes = [];
            const distanceLimits = routeTools.MaxMin(filteredRoutes, "distance");
            const timeLimits = routeTools.MaxMin(filteredRoutes, "time");
            const severity = routeTools.valueSeverity(shipment.weatherCondition);

            for(const route of filteredRoutes){
                
                const distanceScore = routeTools.calculateScore(route, "distance", distanceLimits.Max, distanceLimits.Min)
                const timeScore = routeTools.calculateScore(route, "time", timeLimits.Max, timeLimits.Min)
                const urgencyFactor = routeTools.urgencyFactor(shipment.urgency);
                const affectedness = routeTools.valueAffectedness(route);
                const weatherScore = routeTools.calculateAffectedness(affectedness, severity);

                const score = urgencyFactor * timeScore + distanceScore + weatherScore;

                scoredRoutes.push({
                    route : route,
                    score : score
                });
            }

            let bestRoute = scoredRoutes[0];
            for(const route of scoredRoutes){
                if(bestRoute.score > route.score)
                    bestRoute = route;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");

            res.end(JSON.stringify({
                bestRoute: bestRoute.route,
                score: bestRoute.score,
                allRoutes: scoredRoutes
            }));
        });
    }
    
    else if (req.url === "/"){
        res.statusCode = 200;
        res.end("LOGISTICS PLATFORM IS RUNNING");
    }

});

server.listen(3000, () => {

    console.log("SERVER IS RUNNING ON PORT 3000");

});
