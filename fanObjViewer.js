"use strict";

var canvas, gl, program;
var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;
var modelMatrix, modelMatrixLoc;
var pointsArray = [];
var objectsData = []; // array of {name, points}
var objectBuffers = [];
var objectVertexCounts = [];
var objectColors = [];
var uColorLoc;
var objectPickColors = [];
var pickProgram = null;
var pickFramebuffer = null;
var pickTexture = null;
var pickDepthBuffer = null;
var pickLocations = {};
var debugInfoDiv = null;

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
// Object transform state
var objTranslate = vec3(0, 0, 0);
var objRotateX = 0; // degrees
var objRotateY = 0;
var objRotateZ = 0;
var objScale = 0.1;

function loadOBJFile(filename) {
    fetch(filename)
        .then(response => response.text())
        .then(text => {
            objData = parseOBJ(text);
            objData = scaleOBJ(objData, 0.1, 0.1, 0.1); // Scale down
            // build per-object points arrays
            objectsData = objToObjectsPointsArray(objData);
            // default colors (cycle if more objects)
            var defaultColors = [
                [0.8, 0.2, 0.2], // red
                [0.2, 0.8, 0.2], // green
                [0.2, 0.4, 0.8], // blue
                [0.9, 0.7, 0.2], // yellow
                [0.7, 0.3, 0.8], // purple
                [0.3, 0.7, 0.7]  // teal
            ];
            objectColors = [];
            for (var i = 0; i < objectsData.length; i++) {
                objectVertexCounts[i] = objectsData[i].points.length;
                objectColors[i] = defaultColors[i % defaultColors.length];
                    // pick color encode index+1 into RGB
                    var id = i + 1; // 0 reserved for background
                    var r = id & 0xFF;
                    var g = (id >> 8) & 0xFF;
                    var b = (id >> 16) & 0xFF;
                    objectPickColors[i] = [r / 255.0, g / 255.0, b / 255.0];
            }
            // total vertex count (for a quick check)
            numVertices = 0;
            for (var k = 0; k < objectVertexCounts.length; k++) numVertices += objectVertexCounts[k];

            console.log('Loaded objects:', objectsData.length);

            setupBuffers();
            render();
        })
        .catch(error => {
            console.error('Error loading OBJ file:', error);
            alert('Failed to load OBJ file. Make sure the file exists.');
        });
}

function setupBuffers() {
    // create a buffer per object and upload its points
    objectBuffers = [];
    var vPosition = gl.getAttribLocation(program, "aPosition");
    for (var i = 0; i < objectsData.length; i++) {
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(objectsData[i].points), gl.STATIC_DRAW);
        gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);
        objectBuffers.push(buf);
    }

    uColorLoc = gl.getUniformLocation(program, "uColor");
}

function createPickingFramebuffer(width, height) {
    // create texture
    pickTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pickTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // create renderbuffer for depth
    pickDepthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickDepthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

    // create framebuffer
    pickFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickDepthBuffer);

    var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('Picking framebuffer incomplete: ' + status);
    }

    // unbind
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function pickAt(x, y) {
    if (!pickProgram || !pickFramebuffer) return null;
    // ensure camera/model matrices are up-to-date
    updateCamera();
    // Build model matrix from object transform state used for picking
    var S = scale(objScale, objScale, objScale);
    var RX = rotateX(objRotateX);
    var RY = rotateY(objRotateY);
    var RZ = rotateZ(objRotateZ);
    var T = translate(objTranslate[0], objTranslate[1], objTranslate[2]);
    modelMatrix = mult(T, mult(RZ, mult(RY, mult(RX, S))));

    // bind framebuffer and viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(pickProgram);

    // set projection and modelView into pick program
    var pickMVLoc = gl.getUniformLocation(pickProgram, 'modelViewMatrix');
    var pickProjLoc = gl.getUniformLocation(pickProgram, 'projectionMatrix');
    var pickModelLoc = gl.getUniformLocation(pickProgram, 'modelMatrix');
    var pickUColorLoc = gl.getUniformLocation(pickProgram, 'uColor');

    if (pickMVLoc) gl.uniformMatrix4fv(pickMVLoc, false, flatten(modelViewMatrix));
    if (pickProjLoc) gl.uniformMatrix4fv(pickProjLoc, false, flatten(projectionMatrix));

    var pickAPos = gl.getAttribLocation(pickProgram, 'aPosition');

    // draw each object with its pick color
    for (var i = 0; i < objectBuffers.length; i++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, objectBuffers[i]);
        gl.vertexAttribPointer(pickAPos, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(pickAPos);

        if (pickModelLoc) gl.uniformMatrix4fv(pickModelLoc, false, flatten(modelMatrix));
        var pickColor = objectPickColors[i] || [0,0,0];
        if (pickUColorLoc) gl.uniform3fv(pickUColorLoc, new Float32Array(pickColor));

        var count = objectVertexCounts[i] || 0;
        if (count > 0) gl.drawArrays(gl.TRIANGLES, 0, count);
    }

    // read pixel
    var pixels = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);

    // decode id (we encoded id = r + g<<8 + b<<16) and subtract 1
    var id = pixels[0] + (pixels[1] << 8) + (pixels[2] << 16);
    if (id === 0) return -1;
    return id - 1;
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
    modelMatrixLoc = gl.getUniformLocation(program, "modelMatrix");

    projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 1000);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // init pick shader program
    pickProgram = initShaders(gl, "pick-vertex-shader", "pick-fragment-shader");
    // prepare picking framebuffer/texture
    createPickingFramebuffer(canvas.width, canvas.height);

    debugInfoDiv = document.getElementById('debugInfo');

    // mousemove for picking (hover)
    canvas.addEventListener('mousemove', function(e) {
        var debugOn = document.getElementById('debugToggle') && document.getElementById('debugToggle').checked;
        if (!debugOn) return;
        if (isDragging) return; // don't pick while dragging
        var rect = canvas.getBoundingClientRect();
        var x = Math.floor(e.clientX - rect.left);
        var y = Math.floor(e.clientY - rect.top);
        // flip y for WebGL readPixels
        var readY = rect.height - y - 1;
        var idx = pickAt(x, readY);
        if (idx === null || idx < 0) {
            debugInfoDiv.textContent = 'No object under cursor';
        } else {
            var name = (objectsData[idx] && objectsData[idx].name) ? objectsData[idx].name : ('object' + idx);
            debugInfoDiv.textContent = 'Object ' + idx + ': ' + name;
        }
    });

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

    // Object control sliders
    document.getElementById("objTranslateX").oninput = function(e) {
        objTranslate[0] = parseFloat(e.target.value);
    };
    document.getElementById("objTranslateY").oninput = function(e) {
        objTranslate[1] = parseFloat(e.target.value);
    };
    document.getElementById("objTranslateZ").oninput = function(e) {
        objTranslate[2] = parseFloat(e.target.value);
    };

    document.getElementById("objRotateX").oninput = function(e) {
        objRotateX = parseFloat(e.target.value);
    };
    document.getElementById("objRotateY").oninput = function(e) {
        objRotateY = parseFloat(e.target.value);
    };
    document.getElementById("objRotateZ").oninput = function(e) {
        objRotateZ = parseFloat(e.target.value);
    };

    document.getElementById("objScale").oninput = function(e) {
        objScale = parseFloat(e.target.value);
    };

    // Load the OBJ file
    loadOBJFile('fan.obj');
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (numVertices > 0) {
        updateCamera();
        // Build model matrix from object transform state: T * Rz * Ry * Rx * S
        var S = scale(objScale, objScale, objScale);
        var RX = rotateX(objRotateX);
        var RY = rotateY(objRotateY);
        var RZ = rotateZ(objRotateZ);
        var T = translate(objTranslate[0], objTranslate[1], objTranslate[2]);
        modelMatrix = mult(T, mult(RZ, mult(RY, mult(RX, S))));
        if(modelMatrixLoc) gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelMatrix));
        // Draw each object with its assigned color
        for (var i = 0; i < objectBuffers.length; i++) {
            gl.bindBuffer(gl.ARRAY_BUFFER, objectBuffers[i]);
            var vPosition = gl.getAttribLocation(program, "aPosition");
            gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vPosition);

            if (uColorLoc && objectColors[i]) {
                gl.uniform3fv(uColorLoc, new Float32Array(objectColors[i]));
            }
            var count = objectVertexCounts[i] || 0;
            if (count > 0) gl.drawArrays(gl.TRIANGLES, 0, count);
        }
    }
    
    requestAnimationFrame(render);
}