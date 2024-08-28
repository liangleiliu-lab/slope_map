// map.js
//import { fetchRouteData } from './firebaseData.js';

var animationPaused = true; // Global variable that keeps track of whether the animation is paused or not
var currentIndex = 0;       // Index position of the current route
var animationTimeout = null; // The timeout handle for controlling the animation

async function fetchRouteData(docId) {
    try {
        const response = await fetch(`https://us-central1-slopemap-13158.cloudfunctions.net/getRouteData?docId=${docId}`);
        if (response.ok) {
            const data = await response.json();
            console.log(data); // Confirm that the data was acquired correctly
            return data; // Returns the fetched data
        } else {
            console.error("Failed to fetch data:", response.statusText);
            return null; // Returns null if an error occurs
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        return null; // Returns null if an error occurs
    }
}

export async function initializeMap() {
    // Initial document ID to load
    const initialDocId = 'cFFY3VpZdjuaupgLvGQk';

    // Get the route data from Firebase
    const points = await fetchRouteData(initialDocId);
    console.log(points);
    if (!points || points.length === 0) {
        console.error("No data available to plot on the map.");
        return;
    }

    // Create a new map instance
    var map = new atlas.Map('myMap', {
        center: [points[0].geometry.coordinates[0], points[0].geometry.coordinates[1]], // Use the first point as the center
        zoom: 12,
        style: 'grayscale_dark',
        view: 'Auto',

        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: ''
        }
    });

    map.events.add('ready', function () {
        var datasource = new atlas.source.DataSource(null, {
            lineMetrics: true
        });

        map.sources.add(datasource);
        datasource.add(points);  // Add the route data to the data source  

        // Create a line layer to display the route
        var line = createLineFrom(points);
        datasource.add(line);

        var speedGradient = calculateGradientExpression(points, line);
        map.layers.add(new atlas.layer.LineLayer(datasource, null, {
            strokeWidth: 6,
            strokeGradient: speedGradient
        }));

        // Add a marker to display the current location information
        var infoMarker = new atlas.HtmlMarker({
            htmlContent: '<div id="infoBox" style="background-color: white; padding: 5px; border-radius: 3px;"></div>',
            position: points[0].geometry.coordinates,  // 
        });
        map.markers.add(infoMarker);

        // Add a marker to display the current location of the arrow
        var arrowMarker = new atlas.HtmlMarker({
            htmlContent: '<div style="background-color: teal; width: 15px; height: 15px; border-radius: 50%;"></div>',
            position: points[0].geometry.coordinates,   
        });
        map.markers.add(arrowMarker);

        // Add a click event to the map
        map.events.add('click', function (e) {
            pointClicked(e, popup, map);
        });

        // Create a popup to display the slope information
        var popup = new atlas.Popup({
            pixelOffset: [0, -18]
        });

        // Add a button to start and pause the animation
        document.getElementById('playPauseButton').addEventListener('click', function () {
            if (animationPaused) {
                animationPaused = false;
                startRouteAnimation(map, points, arrowMarker, infoMarker);
                this.textContent = 'Pause';
            } else {
                animationPaused = true;
                clearTimeout(animationTimeout); // Clear the timeout
                this.textContent = 'Play';
            }
        });

        // Add a button to change the document ID
        document.getElementById('getDocsBtn').addEventListener('click', async () => {
            const response = await fetch('https://us-central1-slopemap-13158.cloudfunctions.net/getAllDocumentIds');
            const docIds = await response.json();
            const docList = document.getElementById('docList');
            docList.innerHTML = '';
            docIds.forEach(id => {
                const docItem = document.createElement('div');
                docItem.textContent = id;
                docItem.style.cursor = 'pointer';
                docItem.addEventListener('click', async () => {
                    const newPoints = await fetchRouteData(id);
                    if (newPoints && newPoints.length > 0) {
                        resetMap(map, newPoints, arrowMarker, infoMarker, datasource, popup);
                    }
                });
                docList.appendChild(docItem);
            });
            docList.style.display = 'block';
        });
    });
}

function createLineFrom(points) {
    var coords = [];
    for (var i = 0; i < points.length; i++) {
        coords.push(points[i].geometry.coordinates);
    }
    return new atlas.data.LineString(coords);
}

// Function to calculate the gradient expression for the line layer
function calculateGradientExpression(points, line) {
    var exp = ['interpolate', ['linear'], ['line-progress']];
    var totalLength = atlas.math.getLengthOfPath(line);
    var progress = 0;

    for (var i = 0; i < points.length; i++) {
        exp.push(progress / totalLength);
        var slope = points[i].properties.speed;

        if (slope <= 1) {
            exp.push('#0000FF'); // blue
        } else if (slope <= 2) {
            exp.push('#1E90FF'); // dodgerblue
        } else if (slope <= 3) {
            exp.push('#00FFFF'); // cyan
        } else if (slope <= 4) {
            exp.push('#00FF00'); // lime
        } else if (slope <= 5) {
            exp.push('#7FFF00'); // chartreuse
        } else if (slope <= 6) {
            exp.push('#FFFF00'); // yellow
        } else if (slope <= 7) {
            exp.push('#FFD700'); // gold
        } else if (slope <= 8) {
            exp.push('#FFA500'); // orange
        } else if (slope <= 9) {
            exp.push('#FF4500'); // deep orange
        } else if (slope <= 10) {
            exp.push('#FF0000'); // red
        } else {
            exp.push('#8B0000'); // deep red
        }

        if (i < points.length - 1) {
            progress += atlas.math.getDistanceTo(points[i], points[i + 1]);
        }
    }

    return exp;
}

// Functions for executing animations along the way with resets
function startRouteAnimation(map, points, arrowMarker, infoMarker) {
    var animationDuration = 50; // Animation interval
    var steps = 5; // Define the number of interpolation steps 

    function interpolate(start, end, factor) {
        return start + (end - start) * factor;
    }

    function moveToNextPoint() {
        if (animationPaused) return; // If paused, return directly to

        if (currentIndex < points.length - 1) {
            var nextIndex = currentIndex + 1;
            var startPos = points[currentIndex].geometry.coordinates;
            var endPos = points[nextIndex].geometry.coordinates;
            var speed = points[currentIndex].properties.speed;

            // Interpolation to generate midpoints
            for (var step = 0; step <= steps; step++) {
                let factor = step / steps; // Calculate the interpolation factor
                let interpolatedLat = interpolate(startPos[1], endPos[1], factor);
                let interpolatedLng = interpolate(startPos[0], endPos[0], factor);
                let interpolatedPos = [interpolatedLng, interpolatedLat];

                // Update the position of the arrows
                arrowMarker.setOptions({
                    position: interpolatedPos,
                });

                // Update the location and content of the infobox
                infoMarker.setOptions({
                    position: interpolatedPos,
                    visible: true
                });

                document.getElementById('infoBox').innerHTML = `slope: ${speed} <br>Lat: ${interpolatedLat.toFixed(5)}<br>Lng: ${interpolatedLng.toFixed(5)}`;

                // 
                map.setCamera({
                    center: interpolatedPos,
                    zoom: 18,   // Zoom Level
                    pitch: 45,  // Angle of view
                    bearing: atlas.math.getHeading(startPos, endPos), // Direction of view
                    duration: animationDuration // Duration of animation
                });
            }

            // Recursive call to move to next point
            currentIndex++;
            animationTimeout = setTimeout(moveToNextPoint, animationDuration * (steps + 1)); // 增加延迟，使动画更平滑
        } else {
            // Reset the animation
            currentIndex = 0;
            arrowMarker.setOptions({
                position: points[0].geometry.coordinates,
            });
            infoMarker.setOptions({
                position: points[0].geometry.coordinates,
                visible: false
            });

            map.setCamera({
                center: points[0].geometry.coordinates,
                zoom: 17,
                pitch: 45,
                bearing: 0,
                duration: 500
            });

            animationPaused = true; // 
            document.getElementById('playPauseButton').textContent = 'Play'; // Change the button text
        }
    }

    // Start the animation
    moveToNextPoint();
}

function pointClicked(e, popup, map) {
    if (e.shapes && e.shapes.length > 0) {
        var shape = e.shapes[0];
        var prop = shape.properties || shape.getProperties();
        var coordinates = shape.geometry.coordinates || shape.getCoordinates();

        // 
        if (Array.isArray(coordinates) && Array.isArray(coordinates[0])) {
            coordinates = coordinates[0]; //  
        }

        // 
        if (Array.isArray(coordinates) && coordinates.length === 2) {
            popup.setOptions({
                content: '<div style="padding:10px;">slope: ' + prop.speed + ' mph</div>',
                position: coordinates
            });
            popup.open(map);
        } else {
            console.error("Invalid coordinates format:", coordinates);
        }
    }
}

function resetMap(map, points, arrowMarker, infoMarker, datasource, popup) {
    datasource.clear();
    datasource.add(points);

    var line = createLineFrom(points);
    datasource.add(line);

    var speedGradient = calculateGradientExpression(points, line);
    map.layers.add(new atlas.layer.LineLayer(datasource, null, {
        strokeWidth: 6,
        strokeGradient: speedGradient
    }));

    arrowMarker.setOptions({
        position: points[0].geometry.coordinates,
    });

    infoMarker.setOptions({
        position: points[0].geometry.coordinates,
        visible: false
    });

    map.setCamera({
        center: points[0].geometry.coordinates,
        zoom: 17,
        pitch: 45,
        bearing: 0,
        duration: 500
    });

    animationPaused = true;
    document.getElementById('playPauseButton').textContent = 'Play';
}