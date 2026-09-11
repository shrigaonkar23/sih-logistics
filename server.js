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
    getStandardRouteBatch,
    getWaypointRouteBatch,
    generateWaypointStrategies,
    convertOSRMRoute,
    isRouteTooSimilar
} = require("./services/routingService");

const {
    assessRouteHazards,
    collectEnvironmentalData
} = require("./services/hazardService");

const {
    calculateSafetyScore
} = require("./scoring/safetyScore");

const {
    assessInternationalRoute
} = require("./services/borderService");

// ============================================================
// OMS SERVICES
// ============================================================

const vendorService =
    require("./services/vendorService");

const fleetService =
    require("./services/fleetService");

const shipmentService =
    require("./services/shipmentService");

// ============================================================
// PROGRESSIVE ROUTE SEARCH CONFIGURATION
// ============================================================

const MINIMUM_DOMESTIC_ROUTES = 1;

const PREFERRED_DOMESTIC_ROUTES = 2;

const MAX_RETURNED_DOMESTIC_ROUTES = 3;

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

function getPath(url) {

    return url.split("?")[0];

}

// ============================================================
// INDIA-ONLY ROUTE POLICY
// ============================================================

function isIndiaLocation(
    location
) {

    const countryCode =
        location &&
        location.countryCode
            ? String(
                location.countryCode
            )
                .trim()
                .toUpperCase()
            : "";

    const country =
        location &&
        location.country
            ? String(
                location.country
            )
                .trim()
                .toUpperCase()
            : "";

    return (

        countryCode === "IND" ||

        countryCode === "IN" ||

        countryCode === "INDIA" ||

        country === "INDIA" ||

        country.includes("INDIA")

    );

}

// ============================================================
// ROUTE BORDER VERIFICATION
// ============================================================

function verifyIndiaOnlyRoute(
    border
) {

    if (
        !border ||
        typeof border !== "object"
    ) {

        return {

            valid: false,

            reason:
                "BORDER_ASSESSMENT_MISSING",

            countryCodes: [],

            countriesCrossed: []

        };

    }

    const countryCodes =
        Array.isArray(
            border.countryCodes
        )
            ? border.countryCodes
                .map(
                    code =>
                        String(code)
                            .trim()
                            .toUpperCase()
                )
                .filter(Boolean)
            : [];

    const countriesCrossed =
        Array.isArray(
            border.countriesCrossed
        )
            ? border.countriesCrossed
                .map(
                    country =>
                        String(country)
                            .trim()
                            .toUpperCase()
                )
                .filter(Boolean)
            : [];

    if (
        border.international !== false
    ) {

        return {

            valid: false,

            reason:
                border.international === true
                    ? "INTERNATIONAL_ROUTE"
                    : "ROUTE_NOT_VERIFIED_AS_DOMESTIC",

            countryCodes,

            countriesCrossed

        };

    }

    if (
        countryCodes.length === 0
    ) {

        return {

            valid: false,

            reason:
                "NO_COUNTRY_CODES_RETURNED",

            countryCodes,

            countriesCrossed

        };

    }

    const onlyIndiaCodes =
        countryCodes.every(
            code =>
                code === "IND" ||
                code === "IN"
        );

    if (
        !onlyIndiaCodes
    ) {

        return {

            valid: false,

            reason:
                "NON_INDIA_COUNTRY_DETECTED",

            countryCodes,

            countriesCrossed

        };

    }

    const onlyIndiaCountries =
        countriesCrossed.length === 0 ||
        countriesCrossed.every(
            country =>
                country === "INDIA" ||
                country === "IND"
        );

    if (
        !onlyIndiaCountries
    ) {

        return {

            valid: false,

            reason:
                "NON_INDIA_COUNTRY_DETECTED",

            countryCodes,

            countriesCrossed

        };

    }

    return {

        valid: true,

        reason:
            "VERIFIED_INDIA_ONLY",

        countryCodes,

        countriesCrossed

    };

}

// ============================================================
// REQUEST VALIDATION
// ============================================================

function validateRouteRequest(
    body
) {

    if (!body.source) {

        return "Source is required";

    }

    if (!body.destination) {

        return "Destination is required";

    }

    return null;

}

function validateVendorRequest(
    body
) {

    if (!body.name) {

        return "Vendor name is required";

    }

    if (!body.email) {

        return "Vendor email is required";

    }

    return null;

}

function validateVehicleRequest(
    body
) {

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

function validateShipmentRequest(
    body
) {

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
//
// IMPORTANT:
//
// This function now explicitly verifies that duration from
// convertOSRMRoute() reaches the normalized route.
//
// The diagnostic output is intentionally kept here because
// the current issue is:
//
//     Estimated Time : 0 min
//
// This lets us determine whether the problem is:
//
//     OSRM
//       ↓
//     convertOSRMRoute()
//       ↓
//     normalizeRoute()
//       ↓
//     final route
//
// ============================================================

function normalizeRoute(
    route,
    routeNumber
) {

    const converted =
        convertOSRMRoute(
            route
        );

    console.log("");

    console.log(
        `Route ${routeNumber} conversion result:`
    );

    console.log(
        "Distance meters:",
        converted.distanceMeters
    );

    console.log(
        "Distance km:",
        converted.distanceKm
    );

    console.log(
        "Duration seconds:",
        converted.durationSeconds
    );

    console.log(
        "Duration minutes:",
        converted.durationMin
    );

    const distanceKm =
        Number(
            converted.distanceKm
        );

    const durationMin =
        Number(
            converted.durationMin
        );

    const durationSeconds =
        Number(
            converted.durationSeconds
        );

    return {

        routeNumber,

        distanceKm:
            Number.isFinite(
                distanceKm
            )
                ? Number(
                    distanceKm.toFixed(2)
                )
                : 0,

        durationMin:
            Number.isFinite(
                durationMin
            )
                ? Number(
                    durationMin.toFixed(2)
                )
                : 0,

        coordinates:
            converted.coordinates,

        distanceMeters:
            Number.isFinite(
                Number(
                    converted.distanceMeters
                )
            )
                ? Number(
                    converted.distanceMeters
                )
                : 0,

        durationSeconds:
            Number.isFinite(
                durationSeconds
            )
                ? durationSeconds
                : 0,

        safetyScore:
            null,

        hazardRisk:
            null,

        hazardDetails:
            null

    };

}

// ============================================================
// UNAVAILABLE HAZARD FALLBACK
// ============================================================

function createUnavailableHazardResult(
    error
) {

    const reason =
        error &&
        error.message
            ? error.message
            : "Environmental assessment unavailable";

    return {

        rainfall:
            0.50,

        floodRisk:
            1.00,

        landslideRisk:
            1.00,

        stormRisk:
            1.00,

        disasterRisk:
            1.00,

        overallRisk:
            1.00,

        pointRisks:
            [],

        dataUnavailable:
            true,

        dataUnavailableReason:
            reason

    };

}

// ============================================================
// CHECK ONE ROUTE FOR INDIA-ONLY STATUS
// ============================================================

async function verifyCandidateRoute(
    candidate,
    candidateNumber,
    source,
    destination
) {

    let normalizedRoute;

    try {

        normalizedRoute =
            normalizeRoute(
                candidate,
                candidateNumber
            );

    } catch (
        routeError
    ) {

        console.error(
            `Route ${candidateNumber} normalization failed:`,
            routeError.message ||
            routeError
        );

        return {

            accepted: false,

            reason:
                "ROUTE_NORMALIZATION_FAILED",

            route: null,

            border: null

        };

    }

    if (
        !Array.isArray(
            normalizedRoute.coordinates
        ) ||
        normalizedRoute.coordinates.length < 2
    ) {

        console.error(
            `Route ${candidateNumber} has invalid route geometry.`
        );

        return {

            accepted: false,

            reason:
                "INVALID_ROUTE_GEOMETRY",

            route: null,

            border: null

        };

    }

    let border;

    try {

        console.log("");

        console.log(
            `Checking border immediately: Route ${candidateNumber}`
        );

        border =
            await Promise.resolve(
                assessInternationalRoute(
                    normalizedRoute.coordinates,
                    source.countryCode,
                    destination.countryCode
                )
            );

    } catch (
        borderError
    ) {

        console.error("");

        console.error(
            `Route ${candidateNumber} BORDER ASSESSMENT FAILED`
        );

        console.error(
            borderError.message ||
            borderError
        );

        return {

            accepted: false,

            reason:
                "FULL_ROUTE_BORDER_ASSESSMENT_FAILED",

            route: null,

            border: null

        };

    }

    console.log("");

    console.log(
        `---------- BORDER CHECK: ROUTE ${candidateNumber} ----------`
    );

    console.log(
        "International:",
        border &&
        border.international
    );

    console.log(
        "Countries crossed:",
        border &&
        border.countriesCrossed
    );

    console.log(
        "Country codes:",
        border &&
        border.countryCodes
    );

    console.log(
        "Border assessment:",
        border &&
        border.borderAssessment
    );

    const verification =
        verifyIndiaOnlyRoute(
            border
        );

    if (
        !verification.valid
    ) {

        console.log("");

        console.log(
            `Route ${candidateNumber} REJECTED`
        );

        console.log(
            "Reason:",
            verification.reason
        );

        console.log(
            "Countries:",
            verification.countriesCrossed
        );

        console.log(
            "Country codes:",
            verification.countryCodes
        );

        return {

            accepted: false,

            reason:
                verification.reason,

            route: normalizedRoute,

            border: {

                ...border,

                international:
                    border &&
                    border.international !== undefined
                        ? border.international
                        : true,

                countriesCrossed:
                    verification.countriesCrossed,

                countryCodes:
                    verification.countryCodes

            }

        };

    }

    console.log("");

    console.log(
        `Route ${candidateNumber} ACCEPTED: VERIFIED INDIA ONLY`
    );

    return {

        accepted: true,

        reason:
            "VERIFIED_INDIA_ONLY",

        route:
            normalizedRoute,

        border: {

            ...border,

            international:
                false,

            countriesCrossed:
                verification.countriesCrossed,

            countryCodes:
                verification.countryCodes

        }

    };

}

// ============================================================
// FIND ROUTE
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

        const validationError =
            validateRouteRequest(
                body
            );

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

        // ====================================================
        // GEOCODING
        // ====================================================

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

        // ====================================================
        // INDIA-ONLY ENDPOINT VALIDATION
        // ====================================================

        if (
            !isIndiaLocation(
                source
            )
        ) {

            sendJSON(
                res,
                422,
                {

                    error:
                        "International routes are not supported.",

                    message:
                        "SILP currently supports routes within India only.",

                    rejectedEndpoint:
                        "source",

                    source,

                    routeScope:
                        "INDIA_ONLY"

                }
            );

            return;

        }

        if (
            !isIndiaLocation(
                destination
            )
        ) {

            sendJSON(
                res,
                422,
                {

                    error:
                        "International routes are not supported.",

                    message:
                        "SILP currently supports routes within India only.",

                    rejectedEndpoint:
                        "destination",

                    destination,

                    routeScope:
                        "INDIA_ONLY"

                }
            );

            return;

        }

        console.log(
            "India-only endpoint validation: PASSED"
        );

        // ====================================================
        // PROGRESSIVE INDIA-ONLY ROUTE SEARCH
        // ====================================================

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "PROGRESSIVE INDIA-ONLY ROUTE SEARCH"
        );

        console.log(
            "================================================"
        );

        console.log(
            "Minimum domestic routes:",
            MINIMUM_DOMESTIC_ROUTES
        );

        console.log(
            "Preferred domestic routes:",
            PREFERRED_DOMESTIC_ROUTES
        );

        console.log(
            "Maximum returned:",
            MAX_RETURNED_DOMESTIC_ROUTES
        );

        const domesticRoutes = [];

        const rejectedInternationalRoutes = [];

        const rejectedSimilarRoutes = [];

        let totalCandidateRoutesChecked = 0;

        let generationBatchCount = 0;

        let stoppedEarly =
            false;

        // ----------------------------------------------------
        // PROCESS ONE OSRM BATCH
        // ----------------------------------------------------

        async function processRouteBatch(
            candidates,
            strategyName
        ) {

            if (
                !Array.isArray(
                    candidates
                )
            ) {

                return;

            }

            if (
                candidates.length === 0
            ) {

                console.log("");

                console.log(
                    `${strategyName}: OSRM returned no routes.`
                );

                return;

            }

            console.log("");

            console.log(
                `${strategyName}:`
            );

            console.log(
                "Routes returned:",
                candidates.length
            );

            for (
                let index = 0;
                index < candidates.length;
                index++
            ) {

                totalCandidateRoutesChecked++;

                const candidateNumber =
                    totalCandidateRoutesChecked;

                console.log("");

                console.log(
                    "------------------------------------------------"
                );

                console.log(
                    `Checking candidate ${candidateNumber}`
                );

                console.log(
                    "Generation strategy:",
                    strategyName
                );

                console.log(
                    "------------------------------------------------"
                );

                const verification =
                    await verifyCandidateRoute(
                        candidates[index],
                        candidateNumber,
                        source,
                        destination
                    );

                if (
                    !verification.accepted
                ) {

                    rejectedInternationalRoutes.push({

                        routeNumber:
                            candidateNumber,

                        strategy:
                            strategyName,

                        reason:
                            verification.reason,

                        countriesCrossed:
                            verification.border &&
                            Array.isArray(
                                verification.border
                                    .countriesCrossed
                            )
                                ? verification.border
                                    .countriesCrossed
                                : [],

                        countryCodes:
                            verification.border &&
                            Array.isArray(
                                verification.border
                                    .countryCodes
                            )
                                ? verification.border
                                    .countryCodes
                                : [],

                        borderAssessment:
                            verification.border &&
                            verification.border
                                .borderAssessment
                                ? verification.border
                                    .borderAssessment
                                : "ROUTE_NOT_VERIFIED_AS_DOMESTIC"

                    });

                    continue;

                }

                const similarRoute =
                    domesticRoutes.find(
                        existingRoute => {

                            try {

                                return isRouteTooSimilar(
                                    verification.route,
                                    existingRoute.route
                                );

                            } catch (
                                similarityError
                            ) {

                                console.error(
                                    `Route similarity check failed for candidate ${candidateNumber}:`,
                                    similarityError.message ||
                                    similarityError
                                );

                                return false;

                            }

                        }
                    );

                if (
                    similarRoute
                ) {

                    console.log("");

                    console.log(
                        `Route ${candidateNumber} REJECTED AS GEOMETRIC DUPLICATE`
                    );

                    console.log(
                        "Duplicate of accepted route:",
                        similarRoute.route.routeNumber
                    );

                    console.log(
                        "Candidate distance:",
                        verification.route.distanceKm,
                        "km"
                    );

                    console.log(
                        "Existing route distance:",
                        similarRoute.route.distanceKm,
                        "km"
                    );

                    rejectedSimilarRoutes.push({

                        routeNumber:
                            candidateNumber,

                        strategy:
                            strategyName,

                        reason:
                            "ROUTE_GEOMETRY_TOO_SIMILAR",

                        duplicateOfRouteNumber:
                            similarRoute.route.routeNumber,

                        candidateDistanceKm:
                            verification.route.distanceKm,

                        existingDistanceKm:
                            similarRoute.route.distanceKm

                    });

                    continue;

                }

                domesticRoutes.push({

                    route:
                        verification.route,

                    border:
                        verification.border,

                    strategy:
                        strategyName

                });

                console.log("");

                console.log(
                    "DISTINCT DOMESTIC ROUTE ACCEPTED"
                );

                console.log(
                    "Route number:",
                    verification.route.routeNumber
                );

                console.log(
                    "Distance:",
                    verification.route.distanceKm,
                    "km"
                );

                console.log(
                    "Duration:",
                    verification.route.durationMin,
                    "min"
                );

                console.log(
                    "Domestic routes found:",
                    domesticRoutes.length
                );

                if (
                    domesticRoutes.length >=
                    PREFERRED_DOMESTIC_ROUTES
                ) {

                    console.log("");

                    console.log(
                        "================================================"
                    );

                    console.log(
                        "PREFERRED DOMESTIC ROUTE TARGET REACHED"
                    );

                    console.log(
                        "Distinct domestic routes:",
                        domesticRoutes.length
                    );

                    console.log(
                        "No further route-generation requests will be made."
                    );

                    console.log(
                        "================================================"
                    );

                    stoppedEarly =
                        true;

                    return;

                }

                if (
                    domesticRoutes.length >=
                    MAX_RETURNED_DOMESTIC_ROUTES
                ) {

                    console.log("");

                    console.log(
                        "Maximum domestic route count reached."
                    );

                    stoppedEarly =
                        true;

                    return;

                }

            }

        }

        // ====================================================
        // BATCH 1: STANDARD OSRM
        // ====================================================

        generationBatchCount++;

        let standardRoutes = [];

        try {

            standardRoutes =
                await getStandardRouteBatch(
                    source,
                    destination
                );

        } catch (error) {

            console.error(
                "Standard OSRM search failed:",
                error.message ||
                error
            );

            standardRoutes = [];

        }

        await processRouteBatch(
            standardRoutes,
            "standard"
        );

        // ====================================================
        // BATCHES 2+
        // ====================================================

        if (
            domesticRoutes.length <
            PREFERRED_DOMESTIC_ROUTES
        ) {

            const waypointStrategies =
                generateWaypointStrategies(
                    source,
                    destination
                );

            console.log("");

            console.log(
                "Additional waypoint strategies available:",
                waypointStrategies.length
            );

            for (
                const strategy of waypointStrategies
            ) {

                if (
                    domesticRoutes.length >=
                    PREFERRED_DOMESTIC_ROUTES
                ) {

                    break;

                }

                if (
                    domesticRoutes.length >=
                    MAX_RETURNED_DOMESTIC_ROUTES
                ) {

                    break;

                }

                generationBatchCount++;

                console.log("");

                console.log(
                    "================================================"
                );

                console.log(
                    `PROGRESSIVE BATCH ${generationBatchCount}`
                );

                console.log(
                    "Strategy:",
                    strategy.name
                );

                console.log(
                    "Distinct domestic routes currently:",
                    domesticRoutes.length
                );

                console.log(
                    "================================================"
                );

                let waypointRoutes = [];

                try {

                    waypointRoutes =
                        await getWaypointRouteBatch(
                            source,
                            destination,
                            strategy.waypoint,
                            strategy.name
                        );

                } catch (error) {

                    console.error(
                        `${strategy.name} failed:`,
                        error.message ||
                        error
                    );

                    waypointRoutes = [];

                }

                await processRouteBatch(
                    waypointRoutes,
                    strategy.name
                );

                if (
                    stoppedEarly ||
                    domesticRoutes.length >=
                    PREFERRED_DOMESTIC_ROUTES
                ) {

                    break;

                }

            }

        }

        // ====================================================
        // SEARCH SUMMARY
        // ====================================================

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "PROGRESSIVE ROUTE SEARCH COMPLETE"
        );

        console.log(
            "================================================"
        );

        console.log(
            "OSRM batches requested:",
            generationBatchCount
        );

        console.log(
            "Candidate routes border-checked:",
            totalCandidateRoutesChecked
        );

        console.log(
            "Distinct domestic routes found:",
            domesticRoutes.length
        );

        console.log(
            "Rejected international/unverified routes:",
            rejectedInternationalRoutes.length
        );

        console.log(
            "Rejected similar routes:",
            rejectedSimilarRoutes.length
        );

        console.log(
            "Stopped after preferred target:",
            stoppedEarly
        );

        // ====================================================
        // REQUIRE AT LEAST ONE DOMESTIC ROUTE
        // ====================================================

        if (
            domesticRoutes.length <
            MINIMUM_DOMESTIC_ROUTES
        ) {

            console.log("");

            console.log(
                "================================================"
            );

            console.log(
                "NO VERIFIED DOMESTIC ROUTE FOUND"
            );

            console.log(
                "================================================"
            );

            sendJSON(
                res,
                422,
                {

                    error:
                        "No verified domestic route found.",

                    message:
                        "SILP could not find a verified route entirely within India for the requested journey.",

                    routeScope:
                        "INDIA_ONLY",

                    source,

                    destination,

                    minimumDomesticRoutesRequired:
                        MINIMUM_DOMESTIC_ROUTES,

                    preferredDomesticRoutes:
                        PREFERRED_DOMESTIC_ROUTES,

                    acceptedDomesticRouteCount:
                        domesticRoutes.length,

                    candidateRouteCount:
                        totalCandidateRoutesChecked,

                    generationBatchCount,

                    rejectedInternationalRouteCount:
                        rejectedInternationalRoutes.length,

                    rejectedSimilarRouteCount:
                        rejectedSimilarRoutes.length,

                    rejectedInternationalRoutes,

                    rejectedSimilarRoutes

                }
            );

            return;

        }

        // ====================================================
        // LIMIT ACCEPTED DOMESTIC ROUTES
        // ====================================================

        const acceptedDomesticRoutes =
            domesticRoutes.slice(
                0,
                MAX_RETURNED_DOMESTIC_ROUTES
            );

        console.log("");

        console.log(
            "Domestic routes after border/diversity filtering:",
            domesticRoutes.length
        );

        console.log(
            "Domestic routes passed to environmental analysis:",
            acceptedDomesticRoutes.length
        );

        // ====================================================
        // RENUMBER ACCEPTED ROUTES
        // ====================================================

        const routes =
            acceptedDomesticRoutes.map(
                (
                    candidate,
                    index
                ) => ({

                    ...candidate.route,

                    routeNumber:
                        index + 1,

                    international:
                        false,

                    borderWarning:
                        null,

                    countriesCrossed:
                        candidate.border
                            .countriesCrossed ||
                        [],

                    countryCodes:
                        candidate.border
                            .countryCodes ||
                        [],

                    borderAssessment:
                        candidate.border
                            .borderAssessment ||
                        "VERIFIED_DOMESTIC_ROUTE",

                    generationStrategy:
                        candidate.strategy

                })
            );

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "INDIA-ONLY + ROUTE DIVERSITY FILTER RESULT"
        );

        console.log(
            "================================================"
        );

        console.log(
            "Candidate routes border-checked:",
            totalCandidateRoutesChecked
        );

        console.log(
            "Accepted distinct domestic candidates:",
            domesticRoutes.length
        );

        console.log(
            "Routes used for analysis:",
            routes.length
        );

        console.log(
            "Discarded international/unverified routes:",
            rejectedInternationalRoutes.length
        );

        console.log(
            "Discarded geometrically similar routes:",
            rejectedSimilarRoutes.length
        );

        console.log(
            "Routes passed to environmental analysis:",
            routes.map(
                route =>
                    `Route ${route.routeNumber}`
            )
        );

        // ====================================================
        // ENVIRONMENTAL DATA
        // ====================================================

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "COLLECTING LIVE ENVIRONMENTAL DATA"
        );

        console.log(
            "================================================"
        );

        const environmentalData =
            await collectEnvironmentalData(
                routes,
                source,
                destination
            );

        console.log(
            "Environmental checkpoints:",
            environmentalData.checkpointCount
        );

        console.log(
            "Live environmental data collection complete."
        );

        // ====================================================
        // HAZARD ASSESSMENT
        // ====================================================

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            "ASSESSING ROUTE HAZARDS"
        );

        console.log(
            "================================================"
        );

        const assessedRoutes = [];

        for (
            const route of routes
        ) {

            let hazard;

            let hazardDataUnavailable =
                false;

            let hazardDataUnavailableReason =
                null;

            try {

                console.log(
                    `Assessing Route ${route.routeNumber}...`
                );

                hazard =
                    await assessRouteHazards(
                        route,
                        source,
                        destination,
                        environmentalData
                    );

                hazardDataUnavailable =
                    Boolean(
                        hazard.dataUnavailable
                    );

                hazardDataUnavailableReason =
                    hazard.dataUnavailableReason ||
                    null;

            } catch (
                hazardError
            ) {

                hazardDataUnavailable =
                    true;

                hazardDataUnavailableReason =
                    hazardError.message ||
                    "Environmental assessment unavailable";

                console.error(
                    `Hazard assessment failed for Route ${route.routeNumber}:`,
                    hazardError.message ||
                    hazardError
                );

                hazard =
                    createUnavailableHazardResult(
                        hazardError
                    );

            }

            // =================================================
            // SAFETY SCORE
            // =================================================

            const safetyScore =
                calculateSafetyScore(
                    hazard
                );

            assessedRoutes.push({

                ...route,

                safetyScore,

                hazardRisk:
                    hazard.overallRisk,

                hazardDetails:
                    hazard,

                international:
                    false,

                borderWarning:
                    null,

                countriesCrossed:
                    route.countriesCrossed,

                countryCodes:
                    route.countryCodes,

                borderAssessment:
                    route.borderAssessment,

                hazardDataUnavailable,

                hazardDataUnavailableReason

            });

            console.log(
                `Route ${route.routeNumber} assessed.`
            );

        }

        // ====================================================
        // ROUTE SELECTION POLICY
        // ====================================================

        const routeSelection =
            selectBestSafetyRoute(
                assessedRoutes
            );

        if (
            routeSelection.reason
        ) {

            routeSelection.reason.domesticOnly =
                true;

            routeSelection.reason.totalCandidateRoutes =
                totalCandidateRoutesChecked;

            routeSelection.reason.routesUsedForRecommendation =
                assessedRoutes.length;

            routeSelection.reason.borderPolicy =
                "International and unverified routes are discarded; only positively verified India-only routes are selectable";

            routeSelection.reason.rejectedInternationalRouteCount =
                rejectedInternationalRoutes.length;

            routeSelection.reason.rejectedSimilarRouteCount =
                rejectedSimilarRoutes.length;

            routeSelection.reason.progressiveSearch =
                true;

            routeSelection.reason.minimumDomesticRoutesRequired =
                MINIMUM_DOMESTIC_ROUTES;

            routeSelection.reason.preferredDomesticRoutes =
                PREFERRED_DOMESTIC_ROUTES;

            routeSelection.reason.maximumReturnedRoutes =
                MAX_RETURNED_DOMESTIC_ROUTES;

            routeSelection.reason.osrmBatchesRequested =
                generationBatchCount;

        }

        const bestRoute =
            routeSelection.bestRoute;

        // ====================================================
        // PRINT RESULT
        // ====================================================

        printFinalResult(
            assessedRoutes,
            bestRoute
        );

        // ====================================================
        // RESPONSE
        // ====================================================

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

                routeScope:
                    "INDIA_ONLY",

                routeCount:
                    assessedRoutes.length,

                candidateRouteCount:
                    totalCandidateRoutesChecked,

                generationBatchCount,

                minimumDomesticRoutesRequired:
                    MINIMUM_DOMESTIC_ROUTES,

                preferredDomesticRoutes:
                    PREFERRED_DOMESTIC_ROUTES,

                maximumReturnedRoutes:
                    MAX_RETURNED_DOMESTIC_ROUTES,

                rejectedInternationalRouteCount:
                    rejectedInternationalRoutes.length,

                rejectedSimilarRouteCount:
                    rejectedSimilarRoutes.length,

                routeSelection:
                    routeSelection.reason,

                bestRoute:
                    bestRoute
                        ? {

                            routeNumber:
                                bestRoute.routeNumber,

                            distanceKm:
                                bestRoute.distanceKm,

                            durationMin:
                                bestRoute.durationMin,

                            durationSeconds:
                                bestRoute.durationSeconds,

                            safetyScore:
                                bestRoute.safetyScore,

                            hazardRisk:
                                bestRoute.hazardRisk,

                            international:
                                false,

                            borderWarning:
                                null,

                            countriesCrossed:
                                bestRoute.countriesCrossed,

                            countryCodes:
                                bestRoute.countryCodes,

                            borderAssessment:
                                bestRoute.borderAssessment,

                            generationStrategy:
                                bestRoute.generationStrategy,

                            hazardDataUnavailable:
                                bestRoute.hazardDataUnavailable,

                            hazardDataUnavailableReason:
                                bestRoute.hazardDataUnavailableReason

                        }
                        : null,

                rejectedSimilarRoutes,

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
// VENDOR OMS
// ============================================================

async function handleCreateVendor(
    req,
    res
) {

    try {

        const body =
            await readBody(req);

        const validationError =
            validateVendorRequest(
                body
            );

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

        const vendor =
            vendorService.createVendor(
                body
            );

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
// FLEET OMS
// ============================================================

async function handleCreateVehicle(
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

        const body =
            await readBody(req);

        const validationError =
            validateVehicleRequest(
                body
            );

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

        const vehicle =
            fleetService.createVehicle(
                vendorId,
                body
            );

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

function handleGetVendorVehicles(
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

        const vehicles =
            fleetService.getVendorVehicles(
                vendorId
            );

        sendJSON(
            res,
            200,
            {

                count:
                    vehicles.length,

                vehicles

            }
        );

    } catch (error) {

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve vehicles"
            }
        );

    }

}

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
// SHIPMENT OMS
// ============================================================

async function handleCreateShipment(
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

        const body =
            await readBody(req);

        const validationError =
            validateShipmentRequest(
                body
            );

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
            Number(
                body.load
            );

        if (
            !Number.isFinite(load) ||
            load < 0
        ) {

            sendJSON(
                res,
                400,
                {
                    error:
                        "Shipment load must be a valid non-negative number"
                }
            );

            return;

        }

        if (
            load >
            Number(
                vehicle.capacity
            )
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

        const shipment =
            shipmentService.createShipment(
                vendorId,
                body
            );

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

function handleGetVendorShipments(
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

        const shipments =
            shipmentService.getVendorShipments(
                vendorId
            );

        sendJSON(
            res,
            200,
            {

                count:
                    shipments.length,

                shipments

            }
        );

    } catch (error) {

        sendJSON(
            res,
            500,
            {
                error:
                    "Failed to retrieve shipments"
            }
        );

    }

}

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

        if (
            body.vehicleId !==
            undefined
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
                body.load !==
                undefined
                    ? Number(
                        body.load
                    )
                    : Number(
                        existingShipment.load
                    );

            if (
                !Number.isFinite(load) ||
                load < 0
            ) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            "Shipment load must be a valid non-negative number"
                    }
                );

                return;

            }

            if (
                load >
                Number(
                    vehicle.capacity
                )
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

        if (
            body.load !==
            undefined
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
                Number(
                    body.load
                );

            if (
                !Number.isFinite(load) ||
                load < 0
            ) {

                sendJSON(
                    res,
                    400,
                    {
                        error:
                            "Shipment load must be a valid non-negative number"
                    }
                );

                return;

            }

            if (
                load >
                Number(
                    vehicle.capacity
                )
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
// ROUTE SELECTION POLICY
// ============================================================

const ROUTE_SELECTION_CONFIG = {

    safetyTolerance:
        2.00,

    significantSafetyImprovement:
        3.00,

    maximumEquivalentDistanceOverhead:
        0.25

};

// ============================================================
// SELECT BEST ROUTE
// ============================================================

function selectBestSafetyRoute(
    routes
) {

    if (
        !routes ||
        routes.length === 0
    ) {

        return {

            bestRoute:
                null,

            reason:
                null

        };

    }

    if (
        routes.length === 1
    ) {

        return {

            bestRoute:
                routes[0],

            reason: {

                strategy:
                    "SAFETY_FIRST_WITH_EFFICIENCY_TIE_BREAK",

                selectedBecause:
                    "Only distinct domestic route available",

                safestRouteNumber:
                    routes[0].routeNumber,

                selectedRouteNumber:
                    routes[0].routeNumber,

                safetyDifference:
                    0,

                distanceOverhead:
                    0

            }

        };

    }

    const safestRoute =
        routes.reduce(
            (
                best,
                current
            ) => {

                const currentSafety =
                    Number(
                        current.safetyScore
                    ) || 0;

                const bestSafety =
                    Number(
                        best.safetyScore
                    ) || 0;

                return currentSafety >
                    bestSafety
                    ? current
                    : best;

            }
        );

    const safestScore =
        Number(
            safestRoute.safetyScore
        ) || 0;

    const safestDistance =
        Number(
            safestRoute.distanceKm
        ) || Infinity;

    const safetyEquivalentRoutes =
        routes.filter(
            route => {

                const safety =
                    Number(
                        route.safetyScore
                    ) || 0;

                return (
                    safestScore -
                    safety
                ) <=
                ROUTE_SELECTION_CONFIG
                    .safetyTolerance;

            }
        );

    const shortestEquivalentRoute =
        safetyEquivalentRoutes.reduce(
            (
                best,
                current
            ) => {

                if (!best) {

                    return current;

                }

                const currentDistance =
                    Number(
                        current.distanceKm
                    ) || Infinity;

                const bestDistance =
                    Number(
                        best.distanceKm
                    ) || Infinity;

                if (
                    currentDistance <
                    bestDistance
                ) {

                    return current;

                }

                if (
                    currentDistance ===
                    bestDistance
                ) {

                    const currentDuration =
                        Number(
                            current.durationMin
                        ) || Infinity;

                    const bestDuration =
                        Number(
                            best.durationMin
                        ) || Infinity;

                    return currentDuration <
                        bestDuration
                        ? current
                        : best;

                }

                return best;

            },
            null
        );

    if (
        !shortestEquivalentRoute
    ) {

        return {

            bestRoute:
                safestRoute,

            reason: {

                strategy:
                    "SAFETY_FIRST_WITH_EFFICIENCY_TIE_BREAK",

                selectedBecause:
                    "Highest safety route",

                safestRouteNumber:
                    safestRoute.routeNumber,

                selectedRouteNumber:
                    safestRoute.routeNumber,

                safetyDifference:
                    0,

                distanceOverhead:
                    0

            }

        };

    }

    const selectedSafety =
        Number(
            shortestEquivalentRoute
                .safetyScore
        ) || 0;

    const safetyDifference =
        safestScore -
        selectedSafety;

    const selectedDistance =
        Number(
            shortestEquivalentRoute
                .distanceKm
        ) || Infinity;

    const distanceOverhead =
        Number.isFinite(
            safestDistance
        ) &&
        safestDistance > 0

            ? (
                selectedDistance -
                safestDistance
            ) /
            safestDistance

            : 0;

    let bestRoute =
        safestRoute;

    let selectedBecause =
        "Highest safety route";

    if (
        shortestEquivalentRoute
            .routeNumber ===
        safestRoute.routeNumber
    ) {

        bestRoute =
            safestRoute;

        selectedBecause =
            "Highest safety route was also the most efficient among equivalent-safe routes";

    } else if (
        safetyDifference <=
        ROUTE_SELECTION_CONFIG
            .safetyTolerance
    ) {

        bestRoute =
            shortestEquivalentRoute;

        selectedBecause =
            "Safety was effectively equivalent, so the shorter route was selected";

    } else if (
        safetyDifference >=
        ROUTE_SELECTION_CONFIG
            .significantSafetyImprovement
    ) {

        bestRoute =
            safestRoute;

        selectedBecause =
            "Safety improvement was significant enough to justify the safer route";

    } else if (
        distanceOverhead >
        ROUTE_SELECTION_CONFIG
            .maximumEquivalentDistanceOverhead
    ) {

        bestRoute =
            shortestEquivalentRoute;

        selectedBecause =
            "Safety improvement was moderate but the additional distance was excessive";

    } else {

        bestRoute =
            safestRoute;

        selectedBecause =
            "Safety improvement justified the limited additional distance";

    }

    return {

        bestRoute,

        reason: {

            strategy:
                "SAFETY_FIRST_WITH_EFFICIENCY_TIE_BREAK",

            selectedBecause,

            safestRouteNumber:
                safestRoute.routeNumber,

            selectedRouteNumber:
                bestRoute.routeNumber,

            safestScore,

            selectedScore:
                Number(
                    bestRoute.safetyScore
                ) || 0,

            safetyDifference,

            safestDistance,

            selectedDistance:
                Number(
                    bestRoute.distanceKm
                ) || 0,

            distanceOverhead,

            safetyTolerance:
                ROUTE_SELECTION_CONFIG
                    .safetyTolerance

        }

    };

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
                "Generation Strategy:",
                route.generationStrategy
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
                "Duration Sec.  :",
                route.durationSeconds
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

            console.log(
                "International  :",
                route.international
            );

            console.log(
                "Countries      :",
                route.countriesCrossed
            );

            console.log(
                "Country Codes  :",
                route.countryCodes
            );

            if (
                route.hazardDataUnavailable
            ) {

                console.log(
                    "Hazard Data    : UNAVAILABLE / CONSERVATIVE FALLBACK"
                );

                console.log(
                    "Hazard Reason  :",
                    route.hazardDataUnavailableReason
                );

            }

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
            "DISTANCE:",
            `${bestRoute.distanceKm} km`
        );

        console.log(
            "ESTIMATED TIME:",
            `${bestRoute.durationMin} min`
        );

        console.log(
            "INTERNATIONAL:",
            bestRoute.international
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
        async (
            req,
            res
        ) => {

            // =================================================
            // CORS PREFLIGHT
            // =================================================

            if (
                req.method ===
                "OPTIONS"
            ) {

                res.writeHead(
                    204,
                    CORS_HEADERS
                );

                res.end();

                return;

            }

            const path =
                getPath(
                    req.url
                );

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
                            "v0.9",

                        routeScope:
                            "INDIA_ONLY",

                        modules: {

                            routing:
                                "ACTIVE - PROGRESSIVE + DIVERSITY FILTER",

                            hazardAssessment:
                                "ACTIVE",

                            environmentalDataCollection:
                                "ACTIVE",

                            safetyScoring:
                                "ACTIVE",

                            vendorOMS:
                                "ACTIVE",

                            fleetOMS:
                                "ACTIVE",

                            shipmentOMS:
                                "ACTIVE",

                            internationalBorderAssessment:
                                "ACTIVE - HARD REJECTION POLICY",

                            routeSelection:
                                "SAFETY_FIRST_WITH_EFFICIENCY_TIE_BREAK",

                            progressiveRouteSearch:
                                "ACTIVE - BORDER + SIMILARITY CHECK AFTER EVERY BATCH"

                        }

                    }
                );

                return;

            }

            // =================================================
            // HEALTH
            // =================================================

            if (
                req.method === "GET" &&
                path === "/health"
            ) {

                sendJSON(
                    res,
                    200,
                    {

                        status:
                            "OK",

                        service:
                            "SILP backend",

                        version:
                            "v0.9",

                        routeScope:
                            "INDIA_ONLY",

                        routing:
                            true,

                        progressiveRouteSearch:
                            true,

                        routeDiversityFiltering:
                            true,

                        minimumDomesticRoutes:
                            MINIMUM_DOMESTIC_ROUTES,

                        preferredDomesticRoutes:
                            PREFERRED_DOMESTIC_ROUTES,

                        maximumReturnedRoutes:
                            MAX_RETURNED_DOMESTIC_ROUTES,

                        environmentalDataCollection:
                            true,

                        hazardAssessment:
                            true,

                        safetyScoring:
                            true,

                        internationalBorderAssessment:
                            true,

                        internationalRoutesSupported:
                            false,

                        internationalRoutePolicy:
                            "HARD_REJECTION",

                        vendorOMS:
                            true,

                        fleetOMS:
                            true,

                        shipmentOMS:
                            true

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
                            "Progressive dynamic hazard-aware routing with domestic route diversity filtering",

                        routeScope:
                            "INDIA_ONLY",

                        optimization:
                            "Safety-first selection with efficiency tie-break; domestic routes only; ACO pending",

                        routeGeneration:
                            "OSRM batch -> immediate border validation -> geometry similarity filtering -> next batch until preferred target",

                        minimumDomesticRoutes:
                            MINIMUM_DOMESTIC_ROUTES,

                        preferredDomesticRoutes:
                            PREFERRED_DOMESTIC_ROUTES,

                        maximumReturnedRoutes:
                            MAX_RETURNED_DOMESTIC_ROUTES

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
            // VENDOR VEHICLES
            // =================================================

            const vendorVehiclesMatch =
                path.match(
                    /^\/vendors\/([^/]+)\/vehicles$/
                );

            if (
                vendorVehiclesMatch
            ) {

                const vendorId =
                    vendorVehiclesMatch[1];

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
            // VENDOR SHIPMENTS
            // =================================================

            const vendorShipmentsMatch =
                path.match(
                    /^\/vendors\/([^/]+)\/shipments$/
                );

            if (
                vendorShipmentsMatch
            ) {

                const vendorId =
                    vendorShipmentsMatch[1];

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
            // VENDOR ID
            // =================================================

            const vendorMatch =
                path.match(
                    /^\/vendors\/([^/]+)$/
                );

            if (
                vendorMatch
            ) {

                const vendorId =
                    vendorMatch[1];

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
            // VEHICLE ID
            // =================================================

            const vehicleMatch =
                path.match(
                    /^\/vehicles\/([^/]+)$/
                );

            if (
                vehicleMatch
            ) {

                const vehicleId =
                    vehicleMatch[1];

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
            // SHIPMENT ID
            // =================================================

            const shipmentMatch =
                path.match(
                    /^\/shipments\/([^/]+)$/
                );

            if (
                shipmentMatch
            ) {

                const shipmentId =
                    shipmentMatch[1];

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
            "       SILP BACKEND SERVER v0.9"
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

        console.log("");

        console.log(
            "ROUTE POLICY: INDIA ONLY"
        );

        console.log(
            "International routes: NOT SUPPORTED"
        );

        console.log(
            "International candidates: HARD DISCARDED"
        );

        console.log(
            "Unverified candidates: HARD DISCARDED"
        );

        console.log(
            "Border validation: FULL POLYLINE / ~5 KM SAMPLING"
        );

        console.log(
            "Route search: PROGRESSIVE"
        );

        console.log(
            "Minimum domestic routes: 1"
        );

        console.log(
            "Preferred domestic routes: 2"
        );

        console.log(
            "Maximum returned routes: 3"
        );

        console.log(
            "Route diversity: GEOMETRY SIMILARITY FILTER"
        );

        console.log(
            "Border check: AFTER EVERY OSRM BATCH"
        );

        console.log(
            "Next OSRM batch: ONLY IF < 2 DISTINCT DOMESTIC ROUTES"
        );

        console.log(
            "Environmental scoring: DOMESTIC ROUTES ONLY"
        );

        console.log(
            "======================================"
        );

        console.log("");

    }
);