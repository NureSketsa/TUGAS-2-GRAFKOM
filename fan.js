"use strict";

var canvas, gl, program;
var modelViewMatrix, projectionMatrix, modelViewMatrixLoc;
var instanceMatrix;
var pointsArray = [];
var stack = [];

var standId = 0;
var baseId = 1;
var frameId = 2;
var ringId = 3;
var bladeId = 4;
var numNodes = 5;

var standHeight = 0.3, standWidth = 3.0;
var baseHeight = 8.0, baseWidth = 0.5;
var frameRadius = 1.5, frameDepth = 0.3;
var ringOuter = 3.0, ringThickness = 0.2;
var bladeLength = 2.5, bladeWidth = 0.2;

var theta = [0, 0, 0, 0, 0];

var fanPosition = vec2(0, -8);
var isDragging = false;
var lastMouse = vec2(0, 0);

var fan = [];
for (let i = 0; i < numNodes; i++) fan[i] = createNode(null, null, null, null);

var vertices = [
    vec4(-0.5, -0.5,  0.5, 1.0),
    vec4(-0.5,  0.5,  0.5, 1.0),
    vec4( 0.5,  0.5,  0.5, 1.0),
    vec4( 0.5, -0.5,  0.5, 1.0),
    vec4(-0.5, -0.5, -0.5, 1.0),
    vec4(-0.5,  0.5, -0.5, 1.0),
    vec4( 0.5,  0.5, -0.5, 1.0),
    vec4( 0.5, -0.5, -0.5, 1.0)
];

function quad(a, b, c, d) {
    pointsArray.push(vertices[a], vertices[b], vertices[c], vertices[d]);
}

function cube() {
    quad(1, 0, 3, 2);
    quad(2, 3, 7, 6);
    quad(3, 0, 4, 7);
    quad(6, 5, 1, 2);
    quad(4, 5, 6, 7);
    quad(5, 4, 0, 1);
}

function createNode(transform, render, sibling, child) {
    return { transform, render, sibling, child };
}

function initNodes(Id) {
    var m = mat4();
    switch (Id) {
        case standId:
            m = mat4();
            fan[standId] = createNode(m, stand, null, baseId);
            break;

        case baseId:
            m = translate(0.0, standHeight, 0.0);
            fan[baseId] = createNode(m, base, null, frameId);
            break;

        case frameId:
            m = translate(0.0, baseHeight, 0.0);
            m = mult(m, rotate(theta[frameId], vec3(0, 1, 0)));
            fan[frameId] = createNode(m, frame, null, ringId);
            break;

        case ringId:
            m = mat4();
            fan[ringId] = createNode(m, ring, bladeId, null);
            break;

        case bladeId:
            m = rotate(theta[bladeId], vec3(0, 0, 1));
            fan[bladeId] = createNode(m, blades, null, null);
            break;
    }
}

function traverse(Id) {
    if (Id == null) return;
    stack.push(modelViewMatrix);
    modelViewMatrix = mult(modelViewMatrix, fan[Id].transform);
    fan[Id].render();
    if (fan[Id].child != null) traverse(fan[Id].child);
    modelViewMatrix = stack.pop();
    if (fan[Id].sibling != null) traverse(fan[Id].sibling);
}

function drawCube() {
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(instanceMatrix));
    for (let i = 0; i < 6; i++) gl.drawArrays(gl.TRIANGLE_FAN, 4 * i, 4);
}

function stand() {
    instanceMatrix = mult(modelViewMatrix, translate(0, 0.5 * standHeight, 0));
    instanceMatrix = mult(instanceMatrix, scale(standWidth, standHeight, standWidth));
    drawCube();
}

function base() {
    instanceMatrix = mult(modelViewMatrix, translate(0, 0.5 * baseHeight, 0));
    instanceMatrix = mult(instanceMatrix, scale(baseWidth, baseHeight, baseWidth));
    drawCube();
}

function frame() {
    instanceMatrix = mult(modelViewMatrix, scale(frameRadius, frameRadius, frameDepth));
    drawCube();
}

function ring() {
    let segments = 24;
    for (let i = 0; i < segments; i++) {
        let angle = (i / segments) * 360;
        let m = mult(modelViewMatrix, rotate(angle, vec3(0, 0, 1)));
        m = mult(m, translate(ringOuter, 0, 0));
        m = mult(m, scale(ringThickness, ringThickness, ringThickness));
        instanceMatrix = m;
        drawCube();
    }
}

function blades() {
    for (let i = 0; i < 3; i++) {
        let m = mult(modelViewMatrix, rotate(i * 120, vec3(0, 0, 1)));
        m = mult(m, translate(bladeLength / 2, 0, 0));
        m = mult(m, scale(bladeLength, bladeWidth, bladeWidth));
        instanceMatrix = m;
        drawCube();
    }
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) alert("WebGL 2 not available");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    cube();

    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");

    projectionMatrix = ortho(-6, 6, -10, 6, -6, 6);
    gl.uniformMatrix4fv(
        gl.getUniformLocation(program, "projectionMatrix"),
        false,
        flatten(projectionMatrix)
    );

    document.getElementById("sliderFrame").oninput = function (event) {
        theta[frameId] = event.target.value;
        initNodes(frameId);
    };
    document.getElementById("sliderBlade").oninput = function (event) {
        theta[bladeId] = event.target.value;
        initNodes(bladeId);
    };

    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        lastMouse = vec2(e.clientX, e.clientY);
    });

    canvas.addEventListener("mouseup", () => {
        isDragging = false;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (isDragging) {
            let dx = (e.clientX - lastMouse[0]) / 50;
            let dy = -(e.clientY - lastMouse[1]) / 50;
            fanPosition[0] += dx;
            fanPosition[1] += dy;
            lastMouse = vec2(e.clientX, e.clientY);
        }
    });

    for (let i = 0; i < numNodes; i++) initNodes(i);

    render();
};

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    modelViewMatrix = mat4();
    modelViewMatrix = mult(modelViewMatrix, translate(fanPosition[0], fanPosition[1], 0));

    traverse(standId);
    requestAnimationFrame(render);
}
