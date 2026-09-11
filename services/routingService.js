// ============================================================
// SILP - ROUTING SERVICE
// ============================================================
//
// Smart Intelligence Logistics Platform
//
// Responsibilities:
//
// 1. OSRM road routing
// 2. India-only domestic route generation
// 3. Domestic corridor fallback
// 4. Waypoint-based route generation
// 5. International-route rejection
// 6. Route geometry normalization
// 7. Route diversity / duplicate detection
//
// IMPORTANT:
//
// ACO is NOT used for route generation here.
// ACO is reserved for future fleet optimisation.
//
// Route flow:
//
//     OSRM
//       ↓
//     Border / domestic validation
//       ↓
//     Route geometry validation
//       ↓
//     Route diversity filtering
//       ↓
//     Accepted domestic route
//
// ============================================================

const {
    assessRouteLeg
} = require("./borderService");

// ============================================================
// SERVICE VERSION
// ============================================================

const ROUTING_SERVICE_VERSION =
    "v0.9.2-coordinate-fix";

console.log(
    `[routingService] Loaded ${ROUTING_SERVICE_VERSION}`
);

// ============================================================
// CONFIGURATION
// ============================================================

const OSRM_BASE_URL =
    "https://router.project-osrm.org/route/v1/driving";

const OSRM_TIMEOUT_MS =
    30000;

const MAX_STANDARD_ROUTES =
    2;

const MAX_WAYPOINT_STRATEGIES =
    6;

const MIN_ROUTE_DISTANCE_KM =
    1;

// ============================================================
// ROUTE QUALITY LIMITS
// ============================================================

const MAX_FALLBACK_LEG_DETOUR_RATIO =
    1.85;

const MAX_COMPLETE_ROUTE_DETOUR_RATIO =
    1.75;

const MIN_COMPLETE_ROUTE_ALLOWANCE_KM =
    80;

// ============================================================
// ROUTE DIVERSITY CONFIGURATION
// ============================================================

const ROUTE_SHARE_FACTOR_THRESHOLD =
    0.90;

const ROUTE_SHARE_DISTANCE_TOLERANCE_KM =
    3;

const ROUTE_SHARE_SAMPLE_INTERVAL_KM =
    2;

// ============================================================
// DOMESTIC ANCHORS
// ============================================================

const DOMESTIC_ANCHORS = [

    // --------------------------------------------------------
    // NORTH / NORTH-CENTRAL INDIA
    // --------------------------------------------------------

    {
        name: "Delhi",
        lat: 28.6139,
        lon: 77.2090
    },

    {
        name: "Agra",
        lat: 27.1767,
        lon: 78.0081
    },

    {
        name: "Kanpur",
        lat: 26.4499,
        lon: 80.3319
    },

    {
        name: "Lucknow",
        lat: 26.8467,
        lon: 80.9462
    },

    {
        name: "Varanasi",
        lat: 25.3176,
        lon: 82.9739
    },

    {
        name: "Ayodhya",
        lat: 26.7922,
        lon: 82.1998
    },

    {
        name: "Gorakhpur",
        lat: 26.7606,
        lon: 83.3732
    },

    {
        name: "Patna",
        lat: 25.5941,
        lon: 85.1376
    },

    {
        name: "Muzaffarpur",
        lat: 26.1197,
        lon: 85.3910
    },

    {
        name: "Purnia",
        lat: 25.7771,
        lon: 87.4753
    },

    {
        name: "Kishanganj",
        lat: 26.1020,
        lon: 87.9550
    },

    {
        name: "Siliguri",
        lat: 26.7271,
        lon: 88.3953
    },

    // --------------------------------------------------------
    // EAST
    // --------------------------------------------------------

    {
        name: "Kolkata",
        lat: 22.5726,
        lon: 88.3639
    },

    {
        name: "Bhubaneswar",
        lat: 20.2961,
        lon: 85.8245
    },

    {
        name: "Raipur",
        lat: 21.2514,
        lon: 81.6296
    },

    {
        name: "Jabalpur",
        lat: 23.1815,
        lon: 79.9864
    },

    {
        name: "Nagpur",
        lat: 21.1458,
        lon: 79.0882
    },

    // --------------------------------------------------------
    // NORTH-EAST
    // --------------------------------------------------------

    {
        name: "Gangtok",
        lat: 27.3389,
        lon: 88.6065
    },

    {
        name: "Guwahati",
        lat: 26.1445,
        lon: 91.7362
    },

    {
        name: "Shillong",
        lat: 25.5788,
        lon: 91.8933
    },

    {
        name: "Silchar",
        lat: 24.8333,
        lon: 92.7789
    },

    {
        name: "Aizawl",
        lat: 23.7271,
        lon: 92.7176
    },

    {
        name: "Agartala",
        lat: 23.8315,
        lon: 91.2868
    },

    {
        name: "Dimapur",
        lat: 25.5788,
        lon: 93.7244
    },

    {
        name: "Kohima",
        lat: 25.6751,
        lon: 94.1086
    },

    {
        name: "Imphal",
        lat: 24.8170,
        lon: 93.9368
    },

    {
        name: "Dibrugarh",
        lat: 27.4728,
        lon: 94.9120
    },

    {
        name: "Itanagar",
        lat: 27.0844,
        lon: 93.6053
    }

];

// ============================================================
// CONTROLLED DOMESTIC CORRIDORS
// ============================================================

const DOMESTIC_CORRIDORS = [

    {
        name:
            "delhi-agra-kanpur-lucknow",

        points: [
            "Delhi",
            "Agra",
            "Kanpur",
            "Lucknow"
        ]
    },

    {
        name:
            "delhi-agra-kanpur-varanasi-patna",

        points: [
            "Delhi",
            "Agra",
            "Kanpur",
            "Varanasi",
            "Patna"
        ]
    },

    {
        name:
            "lucknow-ayodhya-gorakhpur",

        points: [
            "Lucknow",
            "Ayodhya",
            "Gorakhpur"
        ]
    },

    {
        name:
            "lucknow-gorakhpur-siliguri",

        points: [
            "Lucknow",
            "Gorakhpur",
            "Siliguri"
        ]
    },

    {
        name:
            "lucknow-varanasi-patna",

        points: [
            "Lucknow",
            "Varanasi",
            "Patna"
        ]
    },

    {
        name:
            "patna-muzaffarpur-purnia-kishanganj-siliguri",

        points: [
            "Patna",
            "Muzaffarpur",
            "Purnia",
            "Kishanganj",
            "Siliguri"
        ]
    },

    {
        name:
            "varanasi-gorakhpur-patna",

        points: [
            "Varanasi",
            "Gorakhpur",
            "Patna"
        ]
    },

    {
        name:
            "siliguri-purnia-patna-varanasi",

        points: [
            "Siliguri",
            "Purnia",
            "Patna",
            "Varanasi"
        ]
    },

    {
        name:
            "siliguri-guwahati",

        points: [
            "Siliguri",
            "Guwahati"
        ]
    },

    {
        name:
            "siliguri-purnia-patna",

        points: [
            "Siliguri",
            "Purnia",
            "Patna"
        ]
    },

    {
        name:
            "siliguri-gangtok",

        points: [
            "Siliguri",
            "Gangtok"
        ]
    },

    {
        name:
            "jabalpur-raipur-bhubaneswar-kolkata",

        points: [
            "Jabalpur",
            "Raipur",
            "Bhubaneswar",
            "Kolkata"
        ]
    },

    {
        name:
            "raipur-bhubaneswar-kolkata",

        points: [
            "Raipur",
            "Bhubaneswar",
            "Kolkata"
        ]
    },

    {
        name:
            "bhubaneswar-kolkata",

        points: [
            "Bhubaneswar",
            "Kolkata"
        ]
    },

    {
        name:
            "kolkata-siliguri",

        points: [
            "Kolkata",
            "Siliguri"
        ]
    },

    {
        name:
            "jabalpur-varanasi-patna",

        points: [
            "Jabalpur",
            "Varanasi",
            "Patna"
        ]
    },

    {
        name:
            "nagpur-jabalpur-varanasi",

        points: [
            "Nagpur",
            "Jabalpur",
            "Varanasi"
        ]
    },

    {
        name:
            "guwahati-shillong-silchar",

        points: [
            "Guwahati",
            "Shillong",
            "Silchar"
        ]
    },

    {
        name:
            "guwahati-silchar",

        points: [
            "Guwahati",
            "Silchar"
        ]
    },

    {
        name:
            "silchar-aizawl",

        points: [
            "Silchar",
            "Aizawl"
        ]
    },

    {
        name:
            "silchar-agartala",

        points: [
            "Silchar",
            "Agartala"
        ]
    },

    {
        name:
            "guwahati-dimapur-kohima-imphal",

        points: [
            "Guwahati",
            "Dimapur",
            "Kohima",
            "Imphal"
        ]
    },

    {
        name:
            "guwahati-dimapur-imphal",

        points: [
            "Guwahati",
            "Dimapur",
            "Imphal"
        ]
    },

    {
        name:
            "guwahati-itanagar",

        points: [
            "Guwahati",
            "Itanagar"
        ]
    },

    {
        name:
            "guwahati-dibrugarh-itanagar",

        points: [
            "Guwahati",
            "Dibrugarh",
            "Itanagar"
        ]
    },

    {
        name:
            "guwahati-dibrugarh",

        points: [
            "Guwahati",
            "Dibrugarh"
        ]
    }

];

// ============================================================
// BASIC UTILITIES
// ============================================================

function normalizeText(
    value
) {

    return String(
        value || ""
    )
        .trim()
        .toLowerCase();

}

// ============================================================
// COORDINATE NORMALIZATION
// ============================================================
//
// Supported forms:
//
// [longitude, latitude]
//
// {
//     lon,
//     lat
// }
//
// {
//     longitude,
//     latitude
// }
//
// {
//     lng,
//     lat
// }
//
// ============================================================

function normalizeCoordinate(
    coordinate
) {

    if (
        Array.isArray(coordinate) &&
        coordinate.length >= 2
    ) {

        const lon =
            Number(
                coordinate[0]
            );

        const lat =
            Number(
                coordinate[1]
            );

        if (
            Number.isFinite(lon) &&
            Number.isFinite(lat)
        ) {

            return [
                lon,
                lat
            ];

        }

    }

    if (
        coordinate &&
        typeof coordinate === "object"
    ) {

        const lon =
            Number(
                coordinate.lon ??
                coordinate.lng ??
                coordinate.longitude
            );

        const lat =
            Number(
                coordinate.lat ??
                coordinate.latitude
            );

        if (
            Number.isFinite(lon) &&
            Number.isFinite(lat)
        ) {

            return [
                lon,
                lat
            ];

        }

    }

    return null;

}

// ============================================================
// LOCATION DISPLAY NAME
// ============================================================
//
// Used only for logging.
//
// This prevents:
//
//     source -> destination
//
// when the actual objects are coordinate arrays.
//
// ============================================================

function getLocationDisplayName(
    location
) {

    if (
        location &&
        typeof location === "object" &&
        !Array.isArray(location) &&
        location.name
    ) {

        return String(
            location.name
        );

    }

    const coordinate =
        normalizeCoordinate(
            location
        );

    if (
        coordinate
    ) {

        return (
            `[${coordinate[1].toFixed(4)}, ` +
            `${coordinate[0].toFixed(4)}]`
        );

    }

    return "unknown";

}

// ============================================================
// HAVERSINE
// ============================================================

function haversineDistanceKm(
    a,
    b
) {

    const first =
        normalizeCoordinate(a);

    const second =
        normalizeCoordinate(b);

    if (
        !first ||
        !second
    ) {

        return Infinity;

    }

    const lon1 =
        first[0];

    const lat1 =
        first[1];

    const lon2 =
        second[0];

    const lat2 =
        second[1];

    const earthRadiusKm =
        6371.0088;

    const latDelta =
        (
            (lat2 - lat1) *
            Math.PI
        ) /
        180;

    const lonDelta =
        (
            (lon2 - lon1) *
            Math.PI
        ) /
        180;

    const lat1Rad =
        (
            lat1 *
            Math.PI
        ) /
        180;

    const lat2Rad =
        (
            lat2 *
            Math.PI
        ) /
        180;

    const aValue =
        Math.sin(
            latDelta / 2
        ) ** 2 +
        Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(
            lonDelta / 2
        ) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(aValue),
            Math.sqrt(
                1 - aValue
            )
        );

    return earthRadiusKm * c;

}

// ============================================================
// SAME PLACE
// ============================================================

function samePlace(
    first,
    second
) {

    const a =
        normalizeCoordinate(first);

    const b =
        normalizeCoordinate(second);

    if (
        !a ||
        !b
    ) {

        return false;

    }

    return (
        haversineDistanceKm(
            a,
            b
        ) < 2
    );

}

// ============================================================
// DUPLICATE WAYPOINT REMOVAL
// ============================================================

function removeDuplicateWaypoints(
    waypoints
) {

    if (
        !Array.isArray(waypoints)
    ) {

        return [];

    }

    const result = [];

    for (
        const waypoint of waypoints
    ) {

        if (
            !waypoint
        ) {

            continue;

        }

        const coordinate =
            normalizeCoordinate(
                waypoint
            );

        if (
            !coordinate
        ) {

            continue;

        }

        const duplicate =
            result.some(
                existing =>
                    samePlace(
                        existing,
                        coordinate
                    )
            );

        if (
            !duplicate
        ) {

            result.push(
                waypoint
            );

        }

    }

    return result;

}

// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
    url,
    options = {},
    timeoutMs = OSRM_TIMEOUT_MS
) {

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            timeoutMs
        );

    try {

        return await fetch(
            url,
            {
                ...options,
                signal:
                    controller.signal
            }
        );

    } finally {

        clearTimeout(
            timeout
        );

    }

}

// ============================================================
// BUILD OSRM COORDINATE STRING
// ============================================================
//
// IMPORTANT:
//
// This function previously assumed every location was an
// object containing .lon/.lat.
//
// Waypoint strategies can contain coordinate arrays.
//
// We now normalize both forms before building the OSRM URL.
//
// ============================================================

function buildOSRMCoordinateString(
    source,
    destination
) {

    const sourceCoordinate =
        normalizeCoordinate(
            source
        );

    const destinationCoordinate =
        normalizeCoordinate(
            destination
        );

    if (
        !sourceCoordinate ||
        !destinationCoordinate
    ) {

        throw new Error(
            "INVALID_OSRM_COORDINATES"
        );

    }

    const sourceLon =
        sourceCoordinate[0];

    const sourceLat =
        sourceCoordinate[1];

    const destinationLon =
        destinationCoordinate[0];

    const destinationLat =
        destinationCoordinate[1];

    return (
        `${sourceLon},${sourceLat};` +
        `${destinationLon},${destinationLat}`
    );

}

// ============================================================
// REQUEST OSRM
// ============================================================

async function requestOSRMRoute(
    source,
    destination
) {

    let coordinateString;

    try {

        coordinateString =
            buildOSRMCoordinateString(
                source,
                destination
            );

    } catch (
        error
    ) {

        throw new Error(
            `INVALID_OSRM_COORDINATES: ` +
            `${getLocationDisplayName(source)} -> ` +
            `${getLocationDisplayName(destination)}`
        );

    }

    const url =
        `${OSRM_BASE_URL}/${coordinateString}` +
        "?overview=full" +
        "&geometries=geojson" +
        "&steps=true" +
        "&alternatives=true";

    console.log("");

    console.log(
        "Requesting OSRM:"
    );

    console.log(
        `${getLocationDisplayName(source)} -> ` +
        `${getLocationDisplayName(destination)}`
    );

    const response =
        await fetchWithTimeout(
            url
        );

    if (
        !response.ok
    ) {

        throw new Error(
            `OSRM HTTP ${response.status}`
        );

    }

    const data =
        await response.json();

    if (
        !data ||
        data.code !== "Ok"
    ) {

        throw new Error(
            `OSRM returned ${data && data.code
                ? data.code
                : "unknown error"}`
        );

    }

    const routes =
        Array.isArray(
            data.routes
        )
            ? data.routes
            : [];

    console.log(
        "OSRM routes returned:",
        routes.length
    );

    return routes;

}

// ============================================================
// ROUTE COORDINATES
// ============================================================

function getRouteCoordinates(
    route
) {

    if (
        route &&
        route.geometry &&
        Array.isArray(
            route.geometry.coordinates
        )
    ) {

        return route.geometry.coordinates
            .map(
                normalizeCoordinate
            )
            .filter(Boolean);

    }

    if (
        route &&
        Array.isArray(
            route.coordinates
        )
    ) {

        return route.coordinates
            .map(
                normalizeCoordinate
            )
            .filter(Boolean);

    }

    return [];

}

// ============================================================
// MERGE COORDINATES
// ============================================================

function mergeCoordinates(
    existing,
    incoming
) {

    const output =
        Array.isArray(existing)
            ? existing.slice()
            : [];

    const next =
        Array.isArray(incoming)
            ? incoming
            : [];

    for (
        const coordinate of next
    ) {

        const normalized =
            normalizeCoordinate(
                coordinate
            );

        if (
            !normalized
        ) {

            continue;

        }

        if (
            output.length === 0
        ) {

            output.push(
                normalized
            );

            continue;

        }

        const previous =
            output[
                output.length - 1
            ];

        if (
            haversineDistanceKm(
                previous,
                normalized
            ) > 0.001
        ) {

            output.push(
                normalized
            );

        }

    }

    return output;

}

// ============================================================
// GEOMETRY DISTANCE
// ============================================================

function calculateGeometryDistanceKm(
    coordinates
) {

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {

        return 0;

    }

    let total =
        0;

    for (
        let index = 1;
        index < coordinates.length;
        index++
    ) {

        total +=
            haversineDistanceKm(
                coordinates[index - 1],
                coordinates[index]
            );

    }

    return total;

}

// ============================================================
// ROUTE DETOUR VALIDATION
// ============================================================

function validateCompleteRouteDetour(
    coordinates,
    source,
    destination
) {

    const routeDistance =
        calculateGeometryDistanceKm(
            coordinates
        );

    const sourceCoordinate =
        normalizeCoordinate(
            source
        );

    const destinationCoordinate =
        normalizeCoordinate(
            destination
        );

    if (
        routeDistance <= 0 ||
        !sourceCoordinate ||
        !destinationCoordinate
    ) {

        return {

            valid: false,

            ratio: Infinity,

            routeDistanceKm:
                routeDistance,

            straightLineDistanceKm:
                0,

            reason:
                "INVALID_ROUTE_GEOMETRY"

        };

    }

    const straightLineDistance =
        haversineDistanceKm(
            sourceCoordinate,
            destinationCoordinate
        );

    if (
        straightLineDistance <= 0
    ) {

        return {

            valid: true,

            ratio: 1,

            routeDistanceKm:
                routeDistance,

            straightLineDistanceKm:
                straightLineDistance,

            reason:
                "VALID"

        };

    }

    const ratio =
        routeDistance /
        straightLineDistance;

    const maximumAllowed =
        Math.max(
            straightLineDistance *
            MAX_COMPLETE_ROUTE_DETOUR_RATIO,
            straightLineDistance +
            MIN_COMPLETE_ROUTE_ALLOWANCE_KM
        );

    const valid =
        routeDistance <=
        maximumAllowed;

    return {

        valid,

        ratio,

        routeDistanceKm:
            routeDistance,

        straightLineDistanceKm:
            straightLineDistance,

        maximumAllowedKm:
            maximumAllowed,

        reason:
            valid
                ? "VALID"
                : "EXCESSIVE_COMPLETE_ROUTE_DETOUR"

    };

}

// ============================================================
// ROUTE SEGMENT LENGTHS
// ============================================================

function getRouteSegmentLengths(
    coordinates
) {

    const lengths = [];

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {

        return lengths;

    }

    for (
        let index = 1;
        index < coordinates.length;
        index++
    ) {

        lengths.push(
            haversineDistanceKm(
                coordinates[index - 1],
                coordinates[index]
            )
        );

    }

    return lengths;

}

// ============================================================
// ROUTE CUMULATIVE DISTANCES
// ============================================================

function getRouteCumulativeDistances(
    coordinates
) {

    const cumulative =
        [0];

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {

        return cumulative;

    }

    let total =
        0;

    for (
        let index = 1;
        index < coordinates.length;
        index++
    ) {

        total +=
            haversineDistanceKm(
                coordinates[index - 1],
                coordinates[index]
            );

        cumulative.push(
            total
        );

    }

    return cumulative;

}

// ============================================================
// INTERPOLATE COORDINATE
// ============================================================

function interpolateCoordinate(
    first,
    second,
    fraction
) {

    const a =
        normalizeCoordinate(first);

    const b =
        normalizeCoordinate(second);

    if (
        !a ||
        !b
    ) {

        return null;

    }

    const t =
        Math.max(
            0,
            Math.min(
                1,
                fraction
            )
        );

    return [

        a[0] +
        (
            b[0] -
            a[0]
        ) * t,

        a[1] +
        (
            b[1] -
            a[1]
        ) * t

    ];

}

// ============================================================
// SAMPLE ROUTE BY DISTANCE
// ============================================================

function sampleRouteByDistance(
    coordinates,
    intervalKm =
        ROUTE_SHARE_SAMPLE_INTERVAL_KM
) {

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {

        return [];

    }

    const segmentLengths =
        getRouteSegmentLengths(
            coordinates
        );

    const cumulative =
        getRouteCumulativeDistances(
            coordinates
        );

    const totalDistance =
        cumulative[
            cumulative.length - 1
        ];

    if (
        !Number.isFinite(totalDistance) ||
        totalDistance <= 0
    ) {

        return [];

    }

    const samples = [];

    let targetDistance =
        0;

    let segmentIndex =
        0;

    while (
        targetDistance <
        totalDistance
    ) {

        while (
            segmentIndex <
                segmentLengths.length - 1 &&
            cumulative[
                segmentIndex + 1
            ] <
            targetDistance
        ) {

            segmentIndex++;

        }

        const segmentStartDistance =
            cumulative[
                segmentIndex
            ];

        const segmentLength =
            segmentLengths[
                segmentIndex
            ];

        const fraction =
            segmentLength > 0
                ? (
                    targetDistance -
                    segmentStartDistance
                ) /
                segmentLength
                : 0;

        const coordinate =
            interpolateCoordinate(
                coordinates[
                    segmentIndex
                ],
                coordinates[
                    segmentIndex + 1
                ],
                fraction
            );

        if (
            coordinate
        ) {

            samples.push(
                coordinate
            );

        }

        targetDistance +=
            intervalKm;

    }

    const finalCoordinate =
        coordinates[
            coordinates.length - 1
        ];

    if (
        samples.length === 0 ||
        haversineDistanceKm(
            samples[
                samples.length - 1
            ],
            finalCoordinate
        ) >
        intervalKm * 0.25
    ) {

        samples.push(
            finalCoordinate
        );

    }

    return samples;

}

// ============================================================
// POINT → SEGMENT DISTANCE
// ============================================================

function pointToSegmentDistanceKm(
    point,
    segmentStart,
    segmentEnd
) {

    const p =
        normalizeCoordinate(point);

    const a =
        normalizeCoordinate(segmentStart);

    const b =
        normalizeCoordinate(segmentEnd);

    if (
        !p ||
        !a ||
        !b
    ) {

        return Infinity;

    }

    const earthRadiusKm =
        6371.0088;

    const referenceLat =
        (
            p[1] +
            a[1] +
            b[1]
        ) /
        3;

    const radians =
        Math.PI /
        180;

    const cosLat =
        Math.cos(
            referenceLat *
            radians
        );

    const ax =
        a[0] *
        radians *
        cosLat *
        earthRadiusKm;

    const ay =
        a[1] *
        radians *
        earthRadiusKm;

    const bx =
        b[0] *
        radians *
        cosLat *
        earthRadiusKm;

    const by =
        b[1] *
        radians *
        earthRadiusKm;

    const px =
        p[0] *
        radians *
        cosLat *
        earthRadiusKm;

    const py =
        p[1] *
        radians *
        earthRadiusKm;

    const dx =
        bx - ax;

    const dy =
        by - ay;

    const segmentSquared =
        dx * dx +
        dy * dy;

    if (
        segmentSquared === 0
    ) {

        return Math.sqrt(
            (
                px - ax
            ) ** 2 +
            (
                py - ay
            ) ** 2
        );

    }

    const t =
        (
            (
                px - ax
            ) * dx +
            (
                py - ay
            ) * dy
        ) /
        segmentSquared;

    const clampedT =
        Math.max(
            0,
            Math.min(
                1,
                t
            )
        );

    const closestX =
        ax +
        clampedT * dx;

    const closestY =
        ay +
        clampedT * dy;

    return Math.sqrt(
        (
            px - closestX
        ) ** 2 +
        (
            py - closestY
        ) ** 2
    );

}

// ============================================================
// POINT → ENTIRE ROUTE DISTANCE
// ============================================================

function pointToRouteDistanceKm(
    point,
    routeCoordinates
) {

    if (
        !Array.isArray(
            routeCoordinates
        ) ||
        routeCoordinates.length < 2
    ) {

        return Infinity;

    }

    let minimum =
        Infinity;

    for (
        let index = 1;
        index < routeCoordinates.length;
        index++
    ) {

        const distance =
            pointToSegmentDistanceKm(
                point,
                routeCoordinates[
                    index - 1
                ],
                routeCoordinates[
                    index
                ]
            );

        if (
            distance < minimum
        ) {

            minimum =
                distance;

        }

        if (
            minimum <=
            ROUTE_SHARE_DISTANCE_TOLERANCE_KM
        ) {

            return minimum;

        }

    }

    return minimum;

}

// ============================================================
// ONE-WAY ROUTE SHARE
// ============================================================

function calculateOneWayRouteShare(
    sourceCoordinates,
    targetCoordinates
) {

    const samples =
        sampleRouteByDistance(
            sourceCoordinates,
            ROUTE_SHARE_SAMPLE_INTERVAL_KM
        );

    if (
        samples.length === 0
    ) {

        return 0;

    }

    let matchingSamples =
        0;

    for (
        const sample of samples
    ) {

        const distance =
            pointToRouteDistanceKm(
                sample,
                targetCoordinates
            );

        if (
            distance <=
            ROUTE_SHARE_DISTANCE_TOLERANCE_KM
        ) {

            matchingSamples++;

        }

    }

    return (
        matchingSamples /
        samples.length
    );

}

// ============================================================
// SYMMETRIC ROUTE SHARE FACTOR
// ============================================================

function calculateRouteShareFactor(
    routeA,
    routeB
) {

    const coordinatesA =
        getRouteCoordinates(
            routeA
        );

    const coordinatesB =
        getRouteCoordinates(
            routeB
        );

    if (
        coordinatesA.length < 2 ||
        coordinatesB.length < 2
    ) {

        return {

            shareFactor:
                0,

            forwardShare:
                0,

            reverseShare:
                0,

            isSimilar:
                false

        };

    }

    const forwardShare =
        calculateOneWayRouteShare(
            coordinatesA,
            coordinatesB
        );

    const reverseShare =
        calculateOneWayRouteShare(
            coordinatesB,
            coordinatesA
        );

    const shareFactor =
        Math.min(
            forwardShare,
            reverseShare
        );

    const result = {

        shareFactor,

        forwardShare,

        reverseShare,

        isSimilar:
            shareFactor >=
            ROUTE_SHARE_FACTOR_THRESHOLD

    };

    console.log("");

    console.log(
        "================================================"
    );

    console.log(
        "ROUTE SHARE FACTOR ANALYSIS"
    );

    console.log(
        "================================================"
    );

    console.log(
        "Route A:",
        routeA &&
        routeA.routeNumber !== undefined
            ? routeA.routeNumber
            : "unknown"
    );

    console.log(
        "Route B:",
        routeB &&
        routeB.routeNumber !== undefined
            ? routeB.routeNumber
            : "unknown"
    );

    console.log(
        "A → B share:",
        `${(
            forwardShare * 100
        ).toFixed(2)}%`
    );

    console.log(
        "B → A share:",
        `${(
            reverseShare * 100
        ).toFixed(2)}%`
    );

    console.log(
        "Symmetric share factor:",
        `${(
            shareFactor * 100
        ).toFixed(2)}%`
    );

    console.log(
        "Similarity threshold:",
        `${(
            ROUTE_SHARE_FACTOR_THRESHOLD *
            100
        ).toFixed(0)}%`
    );

    console.log(
        "Distance tolerance:",
        `${ROUTE_SHARE_DISTANCE_TOLERANCE_KM} km`
    );

    console.log(
        "Sampling interval:",
        `${ROUTE_SHARE_SAMPLE_INTERVAL_KM} km`
    );

    console.log(
        "Result:",
        result.isSimilar
            ? "TOO SIMILAR"
            : "DISTINCT"
    );

    console.log(
        "================================================"
    );

    return result;

}

// ============================================================
// ROUTE SIMILARITY API
// ============================================================

function isRouteTooSimilar(
    candidateRoute,
    existingRoute
) {

    console.log("");

    console.log(
        "================================================"
    );

    console.log(
        "CHECKING ROUTE DIVERSITY"
    );

    console.log(
        "================================================"
    );

    console.log(
        "Candidate route:",
        candidateRoute &&
        candidateRoute.routeNumber !== undefined
            ? candidateRoute.routeNumber
            : "unknown"
    );

    console.log(
        "Existing route:",
        existingRoute &&
        existingRoute.routeNumber !== undefined
            ? existingRoute.routeNumber
            : "unknown"
    );

    const result =
        calculateRouteShareFactor(
            candidateRoute,
            existingRoute
        );

    if (
        result.isSimilar
    ) {

        console.log("");

        console.log(
            "ROUTE REJECTED:"
        );

        console.log(
            "Geometry overlap/share factor is above the 90% threshold."
        );

        console.log(
            `Share factor: ${(result.shareFactor * 100).toFixed(2)}%`
        );

    } else {

        console.log("");

        console.log(
            "ROUTE ACCEPTED AS DISTINCT:"
        );

        console.log(
            `Share factor: ${(result.shareFactor * 100).toFixed(2)}%`
        );

    }

    console.log(
        "================================================"
    );

    return result.isSimilar;

}

// ============================================================
// NORMALIZE OSRM ROUTE
// ============================================================

// ============================================================
// NORMALIZE OSRM ROUTE
// ============================================================
//
// OSRM normally provides:
//
//     route.distance  -> meters
//     route.duration  -> seconds
//
// Some route responses can expose duration information through
// route.legs instead. Therefore we:
//
// 1. Try route.duration
// 2. Fall back to summing route.legs[].duration
// 3. Preserve 0 only when no usable duration exists
//
// ============================================================

function convertOSRMRoute(
    route
) {

    const coordinates =
        getRouteCoordinates(
            route
        );

    // --------------------------------------------------------
    // DISTANCE
    // --------------------------------------------------------

    const geometryDistanceKm =
        calculateGeometryDistanceKm(
            coordinates
        );

    const osrmDistanceMeters =
        Number(
            route &&
            route.distance
        );

    const distanceMeters =
        Number.isFinite(
            osrmDistanceMeters
        ) &&
        osrmDistanceMeters > 0

            ? osrmDistanceMeters

            : geometryDistanceKm *
                1000;

    // --------------------------------------------------------
    // DURATION
    // --------------------------------------------------------
    //
    // Primary source:
    //
    //     route.duration
    //
    // Fallback:
    //
    //     route.legs[].duration
    //
    // --------------------------------------------------------

    let durationSeconds = 0;

    const osrmDurationSeconds =
        Number(
            route &&
            route.duration
        );

    if (
        Number.isFinite(
            osrmDurationSeconds
        ) &&
        osrmDurationSeconds > 0
    ) {

        durationSeconds =
            osrmDurationSeconds;

    } else if (
        route &&
        Array.isArray(
            route.legs
        )
    ) {

        const legDurations =
            route.legs
                .map(
                    leg =>
                        Number(
                            leg &&
                            leg.duration
                        )
                )
                .filter(
                    duration =>
                        Number.isFinite(
                            duration
                        ) &&
                        duration > 0
                );

        if (
            legDurations.length > 0
        ) {

            durationSeconds =
                legDurations.reduce(
                    (
                        total,
                        duration
                    ) =>
                        total +
                        duration,
                    0
                );

        }

    }

    // --------------------------------------------------------
    // FINAL DURATION
    // --------------------------------------------------------

    const distanceKm =
        distanceMeters /
        1000;

    const durationMin =
        durationSeconds /
        60;

    // --------------------------------------------------------
    // DIAGNOSTIC LOG
    // --------------------------------------------------------

    console.log("");

    console.log(
        "OSRM ROUTE CONVERSION"
    );

    console.log(
        "Distance from OSRM:",
        osrmDistanceMeters
    );

    console.log(
        "Distance from geometry:",
        geometryDistanceKm,
        "km"
    );

    console.log(
        "Duration from route.duration:",
        osrmDurationSeconds
    );

    console.log(
        "Duration from route.legs:",
        route &&
        Array.isArray(route.legs)
            ? route.legs.map(
                leg =>
                    Number(
                        leg &&
                        leg.duration
                    )
            )
            : []
    );

    console.log(
        "Final duration seconds:",
        durationSeconds
    );

    console.log(
        "Final duration minutes:",
        durationMin
    );

    // --------------------------------------------------------
    // RETURN NORMALIZED ROUTE
    // --------------------------------------------------------

    return {

        distanceKm,

        durationMin,

        coordinates,

        distanceMeters,

        durationSeconds,

        geometry:
            route &&
            route.geometry
                ? route.geometry
                : {

                    type:
                        "LineString",

                    coordinates

                },

        legs:
            route &&
            Array.isArray(
                route.legs
            )
                ? route.legs
                : [],

        steps:
            route &&
            Array.isArray(
                route.legs
            )
                ? route.legs.flatMap(
                    leg =>
                        Array.isArray(
                            leg.steps
                        )
                            ? leg.steps
                            : []
                )
                : []

    };

}

// ============================================================
// STANDARD ROUTE BATCH
// ============================================================

async function getStandardRouteBatch(
    source,
    destination
) {

    const routes =
        await requestOSRMRoute(
            source,
            destination
        );

    return routes
        .slice(
            0,
            MAX_STANDARD_ROUTES
        )
        .map(
            (
                route,
                index
            ) => {

                const converted =
                    convertOSRMRoute(
                        route
                    );

                return {

                    ...converted,

                    routeNumber:
                        index + 1,

                    routeStrategy:
                        "standard"

                };

            }
        )
        .filter(
            route =>
                route.distanceKm >=
                MIN_ROUTE_DISTANCE_KM &&
                route.coordinates.length >= 2
        );

}

// ============================================================
// VALIDATE ONE OSRM LEG
// ============================================================

async function validateLeg(
    route,
    source,
    destination
) {

    const coordinates =
        getRouteCoordinates(
            route
        );

    if (
        coordinates.length < 2
    ) {

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

        border =
            await Promise.resolve(
                assessRouteLeg(
                    coordinates,
                    source.countryCode,
                    destination.countryCode
                )
            );

    } catch (
        error
    ) {

        console.error(
            "Leg border assessment failed:",
            error.message ||
            error
        );

        return {

            accepted: false,

            reason:
                "BORDER_ASSESSMENT_FAILED",

            route: null,

            border: null

        };

    }

    const domestic =
        Boolean(
            border &&
            border.international === false
        );

    if (
        !domestic
    ) {

        console.log("");

        console.log(
            `LEG REJECTED: ${getLocationDisplayName(source)} -> ${getLocationDisplayName(destination)}`
        );

        console.log(
            "Reason:",
            border &&
            border.international === true
                ? "INTERNATIONAL_ROUTE"
                : "ROUTE_NOT_VERIFIED_AS_DOMESTIC"
        );

        console.log(
            "Countries:",
            border &&
            border.countriesCrossed
        );

        return {

            accepted: false,

            reason:
                border &&
                border.international === true
                    ? "INTERNATIONAL_ROUTE"
                    : "ROUTE_NOT_VERIFIED_AS_DOMESTIC",

            route: null,

            border

        };

    }

    console.log("");

    console.log(
        `LEG ACCEPTED: ${getLocationDisplayName(source)} -> ${getLocationDisplayName(destination)}`
    );

    return {

        accepted: true,

        reason:
            "VERIFIED_INDIA_ONLY",

        route,

        border

    };

}

// ============================================================
// TRY DIRECT DOMESTIC LEG
// ============================================================

async function tryDirectLeg(
    source,
    destination
) {

    let routes;

    try {

        routes =
            await requestOSRMRoute(
                source,
                destination
            );

    } catch (
        error
    ) {

        console.error(
            `Direct OSRM failed: ${getLocationDisplayName(source)} -> ${getLocationDisplayName(destination)}`,
            error.message ||
            error
        );

        return null;

    }

    for (
        const route of routes
    ) {

        const validation =
            await validateLeg(
                route,
                source,
                destination
            );

        if (
            validation.accepted
        ) {

            return {

                ...convertOSRMRoute(
                    route
                ),

                border:
                    validation.border,

                routeLegSource:
                    getLocationDisplayName(
                        source
                    ),

                routeLegDestination:
                    getLocationDisplayName(
                        destination
                    )

            };

        }

    }

    return null;

}

// ============================================================
// ANCHOR LOOKUP
// ============================================================

function getAnchorByName(
    name
) {

    const normalized =
        normalizeText(
            name
        );

    return DOMESTIC_ANCHORS.find(
        anchor =>
            normalizeText(
                anchor.name
            ) === normalized
    ) || null;

}

// ============================================================
// BUILD LOCATION OBJECT
// ============================================================
//
// IMPORTANT:
//
// Anchor waypoints are now returned as full location objects.
//
// This prevents the routing pipeline from mixing:
//
//     location object
//
// with:
//
//     [longitude, latitude]
//
// ============================================================

function buildAnchorLocation(
    name
) {

    const anchor =
        getAnchorByName(
            name
        );

    if (
        !anchor
    ) {

        return null;

    }

    return {

        name:
            anchor.name,

        lat:
            anchor.lat,

        lon:
            anchor.lon,

        latitude:
            anchor.lat,

        longitude:
            anchor.lon,

        countryCode:
            "IND",

        country:
            "India"

    };

}

// ============================================================
// MATCH SOURCE / DESTINATION TO ANCHOR
// ============================================================

function locationMatchesAnchor(
    location,
    anchor
) {

    if (
        !location ||
        !anchor
    ) {

        return false;

    }

    return (
        haversineDistanceKm(
            location,
            anchor
        ) < 80
    );

}

// ============================================================
// FIND CORRIDORS CONTAINING LOCATION
// ============================================================

function getCorridorsContainingLocation(
    location
) {

    if (
        !location
    ) {

        return [];

    }

    return DOMESTIC_CORRIDORS.filter(
        corridor =>
            corridor.points.some(
                pointName => {

                    const anchor =
                        getAnchorByName(
                            pointName
                        );

                    return locationMatchesAnchor(
                        location,
                        anchor
                    );

                }
            )
    );

}

// ============================================================
// BUILD CORRIDOR ROUTE
// ============================================================

async function buildCorridorRoute(
    source,
    destination,
    corridor
) {

    const anchorLocations =
        corridor.points
            .map(
                buildAnchorLocation
            )
            .filter(Boolean);

    if (
        anchorLocations.length === 0
    ) {

        return null;

    }

    const sourceAnchorIndex =
        anchorLocations.findIndex(
            anchor =>
                locationMatchesAnchor(
                    source,
                    anchor
                )
        );

    const destinationAnchorIndex =
        anchorLocations.findIndex(
            anchor =>
                locationMatchesAnchor(
                    destination,
                    anchor
                )
        );

    let anchorsBetween =
        anchorLocations;

    if (
        sourceAnchorIndex >= 0 &&
        destinationAnchorIndex >= 0
    ) {

        if (
            sourceAnchorIndex <=
            destinationAnchorIndex
        ) {

            anchorsBetween =
                anchorLocations.slice(
                    sourceAnchorIndex,
                    destinationAnchorIndex + 1
                );

        } else {

            anchorsBetween =
                anchorLocations.slice(
                    destinationAnchorIndex,
                    sourceAnchorIndex + 1
                )
                    .reverse();

        }

    }

    const points = [

        source,

        ...anchorsBetween,

        destination

    ];

    const deduplicated =
        [];

    for (
        const point of points
    ) {

        if (
            deduplicated.length === 0
        ) {

            deduplicated.push(
                point
            );

            continue;

        }

        if (
            !samePlace(
                deduplicated[
                    deduplicated.length - 1
                ],
                point
            )
        ) {

            deduplicated.push(
                point
            );

        }

    }

    if (
        deduplicated.length < 2
    ) {

        return null;

    }

    let combinedCoordinates =
        [];

    let totalDistanceMeters =
        0;

    let totalDurationSeconds =
        0;

    const routeLegs =
        [];

    for (
        let index = 1;
        index < deduplicated.length;
        index++
    ) {

        const legSource =
            deduplicated[
                index - 1
            ];

        const legDestination =
            deduplicated[
                index
            ];

        if (
            samePlace(
                legSource,
                legDestination
            )
        ) {

            continue;

        }

        const directLeg =
            await tryDirectLeg(
                legSource,
                legDestination
            );

        if (
            !directLeg
        ) {

            return null;

        }

        const straightLine =
            haversineDistanceKm(
                legSource,
                legDestination
            );

        const legDistanceKm =
            directLeg.distanceKm;

        const legRatio =
            straightLine > 0
                ? legDistanceKm /
                    straightLine
                : 1;

        if (
            legRatio >
            MAX_FALLBACK_LEG_DETOUR_RATIO
        ) {

            console.log("");

            console.log(
                "CORRIDOR LEG REJECTED:"
            );

            console.log(
                `${getLocationDisplayName(legSource)} -> ${getLocationDisplayName(legDestination)}`
            );

            console.log(
                "Detour ratio:",
                legRatio.toFixed(2)
            );

            console.log(
                "Maximum:",
                MAX_FALLBACK_LEG_DETOUR_RATIO
            );

            return null;

        }

        combinedCoordinates =
            mergeCoordinates(
                combinedCoordinates,
                directLeg.coordinates
            );

        totalDistanceMeters +=
            directLeg.distanceMeters;

        totalDurationSeconds +=
            directLeg.durationSeconds;

        routeLegs.push({

            source:
                getLocationDisplayName(
                    legSource
                ),

            destination:
                getLocationDisplayName(
                    legDestination
                ),

            distanceKm:
                directLeg.distanceKm,

            durationMin:
                directLeg.durationMin,

            border:
                directLeg.border

        });

    }

    const completeValidation =
        validateCompleteRouteDetour(
            combinedCoordinates,
            source,
            destination
        );

    if (
        !completeValidation.valid
    ) {

        console.log("");

        console.log(
            "COMPLETE CORRIDOR ROUTE REJECTED:"
        );

        console.log(
            "Strategy:",
            corridor.name
        );

        console.log(
            "Total route:",
            completeValidation.routeDistanceKm.toFixed(2),
            "km"
        );

        console.log(
            "Straight line:",
            completeValidation.straightLineDistanceKm.toFixed(2),
            "km"
        );

        console.log(
            "Ratio:",
            completeValidation.ratio.toFixed(2)
        );

        console.log(
            "Maximum allowed:",
            completeValidation.maximumAllowedKm.toFixed(2),
            "km"
        );

        return null;

    }

    return {

        distanceMeters:
            totalDistanceMeters,

        durationSeconds:
            totalDurationSeconds,

        distanceKm:
            totalDistanceMeters /
            1000,

        durationMin:
            totalDurationSeconds /
            60,

        coordinates:
            combinedCoordinates,

        geometry: {

            type:
                "LineString",

            coordinates:
                combinedCoordinates

        },

        routeLegs,

        routeStrategy:
            corridor.name,

        waypoints:
            anchorsBetween

    };

}

// ============================================================
// CONTROLLED CORRIDOR SEARCH
// ============================================================

async function findControlledDomesticCorridor(
    source,
    destination
) {

    const sourceCorridors =
        getCorridorsContainingLocation(
            source
        );

    const destinationCorridors =
        getCorridorsContainingLocation(
            destination
        );

    const candidateCorridors =
        [];

    for (
        const corridor of DOMESTIC_CORRIDORS
    ) {

        const sourceRelevant =
            sourceCorridors.includes(
                corridor
            );

        const destinationRelevant =
            destinationCorridors.includes(
                corridor
            );

        if (
            sourceRelevant ||
            destinationRelevant
        ) {

            candidateCorridors.push(
                corridor
            );

        }

    }

    const searchCorridors =
        candidateCorridors.length > 0
            ? candidateCorridors
            : DOMESTIC_CORRIDORS;

    for (
        const corridor of searchCorridors
    ) {

        const result =
            await buildCorridorRoute(
                source,
                destination,
                corridor
            );

        if (
            result
        ) {

            return result;

        }

    }

    return null;

}

// ============================================================
// GRAPH FALLBACK
// ============================================================

function buildDomesticGraph() {

    const graph =
        new Map();

    for (
        const corridor of DOMESTIC_CORRIDORS
    ) {

        const points =
            corridor.points;

        for (
            let index = 1;
            index < points.length;
            index++
        ) {

            const a =
                points[
                    index - 1
                ];

            const b =
                points[
                    index
                ];

            if (
                !graph.has(a)
            ) {

                graph.set(
                    a,
                    []
                );

            }

            if (
                !graph.has(b)
            ) {

                graph.set(
                    b,
                    []
                );

            }

            graph.get(a).push(
                b
            );

            graph.get(b).push(
                a
            );

        }

    }

    return graph;

}

// ============================================================
// GRAPH PATH SEARCH
// ============================================================

function findGraphPath(
    startName,
    endName
) {

    const graph =
        buildDomesticGraph();

    if (
        !graph.has(startName) ||
        !graph.has(endName)
    ) {

        return null;

    }

    const queue =
        [
            startName
        ];

    const previous =
        new Map();

    const visited =
        new Set(
            [
                startName
            ]
        );

    while (
        queue.length > 0
    ) {

        const current =
            queue.shift();

        if (
            current ===
            endName
        ) {

            break;

        }

        const neighbours =
            graph.get(
                current
            ) || [];

        for (
            const neighbour of neighbours
        ) {

            if (
                visited.has(
                    neighbour
                )
            ) {

                continue;

            }

            visited.add(
                neighbour
            );

            previous.set(
                neighbour,
                current
            );

            queue.push(
                neighbour
            );

        }

    }

    if (
        !visited.has(
            endName
        )
    ) {

        return null;

    }

    const path =
        [];

    let current =
        endName;

    while (
        current !== undefined
    ) {

        path.unshift(
            current
        );

        if (
            current ===
            startName
        ) {

            break;

        }

        current =
            previous.get(
                current
            );

    }

    return path;

}

// ============================================================
// BUILD GRAPH ROUTE
// ============================================================

async function buildGraphRoute(
    source,
    destination
) {

    const sourceCandidates =
        DOMESTIC_ANCHORS
            .map(
                anchor => ({

                    anchor,

                    distance:
                        haversineDistanceKm(
                            source,
                            anchor
                        )

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.distance -
                    b.distance
            )
            .slice(
                0,
                4
            );

    const destinationCandidates =
        DOMESTIC_ANCHORS
            .map(
                anchor => ({

                    anchor,

                    distance:
                        haversineDistanceKm(
                            destination,
                            anchor
                        )

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.distance -
                    b.distance
            )
            .slice(
                0,
                4
            );

    for (
        const sourceCandidate of sourceCandidates
    ) {

        for (
            const destinationCandidate of destinationCandidates
        ) {

            const path =
                findGraphPath(
                    sourceCandidate.anchor.name,
                    destinationCandidate.anchor.name
                );

            if (
                !path ||
                path.length === 0
            ) {

                continue;

            }

            const corridor =
                {

                    name:
                        `graph-${path.join("-")}`,

                    points:
                        path

                };

            const result =
                await buildCorridorRoute(
                    source,
                    destination,
                    corridor
                );

            if (
                result
            ) {

                return result;

            }

        }

    }

    return null;

}

// ============================================================
// GEOGRAPHIC FALLBACK
// ============================================================

async function geographicFallbackRoute(
    source,
    destination
) {

    const sourceNearest =
        DOMESTIC_ANCHORS
            .map(
                anchor => ({

                    anchor,

                    distance:
                        haversineDistanceKm(
                            source,
                            anchor
                        )

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.distance -
                    b.distance
            )
            .slice(
                0,
                3
            );

    const destinationNearest =
        DOMESTIC_ANCHORS
            .map(
                anchor => ({

                    anchor,

                    distance:
                        haversineDistanceKm(
                            destination,
                            anchor
                        )

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.distance -
                    b.distance
            )
            .slice(
                0,
                3
            );

    for (
        const sourceCandidate of sourceNearest
    ) {

        for (
            const destinationCandidate of destinationNearest
        ) {

            const sourceAnchor =
                sourceCandidate.anchor;

            const destinationAnchor =
                destinationCandidate.anchor;

            const corridor =
                {

                    name:
                        `geographic-${sourceAnchor.name}-${destinationAnchor.name}`,

                    points: [

                        sourceAnchor.name,

                        destinationAnchor.name

                    ]

                };

            const result =
                await buildCorridorRoute(
                    source,
                    destination,
                    corridor
                );

            if (
                result
            ) {

                return result;

            }

        }

    }

    return null;

}

// ============================================================
// ROUTE LEG WITH DOMESTIC FALLBACK
// ============================================================

async function routeLegWithDomesticFallback(
    source,
    destination
) {

    // --------------------------------------------------------
    // 1. DIRECT
    // --------------------------------------------------------

    const direct =
        await tryDirectLeg(
            source,
            destination
        );

    if (
        direct
    ) {

        return direct;

    }

    // --------------------------------------------------------
    // 2. CONTROLLED CORRIDOR
    // --------------------------------------------------------

    const controlled =
        await findControlledDomesticCorridor(
            source,
            destination
        );

    if (
        controlled
    ) {

        return controlled;

    }

    // --------------------------------------------------------
    // 3. GRAPH FALLBACK
    // --------------------------------------------------------

    const graph =
        await buildGraphRoute(
            source,
            destination
        );

    if (
        graph
    ) {

        return graph;

    }

    // --------------------------------------------------------
    // 4. GEOGRAPHIC FALLBACK
    // --------------------------------------------------------

    const geographic =
        await geographicFallbackRoute(
            source,
            destination
        );

    if (
        geographic
    ) {

        return geographic;

    }

    return null;

}

// ============================================================
// WAYPOINT ROUTE BATCH
// ============================================================

async function getWaypointRouteBatch(
    source,
    destination,
    waypoint,
    strategyName
) {

    const rawWaypoints =
        Array.isArray(waypoint)
            ? waypoint
            : waypoint
                ? [waypoint]
                : [];

    // --------------------------------------------------------
    // IMPORTANT:
    //
    // Keep the original waypoint objects instead of converting
    // everything into bare coordinate arrays.
    //
    // This allows logging, route legs and OSRM requests to
    // retain the waypoint name.
    // --------------------------------------------------------

    const waypointObjects =
        rawWaypoints
            .filter(Boolean);

    const waypointCoordinates =
        removeDuplicateWaypoints(
            waypointObjects
        );

    const points = [

        source,

        ...waypointCoordinates,

        destination

    ];

    const deduplicatedPoints =
        [];

    for (
        const point of points
    ) {

        if (
            !normalizeCoordinate(point)
        ) {

            continue;

        }

        if (
            deduplicatedPoints.length === 0
        ) {

            deduplicatedPoints.push(
                point
            );

            continue;

        }

        if (
            !samePlace(
                deduplicatedPoints[
                    deduplicatedPoints.length - 1
                ],
                point
            )
        ) {

            deduplicatedPoints.push(
                point
            );

        }

    }

    if (
        deduplicatedPoints.length < 2
    ) {

        return [];

    }

    let combinedCoordinates =
        [];

    let totalDistanceMeters =
        0;

    let totalDurationSeconds =
        0;

    const routeLegs =
        [];

    for (
        let index = 1;
        index < deduplicatedPoints.length;
        index++
    ) {

        const legSource =
            deduplicatedPoints[
                index - 1
            ];

        const legDestination =
            deduplicatedPoints[
                index
            ];

        if (
            samePlace(
                legSource,
                legDestination
            )
        ) {

            continue;

        }

        console.log("");

        console.log(
            "================================================"
        );

        console.log(
            `WAYPOINT MACRO LEG ${index}`
        );

        console.log(
            `${getLocationDisplayName(legSource)} -> ${getLocationDisplayName(legDestination)}`
        );

        console.log(
            "================================================"
        );

        const leg =
            await routeLegWithDomesticFallback(
                legSource,
                legDestination
            );

        if (
            !leg
        ) {

            console.log("");

            console.log(
                "WAYPOINT STRATEGY FAILED:"
            );

            console.log(
                strategyName
            );

            console.log(
                "Failed leg:",
                `${getLocationDisplayName(legSource)} -> ${getLocationDisplayName(legDestination)}`
            );

            return [];

        }

        combinedCoordinates =
            mergeCoordinates(
                combinedCoordinates,
                leg.coordinates
            );

        totalDistanceMeters +=
            leg.distanceMeters;

        totalDurationSeconds +=
            leg.durationSeconds;

        routeLegs.push({

            source:
                getLocationDisplayName(
                    legSource
                ),

            destination:
                getLocationDisplayName(
                    legDestination
                ),

            distanceKm:
                leg.distanceKm,

            durationMin:
                leg.durationMin,

            border:
                leg.border

        });

    }

    // --------------------------------------------------------
    // Complete-route detour validation
    // --------------------------------------------------------

    const completeValidation =
        validateCompleteRouteDetour(
            combinedCoordinates,
            source,
            destination
        );

    if (
        !completeValidation.valid
    ) {

        console.log("");

        console.log(
            "WAYPOINT ROUTE REJECTED AS EXCESSIVE DETOUR"
        );

        console.log(
            "Strategy:",
            strategyName
        );

        console.log(
            "Total route:",
            completeValidation.routeDistanceKm.toFixed(2),
            "km"
        );

        console.log(
            "Straight line:",
            completeValidation.straightLineDistanceKm.toFixed(2),
            "km"
        );

        console.log(
            "Ratio:",
            completeValidation.ratio.toFixed(2)
        );

        console.log(
            "Maximum allowed:",
            completeValidation.maximumAllowedKm.toFixed(2),
            "km"
        );

        return [];

    }

    return [

        {

            distanceMeters:
                totalDistanceMeters,

            durationSeconds:
                totalDurationSeconds,

            distanceKm:
                totalDistanceMeters /
                1000,

            durationMin:
                totalDurationSeconds /
                60,

            coordinates:
                combinedCoordinates,

            geometry: {

                type:
                    "LineString",

                coordinates:
                    combinedCoordinates

            },

            routeLegs,

            routeStrategy:
                strategyName,

            waypoints:
                waypointCoordinates

        }

    ];

}

// ============================================================
// WAYPOINT STRATEGY HELPERS
// ============================================================
//
// IMPORTANT:
//
// Return a full location object, not [lon, lat].
//
// ============================================================

function createWaypoint(
    name
) {

    return buildAnchorLocation(
        name
    );

}

// ============================================================
// GENERATE WAYPOINT STRATEGIES
// ============================================================

function generateWaypointStrategies(
    source,
    destination
) {

    const sourceName =
        normalizeText(
            source &&
            source.name
        );

    const destinationName =
        normalizeText(
            destination &&
            destination.name
        );

    const strategies =
        [];

    // ========================================================
    // AIZAWL
    // ========================================================

    if (
        destinationName.includes(
            "aizawl"
        )
    ) {

        strategies.push({

            name:
                "central-siliguri-guwahati-silchar-aizawl",

            waypoint: [

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Silchar"
                )

            ]

        });

        strategies.push({

            name:
                "central-varanasi-patna-siliguri-aizawl",

            waypoint: [

                createWaypoint(
                    "Varanasi"
                ),

                createWaypoint(
                    "Patna"
                ),

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Silchar"
                )

            ]

        });

        strategies.push({

            name:
                "northern-lucknow-gorakhpur-siliguri-aizawl",

            waypoint: [

                createWaypoint(
                    "Lucknow"
                ),

                createWaypoint(
                    "Gorakhpur"
                ),

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Silchar"
                )

            ]

        });

    }

    // ========================================================
    // AIZAWL → MAINLAND
    // ========================================================

    if (
        sourceName.includes(
            "aizawl"
        )
    ) {

        strategies.push({

            name:
                "aizawl-silchar-guwahati-siliguri-central",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Siliguri"
                )

            ]

        });

        strategies.push({

            name:
                "aizawl-silchar-siliguri-patna-varanasi",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Patna"
                ),

                createWaypoint(
                    "Varanasi"
                )

            ]

        });

    }

    // ========================================================
    // AGARTALA
    // ========================================================

    if (
        destinationName.includes(
            "agartala"
        )
    ) {

        strategies.push({

            name:
                "agartala-silchar-guwahati",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Guwahati"
                )

            ]

        });

        strategies.push({

            name:
                "agartala-silchar-siliguri",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Siliguri"
                )

            ]

        });

    }

    if (
        sourceName.includes(
            "agartala"
        )
    ) {

        strategies.push({

            name:
                "agartala-silchar-guwahati-siliguri",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Siliguri"
                )

            ]

        });

        strategies.push({

            name:
                "agartala-silchar-siliguri-patna",

            waypoint: [

                createWaypoint(
                    "Silchar"
                ),

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Patna"
                )

            ]

        });

    }

    // ========================================================
    // GENERIC MAINLAND → NER
    // ========================================================

    const nerDestination =
        [
            "aizawl",
            "agartala",
            "imphal",
            "kohima",
            "dimapur",
            "itanagar",
            "guwahati",
            "shillong",
            "silchar",
            "dibrugarh",
            "gangtok"
        ].some(
            city =>
                destinationName.includes(
                    city
                )
        );

    const nerSource =
        [
            "aizawl",
            "agartala",
            "imphal",
            "kohima",
            "dimapur",
            "itanagar",
            "guwahati",
            "shillong",
            "silchar",
            "dibrugarh",
            "gangtok"
        ].some(
            city =>
                sourceName.includes(
                    city
                )
        );

    if (
        nerDestination &&
        !sourceName.includes(
            "aizawl"
        ) &&
        !sourceName.includes(
            "agartala"
        )
    ) {

        strategies.push({

            name:
                "generic-mainland-siliguri-guwahati",

            waypoint: [

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Guwahati"
                )

            ]

        });

        strategies.push({

            name:
                "generic-mainland-varanasi-patna-siliguri",

            waypoint: [

                createWaypoint(
                    "Varanasi"
                ),

                createWaypoint(
                    "Patna"
                ),

                createWaypoint(
                    "Siliguri"
                )

            ]

        });

    }

    // ========================================================
    // NER → MAINLAND
    // ========================================================

    if (
        nerSource &&
        !destinationName.includes(
            "aizawl"
        ) &&
        !destinationName.includes(
            "agartala"
        )
    ) {

        strategies.push({

            name:
                "generic-ner-siliguri-patna-varanasi",

            waypoint: [

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Patna"
                ),

                createWaypoint(
                    "Varanasi"
                )

            ]

        });

        strategies.push({

            name:
                "generic-ner-guwahati-siliguri",

            waypoint: [

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Siliguri"
                )

            ]

        });

    }

    // ========================================================
    // NER → NER
    // ========================================================

    if (
        nerSource &&
        nerDestination
    ) {

        strategies.push({

            name:
                "ner-guwahati-silchar",

            waypoint: [

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Silchar"
                )

            ]

        });

        strategies.push({

            name:
                "ner-guwahati-dimapur",

            waypoint: [

                createWaypoint(
                    "Guwahati"
                ),

                createWaypoint(
                    "Dimapur"
                )

            ]

        });

        strategies.push({

            name:
                "ner-siliguri-guwahati",

            waypoint: [

                createWaypoint(
                    "Siliguri"
                ),

                createWaypoint(
                    "Guwahati"
                )

            ]

        });

    }

    // ========================================================
    // MAINLAND → MAINLAND
    // ========================================================

    if (
        !nerSource &&
        !nerDestination
    ) {

        strategies.push({

            name:
                "mainland-varanasi-patna",

            waypoint: [

                createWaypoint(
                    "Varanasi"
                ),

                createWaypoint(
                    "Patna"
                )

            ]

        });

        strategies.push({

            name:
                "mainland-lucknow-kanpur",

            waypoint: [

                createWaypoint(
                    "Lucknow"
                ),

                createWaypoint(
                    "Kanpur"
                )

            ]

        });

        strategies.push({

            name:
                "mainland-jabalpur-varanasi",

            waypoint: [

                createWaypoint(
                    "Jabalpur"
                ),

                createWaypoint(
                    "Varanasi"
                )

            ]

        });

    }

    // ========================================================
    // GRAPH FALLBACK STRATEGY
    // ========================================================

    strategies.push({

        name:
            "graph-domestic-corridor",

        waypoint:
            []

    });

    // ========================================================
    // CLEAN STRATEGIES
    // ========================================================

    const cleaned =
        [];

    const seen =
        new Set();

    for (
        const strategy of strategies
    ) {

        if (
            !strategy
        ) {

            continue;

        }

        const validWaypoints =
            Array.isArray(
                strategy.waypoint
            )
                ? strategy.waypoint
                    .filter(Boolean)
                : [];

        const uniqueWaypoints =
            removeDuplicateWaypoints(
                validWaypoints
            );

        const key =
            `${strategy.name}|` +
            uniqueWaypoints
                .map(
                    point => {

                        const coordinate =
                            normalizeCoordinate(
                                point
                            );

                        return coordinate
                            ? `${coordinate[0].toFixed(4)},${coordinate[1].toFixed(4)}`
                            : "invalid";

                    }
                )
                .join("|");

        if (
            seen.has(key)
        ) {

            continue;

        }

        seen.add(key);

        cleaned.push({

            name:
                strategy.name,

            waypoint:
                uniqueWaypoints

        });

    }

    return cleaned.slice(
        0,
        MAX_WAYPOINT_STRATEGIES
    );

}

// ============================================================
// OSRM ROUTES PUBLIC HELPER
// ============================================================

async function getOSRMRoutes(
    source,
    destination
) {

    return requestOSRMRoute(
        source,
        destination
    );

}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    getStandardRouteBatch,

    getWaypointRouteBatch,

    generateWaypointStrategies,

    convertOSRMRoute,

    getOSRMRoutes,

    isRouteTooSimilar,

    calculateRouteShareFactor

};