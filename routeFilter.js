function filterRoutes(routes, source, destination) {

    const possibleRoutes = [];

    for (const route of routes) {

        if (
            route.source === source &&
            route.destination === destination
        )
            possibleRoutes.push(route);
    }

    return possibleRoutes;
}

module.exports = filterRoutes;