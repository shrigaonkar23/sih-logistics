// ============================================================
// SILP - BORDER / INTERNATIONAL ROUTE SERVICE
// ============================================================
//
// Purpose:
// - Detect whether a route crosses an international border.
// - Determine the ordered countries encountered by the route.
// - Preserve sequences such as:
//      IND -> BTN -> IND
// - Use the full OSRM route geometry.
// - Sample the route approximately every 5 km for performance.
// - Support LEG-BY-LEG validation for constrained routing.
//
// IMPORTANT:
// which-polygon returns the country's PROPERTIES OBJECT directly,
// not a GeoJSON Feature. Country code is primarily stored in A3.
//
// ============================================================

const countryBoundaries =
    require("@geo-maps/countries-land-10m")();

const whichPolygon =
    require("which-polygon");

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
        null
    );
}


function getCountryCode(properties = {}) {
    return (
        properties.A3 ||
        properties.ISO_A3 ||
        properties.ADM0_A3 ||
        properties.iso_a3 ||
        properties.ISO3 ||
        null
    );
}


// ============================================================
// COUNTRY LOOKUP
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

    try {

        // which-polygon expects [longitude, latitude]
        const result =
            countryIndex([lng, lat]);

        if (!result) {
            return null;
        }

        // which-polygon normally returns
        // the properties object directly.
        //
        // Support Feature format too.
        const properties =
            result.properties || result;

        const code =
            getCountryCode(properties);

        const name =
            getCountryName(properties);

        if (!code && !name) {
            return null;
        }

        return {
            name: name || code || "Unknown",

            code: code
                ? String(code).toUpperCase()
                : null
        };

    } catch (error) {

        return null;
    }
}


// ============================================================
// DISTANCE
// ============================================================

function distanceKm(pointA, pointB) {

    if (
        !Array.isArray(pointA) ||
        !Array.isArray(pointB)
    ) {
        return 0;
    }

    const lng1 = Number(pointA[0]);
    const lat1 = Number(pointA[1]);

    const lng2 = Number(pointB[0]);
    const lat2 = Number(pointB[1]);

    if (
        !Number.isFinite(lng1) ||
        !Number.isFinite(lat1) ||
        !Number.isFinite(lng2) ||
        !Number.isFinite(lat2)
    ) {
        return 0;
    }

    const earthRadiusKm = 6371;

    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;

    const dLng =
        (lng2 - lng1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadiusKm * c;
}


// ============================================================
// TRUE GLOBAL ROUTE SAMPLING
// ============================================================
//
// Samples the complete route approximately every spacingKm.
//
// Example:
//
// 0 km
// 5 km
// 10 km
// 15 km
// ...
// final point
//
// ============================================================

function sampleRouteCoordinates(
    coordinates,
    spacingKm = 5
) {

    if (
        !Array.isArray(coordinates) ||
        coordinates.length === 0
    ) {
        return [];
    }

    if (coordinates.length === 1) {
        return [coordinates[0]];
    }

    if (
        !Number.isFinite(spacingKm) ||
        spacingKm <= 0
    ) {
        spacingKm = 5;
    }

    const samples = [];

    // Always include route start.
    samples.push(coordinates[0]);

    let cumulativeDistance = 0;

    let nextSampleDistance =
        spacingKm;

    let previousPoint =
        coordinates[0];

    for (
        let i = 1;
        i < coordinates.length;
        i++
    ) {

        const currentPoint =
            coordinates[i];

        const segmentDistance =
            distanceKm(
                previousPoint,
                currentPoint
            );

        if (segmentDistance <= 0) {

            previousPoint =
                currentPoint;

            continue;
        }

        const segmentStartDistance =
            cumulativeDistance;

        const segmentEndDistance =
            cumulativeDistance +
            segmentDistance;

        while (
            nextSampleDistance <=
            segmentEndDistance
        ) {

            const distanceIntoSegment =
                nextSampleDistance -
                segmentStartDistance;

            const ratio =
                distanceIntoSegment /
                segmentDistance;

            const sample = [

                previousPoint[0] +
                    (
                        currentPoint[0] -
                        previousPoint[0]
                    ) *
                    ratio,

                previousPoint[1] +
                    (
                        currentPoint[1] -
                        previousPoint[1]
                    ) *
                    ratio
            ];

            samples.push(sample);

            nextSampleDistance +=
                spacingKm;
        }

        cumulativeDistance =
            segmentEndDistance;

        previousPoint =
            currentPoint;
    }

    // Always include exact destination.
    const lastPoint =
        coordinates[
            coordinates.length - 1
        ];

    const lastSample =
        samples[
            samples.length - 1
        ];

    if (
        !lastSample ||
        distanceKm(
            lastSample,
            lastPoint
        ) > 0.001
    ) {

        samples.push(lastPoint);
    }

    return samples;
}


// ============================================================
// COUNTRY SEQUENCE HELPERS
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


// ------------------------------------------------------------
// Remove ONLY consecutive duplicates.
//
// IND -> BTN -> IND
//
// becomes:
//
// IND -> BTN -> IND
//
// NOT:
//
// IND -> BTN
// ------------------------------------------------------------

function compressCountrySequence(
    countries
) {

    const result = [];

    let previousKey = null;

    for (const country of countries) {

        const key =
            getCountryKey(country);

        if (!key) {
            continue;
        }

        if (key !== previousKey) {

            result.push(country);

            previousKey = key;
        }
    }

    return result;
}


function cleanCountrySequence(
    countries
) {

    return compressCountrySequence(
        countries
    );
}


// ============================================================
// INTERNAL ROUTE ASSESSMENT
// ============================================================
//
// This performs the actual polygon analysis.
//
// Keeping this separate allows us to use exactly the same
// border logic for:
//
// 1. complete routes
// 2. individual route legs
//
// ============================================================

function assessRouteGeometry(
    coordinates,
    sourceCountryCode = null,
    destinationCountryCode = null
) {

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
    // Fast endpoint check
    // --------------------------------------------------------

    const endpointsInternational =
        Boolean(
            sourceCode &&
            destinationCode &&
            sourceCode !== destinationCode
        );


    // --------------------------------------------------------
    // Sample FULL geometry every 5 km
    // --------------------------------------------------------

    const samples =
        sampleRouteCoordinates(
            coordinates,
            5
        );


    const rawCountries = [];

    for (const coordinate of samples) {

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
    // Polygon lookup completely failed
    // --------------------------------------------------------

    if (
        rawCountries.length === 0
    ) {

        const fallbackCountries = [];

        if (sourceCode) {

            fallbackCountries.push({
                name: sourceCode,
                code: sourceCode
            });
        }

        if (
            destinationCode &&
            destinationCode !== sourceCode
        ) {

            fallbackCountries.push({
                name: destinationCode,
                code: destinationCode
            });
        }

        const routeSequence =
            cleanCountrySequence(
                fallbackCountries
            );

        const routeCodes =
            routeSequence
                .map(
                    country =>
                        getCountryKey(
                            country
                        )
                )
                .filter(Boolean);

        const international =
            endpointsInternational ||
            routeCodes.length > 1;

        return {

            international,

            countriesCrossed:
                routeSequence.map(
                    country =>
                        country.name
                ),

            countryCodes:
                routeCodes,

            borderWarning:
                international
                    ? "International border crossing detected — permit, customs or other cross-border requirements may apply."
                    : null,

            borderAssessment:
                endpointsInternational
                    ? "ENDPOINT_COUNTRIES_DIFFER"
                    : international
                    ? "POLYGON_ROUTE_TRANSITION"
                    : "DOMESTIC_ROUTE"
        };
    }


    // --------------------------------------------------------
    // Compress consecutive countries
    // --------------------------------------------------------

    const routeSequence =
        cleanCountrySequence(
            rawCountries
        );

    const routeCodes =
        routeSequence
            .map(
                country =>
                    getCountryKey(
                        country
                    )
            )
            .filter(Boolean);


    // --------------------------------------------------------
    // Detect country transitions
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

            polylineInternational =
                true;

            break;
        }
    }


    // --------------------------------------------------------
    // Final international decision
    // --------------------------------------------------------

    const international =
        endpointsInternational ||
        polylineInternational;


    // --------------------------------------------------------
    // Preserve ordered country sequence
    // --------------------------------------------------------

    const orderedCountries = [];

    for (
        const country of routeSequence
    ) {

        orderedCountries.push(
            country
        );
    }


    // --------------------------------------------------------
    // Make sure source country is represented
    // --------------------------------------------------------

    if (
        sourceCode &&
        (
            orderedCountries.length === 0 ||
            getCountryKey(
                orderedCountries[0]
            ) !== sourceCode
        )
    ) {

        orderedCountries.unshift({

            name: sourceCode,
            code: sourceCode
        });
    }


    // --------------------------------------------------------
    // Make sure destination country is represented
    // --------------------------------------------------------

    if (
        destinationCode &&
        (
            orderedCountries.length === 0 ||
            getCountryKey(
                orderedCountries[
                    orderedCountries.length - 1
                ]
            ) !== destinationCode
        )
    ) {

        orderedCountries.push({

            name: destinationCode,
            code: destinationCode
        });
    }


    // --------------------------------------------------------
    // Re-compress after endpoint additions
    // --------------------------------------------------------

    const finalCountries =
        compressCountrySequence(
            orderedCountries
        );

    const finalCodes =
        finalCountries
            .map(
                country =>
                    getCountryKey(
                        country
                    )
            )
            .filter(Boolean);


    return {

        international,

        countriesCrossed:
            finalCountries.map(
                country =>
                    country.name
            ),

        countryCodes:
            finalCodes,

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
// INTERNATIONAL ROUTE ASSESSMENT
// ============================================================
//
// Public API used by the existing server.
//
// This remains completely backward compatible.
//
// ============================================================

function assessInternationalRoute(
    coordinates,
    sourceCountryCode = null,
    destinationCountryCode = null
) {

    return assessRouteGeometry(
        coordinates,
        sourceCountryCode,
        destinationCountryCode
    );
}


// ============================================================
// ROUTE LEG ASSESSMENT
// ============================================================
//
// NEW:
//
// Used when a route is constructed from multiple legs:
//
// Source
//   ↓
// Waypoint 1
//   ↓
// Waypoint 2
//   ↓
// Destination
//
// Every leg is independently checked.
//
// If even ONE leg crosses an international border,
// the complete strategy is rejected.
//
// IMPORTANT:
// This does NOT replace the full-route check.
// It supplements it.
//
// ============================================================

function assessRouteLeg(
    coordinates,
    sourceCountryCode = null,
    destinationCountryCode = null
) {

    const assessment =
        assessRouteGeometry(
            coordinates,
            sourceCountryCode,
            destinationCountryCode
        );

    return {

        ...assessment,

        legInternational:
            assessment.international
    };
}


// ============================================================
// MULTI-LEG ROUTE ASSESSMENT
// ============================================================
//
// Expected input:
//
// [
//
//   {
//      coordinates: [...],
//      sourceCountryCode: "IND",
//      destinationCountryCode: "IND"
//   },
//
//   {
//      coordinates: [...],
//      sourceCountryCode: "IND",
//      destinationCountryCode: "IND"
//   }
//
// ]
//
// The function evaluates every leg independently.
//
// ============================================================

function assessRouteLegs(
    legs = []
) {

    if (!Array.isArray(legs)) {

        return {

            international: true,

            countriesCrossed: [],

            countryCodes: [],

            borderWarning:
                "Route legs could not be validated.",

            borderAssessment:
                "INVALID_ROUTE_LEGS",

            legs: []
        };
    }


    const legAssessments = [];

    const combinedCountries = [];

    const combinedCodes = [];


    for (
        let i = 0;
        i < legs.length;
        i++
    ) {

        const leg =
            legs[i] || {};

        const assessment =
            assessRouteLeg(
                leg.coordinates,
                leg.sourceCountryCode,
                leg.destinationCountryCode
            );


        legAssessments.push({

            legNumber: i + 1,

            international:
                assessment.international,

            countriesCrossed:
                assessment.countriesCrossed,

            countryCodes:
                assessment.countryCodes,

            borderWarning:
                assessment.borderWarning,

            borderAssessment:
                assessment.borderAssessment
        });


        for (
            const country of
            assessment.countriesCrossed
        ) {

            const previous =
                combinedCountries[
                    combinedCountries.length - 1
                ];

            if (country !== previous) {

                combinedCountries.push(
                    country
                );
            }
        }


        for (
            const code of
            assessment.countryCodes
        ) {

            const previous =
                combinedCodes[
                    combinedCodes.length - 1
                ];

            if (code !== previous) {

                combinedCodes.push(
                    code
                );
            }
        }
    }


    const failedLeg =
        legAssessments.find(
            leg =>
                leg.international
        );


    const international =
        Boolean(failedLeg);


    return {

        international,

        countriesCrossed:
            combinedCountries,

        countryCodes:
            combinedCodes,

        borderWarning:
            international
                ? "International border crossing detected on one or more route legs."
                : null,

        borderAssessment:
            international
                ? "LEG_INTERNATIONAL_ROUTE"
                : "ALL_LEGS_DOMESTIC",

        failedLeg:
            failedLeg
                ? failedLeg.legNumber
                : null,

        legs:
            legAssessments
    };
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    assessInternationalRoute,

    assessRouteLeg,

    assessRouteLegs
};