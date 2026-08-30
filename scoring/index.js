const { MaxMin, calculateScore } = require("./normalizeScore");

const urgencyFactor = require("./timeUrgency");

const {
    valueSeverity,
    valueAffectedness,
    calculateAffectedness
} = require("./weatherScore");

module.exports = {
    MaxMin,
    calculateScore,
    urgencyFactor,
    valueSeverity,
    valueAffectedness,
    calculateAffectedness
};