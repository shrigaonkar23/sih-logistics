const source = [91.774975, 26.174722]; // Guwahati
const destination = [91.879421, 25.577511]; // Shillong

const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${source.join(",")};${destination.join(",")}` +
    `?overview=full&geometries=geojson&steps=true&annotations=true`;

fetch(url)
    .then(res => {
        console.log("Status:", res.status);
        return res.json();
    })
    .then(data => {
        console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
        console.error("Error:", err);
    });