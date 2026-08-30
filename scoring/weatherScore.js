function valueSeverity(weatherCondition){
    let severity = 0;
    weatherCondition = weatherCondition.toUpperCase();

    if(weatherCondition === "NORMAL")
        severity = 0;
    else if(weatherCondition === "LIGHT RAIN")
        severity = 1.5;
    else if(weatherCondition === "HEAVY RAIN")
        severity = 2.0;
    else 
        severity = null;



    return severity;

}

function valueAffectedness(route){
    let routeAffectedness = 0;
    
    if(route.weatherAffectedness === "Low")
        routeAffectedness = 1;
    else if(route.weatherAffectedness === "Medium")
        routeAffectedness = 3;
    else if(route.weatherAffectedness === "High")
        routeAffectedness = 5;
    
    return routeAffectedness;

}

function calculateAffectedness(routeAffectedness, severity){
    
    const score = routeAffectedness*severity;

    return score;
}

module.exports = {
    valueSeverity,
    valueAffectedness,
    calculateAffectedness
};