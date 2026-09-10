const http = require("http");

process.loadEnvFile(".env");

const PORT = 3000;

// ============================================================
// SERVICES
// ============================================================

const {
    geocodePlace
} = require("./services/geocodingService");

const {
    getOSRMRoutes,
    convertOSRMRoute
} = require("./services/routingService");

const {
    assessRouteHazards
} = require("./services/hazardService");

const {
    calculateSafetyScore
} = require("./scoring/safetyScore");

// ============================================================
// OMS - VENDOR SERVICE
// ============================================================

const vendorService =
    require("./services/vendorService");

// ============================================================
// OMS - FLEET / VEHICLE SERVICE
// ============================================================

const fleetService =
    require("./services/fleetService");

// ============================================================
// OMS - SHIPMENT SERVICE
// ============================================================

const shipmentService =
    require("./services/shipmentService");

// ============================================================
// CORS
// ============================================================

const CORS_HEADERS = {
    "Access-Control-Allow-Origin":
        "http://localhost:5173",

    "Access-Control-Allow-Methods":
        "GET, POST, PUT, DELETE, OPTIONS",

    "Access-Control-Allow-Headers":
        "Content-Type"
};

// ============================================================
// HTTP HELPERS
// ============================================================

function readBody(req) {
    return new Promise(
        (resolve, reject) => {

            let body = "";

            req.on(
                "data",
                chunk => {
                    body += chunk;
                }
            );

            req.on(
                "end",
                () => {

                    try {

                        if (!body) {
                            resolve({});
                            return;
                        }

                        resolve(
                            JSON.parse(body)
                        );

                    } catch (error) {

                        reject(
                            new Error(
                                "Invalid JSON body"
                            )
                        );
                    }
                }
            );

            req.on(
                "error",
                reject
            );
        }
    );
}

// ============================================================
// SEND JSON
// ============================================================

function sendJSON(
    res,
    statusCode,
    data
) {

    res.writeHead(
        statusCode,
        {
            ...CORS_HEADERS,

            "Content-Type":
                "application/json"
        }
    );

    res.end(
        JSON.stringify(data)
    );
}

// ============================================================
// GET PATH
// ============================================================

function getPath(url) {
    return url.split("?")[0];
}

// ============================================================
// ROUTE REQUEST VALIDATION
// ============================================================

function validateRouteRequest(body) {

    if (!body.source) {
        return "Source is required";
    }

    if (!body.destination) {
        return "Destination is required";
    }

    return null;
}

// ============================================================
// VENDOR REQUEST VALIDATION
// ============================================================

function validateVendorRequest(body) {

    if (!body.name) {
        return "Vendor name is required";
    }

    if (!body.email) {
        return "Vendor email is required";
    }

    return null;
}

// ============================================================
// VEHICLE REQUEST VALIDATION
// ============================================================

function validateVehicleRequest(body) {

    if (!body.registrationNumber) {
        return "Vehicle registration number is required";
    }

    if (!body.vehicleType) {
        return "Vehicle type is required";
    }

    if (
        body.capacity === undefined ||
        body.capacity === null
    ) {
        return "Vehicle capacity is required";
    }

    if (!body.fuelType) {
        return "Fuel type is required";
    }

    return null;
}

// ============================================================
// SHIPMENT REQUEST VALIDATION
// ============================================================

function validateShipmentRequest(body) {

    if (!body.vehicleId) {
        return "Vehicle ID is required";
    }

    if (!body.origin) {
        return "Shipment origin is required";
    }

    if (!body.destination) {
        return "Shipment destination is required";
    }

    if (!body.shipmentType) {
        return "Shipment type is required";
    }

    if (
        body.load === undefined ||
        body.load === null
    ) {
        return "Shipment load is required";
    }

    return null;
}

// ============================================================
// NORMALIZE ROUTE
// ============================================================

function normalizeRoute(
    route,
    routeNumber
) {

    const converted =
        convertOSRMRoute(route);

    return {

        routeNumber,

        distanceKm:
            Number(
                converted.distanceKm.toFixed(2)
            ),

        durationMin:
            Number(
                converted.durationMin.toFixed(2)
            ),

        coordinates:
            converted.coordinates,

        distanceMeters:
            converted.distanceMeters,

        durationSeconds:
            converted.durationSeconds,

        safetyScore: null,

        hazardRisk: null,

        hazardDetails: null
    };
}

// ============================================================
// FIND ROUTE HANDLER
// ============================================================

async function handleFindRoute(
    req,
    res
) {

    try {

        const body =
            await readBody(req);

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "        INCOMING ROUTE REQUEST"
        );

        console.log(
            "================================================"
        );

        console.log(body);

        console.log("");

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        const validationError =
            validateRouteRequest(body);

        if (validationError) {

            sendJSON(
                res,
                400,
                {
                    error:
                        validationError
                }
            );

            return;
        }

        // ----------------------------------------------------
        // REQUEST PARAMETERS
        // ----------------------------------------------------

        const urgency =
            String(
                body.urgency ||
                "MEDIUM"
            ).toUpperCase();

        const vehicle =
            body.vehicle ||
            null;

        const shipment =
            body.shipment ||
            null;

        // ----------------------------------------------------
        // GEOCODING
        // ----------------------------------------------------

        console.log(
            "Geocoding source..."
        );

        const source =
            await geocodePlace(
                body.source
            );

        console.log(
            "Source:",
            source
        );

        console.log(
            "Geocoding destination..."
        );

        const destination =
            await geocodePlace(
                body.destination
            );

        console.log(
            "Destination:",
            destination
        );

        // ----------------------------------------------------
        // GENERATE CANDIDATE ROUTES
        // ----------------------------------------------------

        console.log("");

        console.log(
            "Generating candidate routes..."
        );

        const osrmRoutes =
            await getOSRMRoutes(
                source,
                destination
            );

        console.log(
            "Candidate routes generated:",
            osrmRoutes.length
        );

        // ----------------------------------------------------
        // NORMALIZE ROUTES
        // ----------------------------------------------------

        const routes =
            osrmRoutes.map(
                (route, index) =>
                    normalizeRoute(
                        route,
                        index + 1
                    )
            );

        // ----------------------------------------------------
        // HAZARD ASSESSMENT
        // ----------------------------------------------------

        console.log("");

        console.log(
            "Assessing environmental hazards..."
        );

        const assessedRoutes = [];

        for (
            const route of routes
        ) {

            const hazard =
                await assessRouteHazards(
                    route,
                    source,
                    destination
                );

            const safetyScore =
                calculateSafetyScore(
                    hazard
                );

            assessedRoutes.push({

                ...route,

                safetyScore,

                hazardRisk:
                    hazard.overallRisk,

                hazardDetails: {

                    rainfall:
                        hazard.rainfall,

                    floodRisk:
                        hazard.floodRisk,

                    landslideRisk:
                        hazard.landslideRisk,

                    stormRisk:
                        hazard.stormRisk,

                    disasterRisk:
                        hazard.disasterRisk,

                    overallRisk:
                        hazard.overallRisk
                }
            });
        }

        // ----------------------------------------------------
        // TEMPORARY ROUTE SELECTION
        // ----------------------------------------------------

        // This will eventually be replaced by Python ACO.
        //
        // Safety remains independent from distance and ETA.

        const bestRoute =
            selectBestSafetyRoute(
                assessedRoutes
            );

        // ----------------------------------------------------
        // PRINT RESULT
        // ----------------------------------------------------

        printFinalResult(
            assessedRoutes,
            bestRoute
        );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            200,
            {

                requestId:
                    `REQ-${Date.now()}`,

                source,

                destination,

                urgency,

                vehicle,

                shipment,

                routeCount:
                    assessedRoutes.length,

                bestRoute:
                    bestRoute
                        ? {

                            routeNumber:
                                bestRoute.routeNumber,

                            distanceKm:
                                bestRoute.distanceKm,

                            durationMin:
                                bestRoute.durationMin,

                            safetyScore:
                                bestRoute.safetyScore,

                            hazardRisk:
                                bestRoute.hazardRisk
                        }

                        : null,

                routes:
                    assessedRoutes
            }
        );

    } catch (error) {

        console.error(
            "FIND ROUTE ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {

                error:
                    error.message ||
                    "Failed to find route"
            }
        );
    }
}

// ============================================================
// CREATE VENDOR HANDLER
// ============================================================

async function handleCreateVendor(
    req,
    res
) {

    try {

        const body =
            await readBody(req);

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "          CREATE VENDOR REQUEST"
        );

        console.log(
            "================================================"
        );

        console.log(body);

        console.log("");

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        const validationError =
            validateVendorRequest(body);

        if (validationError) {

            sendJSON(
                res,
                400,
                {
                    error:
                        validationError
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CREATE VENDOR
        // ----------------------------------------------------

        const vendor =
            vendorService.createVendor(
                body
            );

        console.log(
            "Vendor created:",
            vendor
        );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            201,
            {

                message:
                    "Vendor created successfully",

                vendor
            }
        );

    } catch (error) {

        console.error(
            "CREATE VENDOR ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to create vendor"
            }
        );
    }
}

// ============================================================
// GET ALL VENDORS
// ============================================================

function handleGetAllVendors(
    req,
    res
) {

    try {

        const vendors =
            vendorService.getAllVendors();

        sendJSON(
            res,
            200,
            {

                count:
                    vendors.length,

                vendors
            }
        );

    } catch (error) {

        console.error(
            "GET VENDORS ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vendors"
            }
        );
    }
}

// ============================================================
// GET SINGLE VENDOR
// ============================================================

function handleGetVendor(
    req,
    res,
    vendorId
) {

    try {

        const vendor =
            vendorService.getVendor(
                vendorId
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {
                vendor
            }
        );

    } catch (error) {

        console.error(
            "GET VENDOR ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vendor"
            }
        );
    }
}

// ============================================================
// UPDATE VENDOR
// ============================================================

async function handleUpdateVendor(
    req,
    res,
    vendorId
) {

    try {

        const body =
            await readBody(req);

        const vendor =
            vendorService.updateVendor(
                vendorId,
                body
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {

                message:
                    "Vendor updated successfully",

                vendor
            }
        );

    } catch (error) {

        console.error(
            "UPDATE VENDOR ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to update vendor"
            }
        );
    }
}

// ============================================================
// DELETE VENDOR
// ============================================================

function handleDeleteVendor(
    req,
    res,
    vendorId
) {

    try {

        const deleted =
            vendorService.deleteVendor(
                vendorId
            );

        if (!deleted) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {

                message:
                    "Vendor deleted successfully",

                vendorId
            }
        );

    } catch (error) {

        console.error(
            "DELETE VENDOR ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to delete vendor"
            }
        );
    }
}

// ============================================================
// CREATE VEHICLE
// ============================================================

async function handleCreateVehicle(
    req,
    res,
    vendorId
) {

    try {

        // ----------------------------------------------------
        // CHECK VENDOR
        // ----------------------------------------------------

        const vendor =
            vendorService.getVendor(
                vendorId
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // READ BODY
        // ----------------------------------------------------

        const body =
            await readBody(req);

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        const validationError =
            validateVehicleRequest(body);

        if (validationError) {

            sendJSON(
                res,
                400,
                {
                    error:
                        validationError
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CREATE VEHICLE
        // ----------------------------------------------------

        const vehicle =
            fleetService.createVehicle(
                vendorId,
                body
            );

        console.log("");

        console.log(
            "Vehicle created:",
            vehicle
        );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            201,
            {

                message:
                    "Vehicle created successfully",

                vehicle
            }
        );

    } catch (error) {

        console.error(
            "CREATE VEHICLE ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to create vehicle"
            }
        );
    }
}

// ============================================================
// GET VENDOR VEHICLES
// ============================================================

function handleGetVendorVehicles(
    req,
    res,
    vendorId
) {

    try {

        // ----------------------------------------------------
        // CHECK VENDOR
        // ----------------------------------------------------

        const vendor =
            vendorService.getVendor(
                vendorId
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // GET VEHICLES
        // ----------------------------------------------------

        const vehicles =
            fleetService.getVendorVehicles(
                vendorId
            );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            200,
            {

                vendorId,

                count:
                    vehicles.length,

                vehicles
            }
        );

    } catch (error) {

        console.error(
            "GET VENDOR VEHICLES ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vendor vehicles"
            }
        );
    }
}

// ============================================================
// GET SINGLE VEHICLE
// ============================================================

function handleGetVehicle(
    req,
    res,
    vehicleId
) {

    try {

        const vehicle =
            fleetService.getVehicle(
                vehicleId
            );

        if (!vehicle) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vehicle not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {
                vehicle
            }
        );

    } catch (error) {

        console.error(
            "GET VEHICLE ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vehicle"
            }
        );
    }
}

// ============================================================
// UPDATE VEHICLE
// ============================================================

async function handleUpdateVehicle(
    req,
    res,
    vehicleId
) {

    try {

        const body =
            await readBody(req);

        const vehicle =
            fleetService.updateVehicle(
                vehicleId,
                body
            );

        if (!vehicle) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vehicle not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {

                message:
                    "Vehicle updated successfully",

                vehicle
            }
        );

    } catch (error) {

        console.error(
            "UPDATE VEHICLE ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to update vehicle"
            }
        );
    }
}

// ============================================================
// DELETE VEHICLE
// ============================================================

function handleDeleteVehicle(
    req,
    res,
    vehicleId
) {

    try {

        const deleted =
            fleetService.deleteVehicle(
                vehicleId
            );

        if (!deleted) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vehicle not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {

                message:
                    "Vehicle deleted successfully",

                vehicleId
            }
        );

    } catch (error) {

        console.error(
            "DELETE VEHICLE ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to delete vehicle"
            }
        );
    }
}

// ============================================================
// CREATE SHIPMENT
// ============================================================

async function handleCreateShipment(
    req,
    res,
    vendorId
) {

    try {

        // ----------------------------------------------------
        // CHECK VENDOR
        // ----------------------------------------------------

        const vendor =
            vendorService.getVendor(
                vendorId
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // READ BODY
        // ----------------------------------------------------

        const body =
            await readBody(req);

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        const validationError =
            validateShipmentRequest(body);

        if (validationError) {

            sendJSON(
                res,
                400,
                {
                    error:
                        validationError
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CHECK VEHICLE
        // ----------------------------------------------------

        const vehicle =
            fleetService.getVehicle(
                body.vehicleId
            );

        if (!vehicle) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vehicle not found"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CHECK VEHICLE OWNERSHIP
        // ----------------------------------------------------

        if (
            vehicle.vendorId !==
            vendorId
        ) {

            sendJSON(
                res,
                403,
                {
                    error:
                        "Vehicle does not belong to this vendor"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CHECK VEHICLE STATUS
        // ----------------------------------------------------

        if (
            vehicle.status !==
            "ACTIVE"
        ) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Vehicle is not available for shipment"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CHECK LOAD AGAINST CAPACITY
        // ----------------------------------------------------

        const shipmentLoad =
            Number(body.load);

        if (
            shipmentLoad >
            vehicle.capacity
        ) {

            sendJSON(
                res,
                400,
                {

                    error:
                        "Shipment load exceeds vehicle capacity",

                    vehicleCapacity:
                        vehicle.capacity,

                    shipmentLoad
                }
            );

            return;
        }

        // ----------------------------------------------------
        // CREATE SHIPMENT
        // ----------------------------------------------------

        const shipment =
            shipmentService.createShipment(
                vendorId,
                body.vehicleId,
                body
            );

        console.log("");

        console.log(
            "Shipment created:",
            shipment
        );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            201,
            {

                message:
                    "Shipment created successfully",

                shipment
            }
        );

    } catch (error) {

        console.error(
            "CREATE SHIPMENT ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to create shipment"
            }
        );
    }
}

// ============================================================
// GET VENDOR SHIPMENTS
// ============================================================

function handleGetVendorShipments(
    req,
    res,
    vendorId
) {

    try {

        // ----------------------------------------------------
        // CHECK VENDOR
        // ----------------------------------------------------

        const vendor =
            vendorService.getVendor(
                vendorId
            );

        if (!vendor) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Vendor not found"
                }
            );

            return;
        }

        // ----------------------------------------------------
        // GET SHIPMENTS
        // ----------------------------------------------------

        const shipments =
            shipmentService.getVendorShipments(
                vendorId
            );

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------

        sendJSON(
            res,
            200,
            {

                vendorId,

                count:
                    shipments.length,

                shipments
            }
        );

    } catch (error) {

        console.error(
            "GET VENDOR SHIPMENTS ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vendor shipments"
            }
        );
    }
}

// ============================================================
// GET SINGLE SHIPMENT
// ============================================================

function handleGetShipment(
    req,
    res,
    shipmentId
) {

    try {

        const shipment =
            shipmentService.getShipment(
                shipmentId
            );

        if (!shipment) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Shipment not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {
                shipment
            }
        );

    } catch (error) {

        console.error(
            "GET SHIPMENT ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve shipment"
            }
        );
    }
}

// ============================================================
// UPDATE SHIPMENT
// ============================================================

async function handleUpdateShipment(
    req,
    res,
    shipmentId
) {

    try {

        const existingShipment =
            shipmentService.getShipment(
                shipmentId
            );

        if (!existingShipment) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Shipment not found"
                }
            );

            return;
        }

        const body =
            await readBody(req);

        // ----------------------------------------------------
        // VEHICLE CHANGE VALIDATION
        // ----------------------------------------------------

        if (
            body.vehicleId !== undefined
        ) {

            const vehicle =
                fleetService.getVehicle(
                    body.vehicleId
                );

            if (!vehicle) {

                sendJSON(
                    res,
                    404,
                    {
                        error:
                            "Vehicle not found"
                    }
                );

                return;
            }

            if (
                vehicle.vendorId !==
                existingShipment.vendorId
            ) {

                sendJSON(
                    res,
                    403,
                    {
                        error:
                            "Vehicle does not belong to this vendor"
                    }
                );

                return;
            }

            if (
                vehicle.status !==
                "ACTIVE"
            ) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            "Vehicle is not available"
                    }
                );

                return;
            }

            const load =
                body.load !== undefined
                    ? Number(body.load)
                    : Number(existingShipment.load);

            if (
                load >
                vehicle.capacity
            ) {

                sendJSON(
                    res,
                    400,
                    {

                        error:
                            "Shipment load exceeds vehicle capacity",

                        vehicleCapacity:
                            vehicle.capacity,

                        shipmentLoad:
                            load
                    }
                );

                return;
            }
        }

        // ----------------------------------------------------
        // LOAD CHANGE VALIDATION
        // ----------------------------------------------------

        if (
            body.load !== undefined
        ) {

            const vehicle =
                fleetService.getVehicle(
                    body.vehicleId ||
                    existingShipment.vehicleId
                );

            if (!vehicle) {

                sendJSON(
                    res,
                    404,
                    {
                        error:
                            "Vehicle not found"
                    }
                );

                return;
            }

            const load =
                Number(body.load);

            if (
                load >
                vehicle.capacity
            ) {

                sendJSON(
                    res,
                    400,
                    {

                        error:
                            "Shipment load exceeds vehicle capacity",

                        vehicleCapacity:
                            vehicle.capacity,

                        shipmentLoad:
                            load
                    }
                );

                return;
            }
        }

        // ----------------------------------------------------
        // UPDATE SHIPMENT
        // ----------------------------------------------------

        const shipment =
            shipmentService.updateShipment(
                shipmentId,
                body
            );

        sendJSON(
            res,
            200,
            {

                message:
                    "Shipment updated successfully",

                shipment
            }
        );

    } catch (error) {

        console.error(
            "UPDATE SHIPMENT ERROR:",
            error
        );

        sendJSON(
            res,
            400,
            {

                error:
                    error.message ||
                    "Failed to update shipment"
            }
        );
    }
}

// ============================================================
// DELETE SHIPMENT
// ============================================================

function handleDeleteShipment(
    req,
    res,
    shipmentId
) {

    try {

        const shipment =
            shipmentService.getShipment(
                shipmentId
            );

        if (!shipment) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Shipment not found"
                }
            );

            return;
        }

        const deleted =
            shipmentService.deleteShipment(
                shipmentId
            );

        if (!deleted) {

            sendJSON(
                res,
                404,
                {
                    error:
                        "Shipment not found"
                }
            );

            return;
        }

        sendJSON(
            res,
            200,
            {

                message:
                    "Shipment deleted successfully",

                shipmentId
            }
        );

    } catch (error) {

        console.error(
            "DELETE SHIPMENT ERROR:",
            error
        );

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to delete shipment"
            }
        );
    }
}

// ============================================================
// TEMPORARY BEST ROUTE SELECTION
// ============================================================

function selectBestSafetyRoute(
    routes
) {

    if (
        !routes ||
        routes.length === 0
    ) {
        return null;
    }

    return routes.reduce(
        (best, current) => {

            if (
                current.safetyScore >
                best.safetyScore
            ) {
                return current;
            }

            return best;
        }
    );
}

// ============================================================
// PRINT ROUTE RESULT
// ============================================================

function printFinalResult(
    routes,
    bestRoute
) {

    console.log("");

    console.log(
        "================================================"
    );

    console.log(
        "             SILP ROUTING RESULT"
    );

    console.log(
        "================================================"
    );

    console.log("");

    routes.forEach(
        route => {

            console.log(
                `Route ${route.routeNumber}`
            );

            console.log(
                "Distance       :",
                `${route.distanceKm} km`
            );

            console.log(
                "Estimated Time :",
                `${route.durationMin} min`
            );

            console.log(
                "Safety Score   :",
                `${route.safetyScore}/100`
            );

            console.log(
                "Hazard Risk    :",
                route.hazardRisk
            );

            console.log(
                "Hazards        :",
                route.hazardDetails
            );

            console.log("");
        }
    );

    if (bestRoute) {

        console.log(
            "================================================"
        );

        console.log(
            "RECOMMENDED ROUTE:",
            `Route ${bestRoute.routeNumber}`
        );

        console.log(
            "SAFETY SCORE:",
            `${bestRoute.safetyScore}/100`
        );

        console.log(
            "================================================"
        );
    }

    console.log("");
}

// ============================================================
// SERVER
// ============================================================

const server =
    http.createServer(
        async (req, res) => {

            // ------------------------------------------------
            // CORS PREFLIGHT
            // ------------------------------------------------

            if (
                req.method === "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    CORS_HEADERS
                );

                res.end();

                return;
            }

            // ------------------------------------------------
            // GET PATH WITHOUT QUERY PARAMETERS
            // ------------------------------------------------

            const path =
                getPath(req.url);

            // =================================================
            // ROOT
            // =================================================

            if (
                req.method === "GET" &&
                path === "/"
            ) {

                sendJSON(
                    res,
                    200,
                    {

                        message:
                            "SILP backend is running",

                        status:
                            "OK",

                        version:
                            "v0.3",

                        modules: {

                            routing:
                                "ACTIVE",

                            hazardAssessment:
                                "ACTIVE",

                            safetyScoring:
                                "ACTIVE",

                            vendorOMS:
                                "ACTIVE",

                            fleetOMS:
                                "ACTIVE",

                            shipmentOMS:
                                "ACTIVE"
                        }
                    }
                );

                return;
            }

            // =================================================
            // ROUTES
            // =================================================

            if (
                req.method === "GET" &&
                path === "/routes"
            ) {

                sendJSON(
                    res,
                    200,
                    {

                        message:
                            "Route API is working",

                        architecture:
                            "Dynamic hazard-aware routing",

                        optimization:
                            "Temporary safety-based selection; ACO pending"
                    }
                );

                return;
            }

            // =================================================
            // FIND ROUTE
            // =================================================

            if (
                req.method === "POST" &&
                path === "/find-route"
            ) {

                await handleFindRoute(
                    req,
                    res
                );

                return;
            }

            // =================================================
            // CREATE VENDOR
            // =================================================

            if (
                req.method === "POST" &&
                path === "/vendors"
            ) {

                await handleCreateVendor(
                    req,
                    res
                );

                return;
            }

            // =================================================
            // GET ALL VENDORS
            // =================================================

            if (
                req.method === "GET" &&
                path === "/vendors"
            ) {

                handleGetAllVendors(
                    req,
                    res
                );

                return;
            }

            // =================================================
            // VENDOR VEHICLE COLLECTION
            //
            // /vendors/:vendorId/vehicles
            // =================================================

            const vendorVehiclesMatch =
                path.match(
                    /^\/vendors\/([^/]+)\/vehicles$/
                );

            if (vendorVehiclesMatch) {

                const vendorId =
                    vendorVehiclesMatch[1];

                // ---------------------------------------------
                // CREATE VEHICLE
                // ---------------------------------------------

                if (
                    req.method === "POST"
                ) {

                    await handleCreateVehicle(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }

                // ---------------------------------------------
                // GET VENDOR VEHICLES
                // ---------------------------------------------

                if (
                    req.method === "GET"
                ) {

                    handleGetVendorVehicles(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }
            }

            // =================================================
            // VENDOR SHIPMENT COLLECTION
            //
            // /vendors/:vendorId/shipments
            // =================================================

            const vendorShipmentsMatch =
                path.match(
                    /^\/vendors\/([^/]+)\/shipments$/
                );

            if (vendorShipmentsMatch) {

                const vendorId =
                    vendorShipmentsMatch[1];

                // ---------------------------------------------
                // CREATE SHIPMENT
                // ---------------------------------------------

                if (
                    req.method === "POST"
                ) {

                    await handleCreateShipment(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }

                // ---------------------------------------------
                // GET VENDOR SHIPMENTS
                // ---------------------------------------------

                if (
                    req.method === "GET"
                ) {

                    handleGetVendorShipments(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }
            }

            // =================================================
            // VENDOR ID ROUTES
            //
            // /vendors/:vendorId
            // =================================================

            const vendorMatch =
                path.match(
                    /^\/vendors\/([^/]+)$/
                );

            if (vendorMatch) {

                const vendorId =
                    vendorMatch[1];

                // ---------------------------------------------
                // GET VENDOR
                // ---------------------------------------------

                if (
                    req.method === "GET"
                ) {

                    handleGetVendor(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }

                // ---------------------------------------------
                // UPDATE VENDOR
                // ---------------------------------------------

                if (
                    req.method === "PUT"
                ) {

                    await handleUpdateVendor(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }

                // ---------------------------------------------
                // DELETE VENDOR
                // ---------------------------------------------

                if (
                    req.method === "DELETE"
                ) {

                    handleDeleteVendor(
                        req,
                        res,
                        vendorId
                    );

                    return;
                }
            }

            // =================================================
            // VEHICLE ID ROUTES
            //
            // /vehicles/:vehicleId
            // =================================================

            const vehicleMatch =
                path.match(
                    /^\/vehicles\/([^/]+)$/
                );

            if (vehicleMatch) {

                const vehicleId =
                    vehicleMatch[1];

                // ---------------------------------------------
                // GET VEHICLE
                // ---------------------------------------------

                if (
                    req.method === "GET"
                ) {

                    handleGetVehicle(
                        req,
                        res,
                        vehicleId
                    );

                    return;
                }

                // ---------------------------------------------
                // UPDATE VEHICLE
                // ---------------------------------------------

                if (
                    req.method === "PUT"
                ) {

                    await handleUpdateVehicle(
                        req,
                        res,
                        vehicleId
                    );

                    return;
                }

                // ---------------------------------------------
                // DELETE VEHICLE
                // ---------------------------------------------

                if (
                    req.method === "DELETE"
                ) {

                    handleDeleteVehicle(
                        req,
                        res,
                        vehicleId
                    );

                    return;
                }
            }

            // =================================================
            // SHIPMENT ID ROUTES
            //
            // /shipments/:shipmentId
            // =================================================

            const shipmentMatch =
                path.match(
                    /^\/shipments\/([^/]+)$/
                );

            if (shipmentMatch) {

                const shipmentId =
                    shipmentMatch[1];

                // ---------------------------------------------
                // GET SHIPMENT
                // ---------------------------------------------

                if (
                    req.method === "GET"
                ) {

                    handleGetShipment(
                        req,
                        res,
                        shipmentId
                    );

                    return;
                }

                // ---------------------------------------------
                // UPDATE SHIPMENT
                // ---------------------------------------------

                if (
                    req.method === "PUT"
                ) {

                    await handleUpdateShipment(
                        req,
                        res,
                        shipmentId
                    );

                    return;
                }

                // ---------------------------------------------
                // DELETE SHIPMENT
                // ---------------------------------------------

                if (
                    req.method === "DELETE"
                ) {

                    handleDeleteShipment(
                        req,
                        res,
                        shipmentId
                    );

                    return;
                }
            }

            // =================================================
            // 404
            // =================================================

            sendJSON(
                res,
                404,
                {
                    error:
                        "Endpoint not found"
                }
            );
        }
    );

// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "======================================"
        );

        console.log(
            "       SILP BACKEND SERVER v0.3"
        );

        console.log(
            "======================================"
        );

        console.log(
            `Server running on http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            "ROUTING:"
        );

        console.log(
            "POST /find-route"
        );

        console.log(
            "GET  /routes"
        );

        console.log("");

        console.log(
            "OMS - VENDORS:"
        );

        console.log(
            "POST   /vendors"
        );

        console.log(
            "GET    /vendors"
        );

        console.log(
            "GET    /vendors/:id"
        );

        console.log(
            "PUT    /vendors/:id"
        );

        console.log(
            "DELETE /vendors/:id"
        );

        console.log("");

        console.log(
            "OMS - FLEET / VEHICLES:"
        );

        console.log(
            "POST   /vendors/:vendorId/vehicles"
        );

        console.log(
            "GET    /vendors/:vendorId/vehicles"
        );

        console.log(
            "GET    /vehicles/:vehicleId"
        );

        console.log(
            "PUT    /vehicles/:vehicleId"
        );

        console.log(
            "DELETE /vehicles/:vehicleId"
        );

        console.log("");

        console.log(
            "OMS - SHIPMENTS:"
        );

        console.log(
            "POST   /vendors/:vendorId/shipments"
        );

        console.log(
            "GET    /vendors/:vendorId/shipments"
        );

        console.log(
            "GET    /shipments/:shipmentId"
        );

        console.log(
            "PUT    /shipments/:shipmentId"
        );

        console.log(
            "DELETE /shipments/:shipmentId"
        );

        console.log(
            "======================================"
        );

        console.log("");
    }
);