function MaxMin(routes, parameter) {

    let Max = routes[0];
    let Min = routes[0];

    for(const route of routes){
        if(route[parameter]>Max[parameter])
            Max = route;
        if(route[parameter]<Min[parameter])
            Min = route;
    }

    return{
        Max,
        Min
    };

}

function calculateScore(route, parameter, Max, Min){

    let Score = 0;

    if(Max[parameter]=== Min[parameter])
        Score = 0;
    else
        Score = 10*((route[parameter] - Min[parameter])/(Max[parameter] - Min[parameter]));

    return Score;

}

module.exports = {
    MaxMin,
    calculateScore
};