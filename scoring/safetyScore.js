// ============================================================
// SAFETY SCORE
// ============================================================
//
// Safety score represents environmental and disaster risk.
//
// It MUST NOT depend on:
// - distance
// - ETA
// - urgency
// - route length
//
// Higher score = safer route
// 100 = very low environmental risk
// 0   = extremely high environmental risk
//
// ============================================================

function clamp(
    value,
    minimum = 0,
    maximum = 100
) {

    return Math.max(
        minimum,
        Math.min(
            maximum,
            value
        )
    );
}

// ============================================================
// SAFETY SCORE
// ============================================================

function calculateSafetyScore(
    hazards
) {

    if (!hazards) {
        return 100;
    }

    const overallRisk =
        Number(
            hazards.overallRisk || 0
        );

    const safetyScore =
        100 - (
            overallRisk * 100
        );

    return Number(
        clamp(
            safetyScore
        ).toFixed(2)
    );
}

// ============================================================
// RISK LEVEL
// ============================================================

function getRiskLevel(
    overallRisk
) {

    if (overallRisk < 0.25) {
        return "LOW";
    }

    if (overallRisk < 0.50) {
        return "MEDIUM";
    }

    if (overallRisk < 0.75) {
        return "HIGH";
    }

    return "CRITICAL";
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    calculateSafetyScore,

    getRiskLevel
};