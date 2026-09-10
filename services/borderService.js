const countryBoundaries =
    require("@geo-maps/countries-land-10m")();

const whichPolygon =
    require("which-polygon");

// ============================================================
// COUNTRY INDEX
// ============================================================

const countryIndex =
    whichPolygon(countryBoundaries);

// ============================================================
// COUNTRY PROPERTY HELPERS
// ============================================================

function getCountryName(properties = {}) {
    return (
        properties.name ||
        properties.NAME ||
        properties.ADMIN ||
        properties.admin ||
        properties.NAME_EN ||
        properties.name_en ||
        properties.SOVEREIGNT ||
        "Unknown"
    );
}

function getCountryCode(properties = {}) {
    return (
        properties.ISO_A3 ||
        properties.ADM0_A3 ||
        properties.iso_a3 ||
        properties.ISO3 ||
        null
    );
}

// ============================================================
// FIND COUNTRY AT COORDINATE
// ============================================================

function getCountryAtCoordinate(coordinate) {
    if (
        !Array.isArray(coordinate) ||
        coordinate.length < 2
    ) {
        return null;
    }

    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);

    if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat)
    ) {
        return null;
    }

    const result =
        countryIndex([lng, lat]);

    if (!result) {
        return null;
    }

    const properties =
        result.properties || result;

    return {
        name: getCountryName(properties),
        code: getCountryCode(properties)
    };
}

// ============================================================
// HAVERSINE DISTANCE
// ============================================================

function distanceKm(pointA, pointB) {
    const [lng1, lat1] = pointA;
    const [lng2, lat2] = pointB;

    const R = 6371;

    const dLat =
        ((lat2 - lat1) * Math.PI) / 180;

    const dLng =
        ((lng2 - lng1) * Math.PI) / 180;

    const lat1Rad =
        (lat1 * Math.PI) / 180;

    const lat2Rad =
        (lat2 * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(dLng / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

// ============================================================
// ROUTE SAMPLING
//
// We sample the ACTUAL OSRM polyline rather than checking
// arbitrary points around the route.
//
// 1 km spacing gives better border detection than 2 km,
// especially around short international crossings.
// ============================================================

function sampleRouteCoordinates(
    coordinates,
    spacingKm = 1
) {
    if (
        !Array.isArray(coordinates) ||
        coordinates.length === 0
    ) {
        return [];
    }

    if (coordinates.length === 1) {
        return [
            coordinates[0]
        ];
    }

    const samples = [
        coordinates[0]
    ];

    for (
        let i = 0;
        i < coordinates.length - 1;
        i++
    ) {
        const start =
            coordinates[i];

        const end =
            coordinates[i + 1];

        const segmentDistance =
            distanceKm(
                start,
                end
            );

        const steps =
            Math.max(
                1,
                Math.ceil(
                    segmentDistance /
                    spacingKm
                )
            );

        for (
            let step = 1;
            step <= steps;
            step++
        ) {
            const ratio =
                step / steps;

            const lng =
                start[0] +
                (end[0] - start[0]) *
                ratio;

            const lat =
                start[1] +
                (end[1] - start[1]) *
                ratio;

            samples.push([
                lng,
                lat
            ]);
        }
    }

    return samples;
}

// ============================================================
// COUNTRY KEY
// ============================================================

function getCountryKey(country) {
    if (!country) {
        return null;
    }

    return (
        country.code ||
        country.name ||
        null
    );
}

// ============================================================
// COUNTRY SEQUENCE
//
// Converts:
//
// IND IND IND IND BTN BTN BTN
//
// into:
//
// IND BTN
//
// WITHOUT removing information about the order.
// ============================================================

function compressCountrySequence(
    countries
) {
    const sequence = [];

    let previousKey = null;

    for (
        const country of countries
    ) {
        const key =
            getCountryKey(country);

        if (!key) {
            continue;
        }

        if (
            key === previousKey
        ) {
            continue;
        }

        sequence.push(country);

        previousKey = key;
    }

    return sequence;
}

// ============================================================
// FIND STABLE COUNTRY TRANSITIONS
//
// A single polygon classification near a border should not
// immediately count as an international crossing.
//
// Example:
//
// IND IND IND BTN IND IND
//
// The isolated BTN point is treated as boundary noise.
//
// But:
//
// IND IND IND BTN BTN BTN IND
//
// represents a real route segment through Bhutan.
// ============================================================

function stabilizeCountrySequence(
    countries,
    minimumConsecutiveSamples = 3
) {
    if (
        !Array.isArray(countries) ||
        countries.length === 0
    ) {
        return [];
    }

    const stable = [];

    let currentCountry =
        countries[0];

    stable.push(
        currentCountry
    );

    let candidateCountry = null;
    let candidateCount = 0;

    for (
        let i = 1;
        i < countries.length;
        i++
    ) {
        const country =
            countries[i];

        const currentKey =
            getCountryKey(
                currentCountry
            );

        const countryKey =
            getCountryKey(
                country
            );

        if (!countryKey) {
            continue;
        }

        // Same country as current stable country.
        if (
            countryKey === currentKey
        ) {
            candidateCountry = null;
            candidateCount = 0;
            continue;
        }

        // New candidate country.
        if (
            getCountryKey(
                candidateCountry
            ) === countryKey
        ) {
            candidateCount++;
        } else {
            candidateCountry = country;
            candidateCount = 1;
        }

        // Country transition is considered real only after
        // several consecutive samples.
        if (
            candidateCount >=
            minimumConsecutiveSamples
        ) {
            currentCountry =
                candidateCountry;

            stable.push(
                currentCountry
            );

            candidateCountry = null;
            candidateCount = 0;
        }
    }

    return stable;
}

// ============================================================
// INTERNATIONAL ROUTE ASSESSMENT
//
// coordinates:
//     Actual OSRM route geometry.
//
// sourceCountryCode:
//     Country obtained from ORS geocoding.
//
// destinationCountryCode:
//     Country obtained from ORS geocoding.
// ============================================================

function assessInternationalRoute(
    coordinates,
    sourceCountryCode = null,
    destinationCountryCode = null
) {
    // --------------------------------------------------------
    // Validate route
    // --------------------------------------------------------

    if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2
    ) {
        return {
            international: false,
            countriesCrossed: [],
            countryCodes: [],
            borderWarning: null,
            borderAssessment: "NO_ROUTE_GEOMETRY"
        };
    }

    // --------------------------------------------------------
    // Normalize country codes
    // --------------------------------------------------------

    const sourceCode =
        sourceCountryCode
            ? String(
                sourceCountryCode
            ).toUpperCase()
            : null;

    const destinationCode =
        destinationCountryCode
            ? String(
                destinationCountryCode
            ).toUpperCase()
            : null;

    // --------------------------------------------------------
    // Sample actual route
    // --------------------------------------------------------

    const samples =
        sampleRouteCoordinates(
            coordinates,
            1
        );

    // --------------------------------------------------------
    // Determine country for every route sample
    // --------------------------------------------------------

    const rawCountries = [];

    for (
        const coordinate of samples
    ) {
        const country =
            getCountryAtCoordinate(
                coordinate
            );

        if (country) {
            rawCountries.push(
                country
            );
        }
    }

    // --------------------------------------------------------
    // If polygon lookup failed completely, fall back to
    // endpoint country information.
    // --------------------------------------------------------

    if (
        rawCountries.length === 0
    ) {
        const endpointCountries = [];

        if (sourceCode) {
            endpointCountries.push({
                name: null,
                code: sourceCode
            });
        }

        if (
            destinationCode &&
            destinationCode !== sourceCode
        ) {
            endpointCountries.push({
                name: null,
                code: destinationCode
            });
        }

        const international =
            sourceCode &&
            destinationCode &&
            sourceCode !== destinationCode;

        return {
            international: Boolean(
                international
            ),

            countriesCrossed:
                endpointCountries
                    .map(
                        country =>
                            country.name
                    )
                    .filter(Boolean),

            countryCodes:
                endpointCountries
                    .map(
                        country =>
                            country.code
                    ),

            borderWarning:
                international
                    ? "International border crossing detected — permit, customs or other cross-border requirements may apply."
                    : null,

            borderAssessment:
                "ENDPOINT_COUNTRY_FALLBACK"
        };
    }

    // --------------------------------------------------------
    // Stabilize route country sequence
    // --------------------------------------------------------

    const stableCountries =
        stabilizeCountrySequence(
            rawCountries,
            3
        );

    const routeSequence =
        compressCountrySequence(
            stableCountries
        );

    // --------------------------------------------------------
    // Convert route sequence into codes
    // --------------------------------------------------------

    const routeCodes =
        routeSequence
            .map(
                country =>
                    getCountryKey(country)
            )
            .filter(Boolean);

    // --------------------------------------------------------
    // Determine whether the route actually changed country.
    // --------------------------------------------------------

    let polylineInternational =
        false;

    for (
        let i = 1;
        i < routeCodes.length;
        i++
    ) {
        if (
            routeCodes[i] !==
            routeCodes[i - 1]
        ) {
            polylineInternational = true;
            break;
        }
    }

    // --------------------------------------------------------
    // Endpoint country validation
    //
    // Different source/destination countries strongly indicate
    // an international trip.
    // --------------------------------------------------------

    const endpointsInternational =
        Boolean(
            sourceCode &&
            destinationCode &&
            sourceCode !== destinationCode
        );

    // --------------------------------------------------------
    // Final decision
    //
    // 1. If source and destination are different countries,
    //    the trip is international.
    //
    // 2. If source and destination are the same country,
    //    only a REAL country transition along the polyline
    //    makes it international.
    //
    // This prevents a brief polygon error near a border from
    // incorrectly flagging ordinary domestic routes.
    // --------------------------------------------------------

    const international =
        endpointsInternational ||
        polylineInternational;

    // --------------------------------------------------------
    // Build country list.
    //
    // Prefer actual route countries, but make sure known
    // endpoint countries are represented.
    // --------------------------------------------------------

    const countries = [];

    const seen =
        new Set();

    function addCountry(
        country
    ) {
        const code =
            getCountryKey(country);

        if (
            !code ||
            seen.has(code)
        ) {
            return;
        }

        seen.add(code);

        countries.push(
            country
        );
    }

    for (
        const country of routeSequence
    ) {
        addCountry(country);
    }

    // Add source/destination if they are not present in
    // polygon results.
    if (sourceCode) {
        addCountry({
            name:
                sourceCode === "IND"
                    ? "India"
                    : null,
            code:
                sourceCode
        });
    }

    if (destinationCode) {
        addCountry({
            name:
                destinationCode === "BTN"
                    ? "Bhutan"
                    : null,
            code:
                destinationCode
        });
    }

    // --------------------------------------------------------
    // Order endpoint countries correctly for the common
    // source → destination case.
    //
    // For international routes we want:
    //
    // IND → BTN
    //
    // rather than depending entirely on polygon ordering.
    // --------------------------------------------------------

    if (
        sourceCode &&
        destinationCode &&
        sourceCode !== destinationCode
    ) {
        const orderedCountries = [];

        const sourceCountry =
            countries.find(
                country =>
                    getCountryKey(
                        country
                    ) === sourceCode
            );

        const destinationCountry =
            countries.find(
                country =>
                    getCountryKey(
                        country
                    ) === destinationCode
            );

        if (sourceCountry) {
            orderedCountries.push(
                sourceCountry
            );
        }

        for (
            const country of countries
        ) {
            const code =
                getCountryKey(country);

            if (
                code === sourceCode ||
                code === destinationCode
            ) {
                continue;
            }

            orderedCountries.push(
                country
            );
        }

        if (destinationCountry) {
            orderedCountries.push(
                destinationCountry
            );
        }

        countries.length = 0;

        for (
            const country of orderedCountries
        ) {
            countries.push(
                country
            );
        }
    }

    // --------------------------------------------------------
    // Names
    // --------------------------------------------------------

    const countriesCrossed =
        countries
            .map(
                country =>
                    country.name
            )
            .filter(Boolean);

    const countryCodes =
        countries
            .map(
                country =>
                    country.code
            )
            .filter(Boolean);

    // --------------------------------------------------------
    // Final logging
    //
    // IMPORTANT:
    // We deliberately DO NOT log every coordinate.
    // --------------------------------------------------------

    console.log(
        "Border assessment:",
        {
            sourceCountry:
                sourceCode,

            destinationCountry:
                destinationCode,

            routeCountrySequence:
                routeCodes,

            international,

            countriesCrossed,

            countryCodes
        }
    );

    // --------------------------------------------------------
    // Return
    // --------------------------------------------------------

    return {
        international,

        countriesCrossed,

        countryCodes,

        borderWarning:
            international
                ? "International border crossing detected — permit, customs or other cross-border requirements may apply."
                : null,

        borderAssessment:
            endpointsInternational
                ? "ENDPOINT_COUNTRIES_DIFFER"
                : polylineInternational
                    ? "POLYLINE_COUNTRY_TRANSITION"
                    : "DOMESTIC_ROUTE"
    };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    assessInternationalRoute
};