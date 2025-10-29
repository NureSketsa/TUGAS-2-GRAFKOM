"use strict";

var canvas, gl, program;
var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;
var pointsArray = [];

// Camera control variables
var cameraRotationX = 0;
var cameraRotationY = 0;
var cameraDistance = 200;
var cameraPosition = vec3(0, 0, 0);

// Mouse interaction
var isDragging = false;
var lastMouseX = 0;
var lastMouseY = 0;

// OBJ data
var objData = null;
var numVertices = 0;

function loadOBJFile(filename) {
    fetch(filename)
        .then(response => response.text())
        .then(text => {
            objData = parseOBJ(text);
            objData = scaleOBJ(objData, 0.1, 0.1, 0.1); // Scale down
            pointsArray = objToPointsArray(objData);
            numVertices = pointsArray.length;
            
            setupBuffers();
            render();
        })
        .catch(error => {
            console.error('Error loading OBJ file:', error);
            alert('Failed to load OBJ file. Make sure the file exists.');
        });
}

function setupBuffers() {
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);
}

function updateCamera() {
    var eye = vec3(
        cameraDistance * Math.sin(cameraRotationY) * Math.cos(cameraRotationX),
        cameraDistance * Math.sin(cameraRotationX),
        cameraDistance * Math.cos(cameraRotationY) * Math.cos(cameraRotationX)
    );
    
    eye = add(eye, cameraPosition);
    
    var at = cameraPosition;
    var up = vec3(0, 1, 0);
    
    modelViewMatrix = lookAt(eye, at, up);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2 not available");
        return;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.9, 0.9, 0.9, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");

    projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 1000);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // Mouse events for rotation
    canvas.addEventListener("mousedown", function(e) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener("mouseup", function() {
        isDragging = false;
    });

    canvas.addEventListener("mousemove", function(e) {
        if (isDragging) {
            var deltaX = e.clientX - lastMouseX;
            var deltaY = e.clientY - lastMouseY;
            
            cameraRotationY += deltaX * 0.01;
            cameraRotationX += deltaY * 0.01;
            
            // Limit vertical rotation
            if (cameraRotationX > Math.PI / 2) cameraRotationX = Math.PI / 2;
            if (cameraRotationX < -Math.PI / 2) cameraRotationX = -Math.PI / 2;
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    // Mouse wheel for zoom
    canvas.addEventListener("wheel", function(e) {
        e.preventDefault();
        cameraDistance += e.deltaY * 0.1;
        if (cameraDistance < 50) cameraDistance = 50;
        if (cameraDistance > 500) cameraDistance = 500;
    });

    // Slider controls
    document.getElementById("sliderRotateX").oninput = function(e) {
        cameraRotationX = parseFloat(e.target.value) * Math.PI / 180;
    };

    document.getElementById("sliderRotateY").oninput = function(e) {
        cameraRotationY = parseFloat(e.target.value) * Math.PI / 180;
    };

    document.getElementById("sliderZoom").oninput = function(e) {
        cameraDistance = parseFloat(e.target.value);
    };

    // Load the OBJ file
    loadOBJFile('fan.obj');
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (numVertices > 0) {
        updateCamera();
        gl.drawArrays(gl.TRIANGLES, 0, numVertices);
    }
    
    requestAnimationFrame(render);
}