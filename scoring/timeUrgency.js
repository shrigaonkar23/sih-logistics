function urgencyFactor(urgency){

    urgency = urgency.toUpperCase();
    let factor = 0

    if(urgency === "LOW")
        factor = 0.5;
    else if(urgency === "MEDIUM")
        factor = 1.0;
    else if(urgency === "HIGH")
        factor = 1.5;
    else if(urgency === "CRITICAL")
        factor = 2.0;
    else 
        factor = null;

    return factor;
}

module.exports = urgencyFactor;