"use strict";

var canvas, gl, program;
var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;
var modelMatrix, modelMatrixLoc;
var pointsArray = [];
var objectsData = []; // array of {name, points}
var objectBuffers = [];
var objectPositionBuffers = [];
var objectNormalBuffers = [];
var objectVertexCounts = [];
var objectColors = [];
var uColorLoc;
var normalMatrixLoc = null;
// lighting/texture uniform locations
var uLightEnabledLoc, uLightPosLoc, uLightColorLoc, uLightIntensityLoc;
var uAmbientLoc, uDiffuseLoc, uSpecularLoc, uShininessLoc;
var uUseTextureLoc, uTexColor1Loc, uTexColor2Loc, uTexTilingLoc, uTexMixLoc;
var uUseImageTextureLoc = null, uSamplerLoc = null;
var sceneTexture = null;
var sceneUseImageTexture = false;
var objectPickColors = [];
var pickProgram = null;
var pickFramebuffer = null;
var pickTexture = null;
var pickDepthBuffer = null;
var pickLocations = {};
var debugInfoDiv = null;
var vPositionLoc = -1, vNormalLoc = -1; // cached attribute locations for main program

// Wing rotation state
var wingRotationAngle = 0;
var wingRotateSpeed = 90;  // degrees per second
var isWingRotating = false;
var lastFrameTime = 0;
var wingCenter = vec3(0, 0, 0);  // will be computed from obj 18
var wingObjects = [19, 20, 21];  // wing object indices

// scene lighting / texture state (JS side)
var sceneLightEnabled = true;
var sceneLightColor = [1.0, 1.0, 1.0];
var sceneLightPos = vec3(50, 200, 100);
var sceneLightIntensity = 1.0;
var sceneAmbient = 0.2;
var sceneDiffuse = 1.0;
var sceneSpecular = 0.5;
var sceneShininess = 32.0;

var sceneUseTexture = false;
var sceneTexColor1 = [1.0, 1.0, 1.0];
var sceneTexColor2 = [0.82, 0.82, 0.82];
var sceneTexTiling = 8.0;
var sceneTexMix = 0.5;

function computeObjectCenter(objectIndex) {
    if (!objectsData || !objectsData[objectIndex]) return vec3(0,0,0);
    const pts = objectsData[objectIndex].points || [];
    if (pts.length === 0) return vec3(0,0,0);
    let sum = vec3(0,0,0);
    for (const p of pts) sum = add(sum, vec3(p[0], p[1], p[2]));
    return vec3(sum[0]/pts.length, sum[1]/pts.length, sum[2]/pts.length);
}

// Camera control variables
var cameraRotationX = 0;
var cameraRotationY = 0;
var cameraDistance = 100;
var cameraPosition = vec3(0, 10, 0);

// Mouse interaction
var isDragging = false;
var lastMouseX = 0;
var lastMouseY = 0;

// OBJ data
var objData = null;
var numVertices = 0;
// Object transform state
var objTranslate = vec3(0, 0, 0);
var objRotateX = -90; // degrees
var objRotateY = 180;
var objRotateZ = 0;
var objScale = 1.0;

function loadOBJFile(filename) {
    console.log('Loading OBJ file:', filename);
    fetch(filename)
        .then(response => {
            console.log('OBJ file response status:', response.status);
            return response.text();
        })
        .then(text => {
            console.log('OBJ file content length:', text.length);
            objData = parseOBJ(text);
            console.log('Parsed OBJ data:', objData);
            objData = scaleOBJ(objData, 0.1, 0.1, 0.1); // Scale down
            // build per-object points arrays
            objectsData = objToObjectsPointsArray(objData);
            console.log('Object data arrays:', objectsData);
            
            // colors based on part groups
            const lightBlue = [0.6,0.8,1.0], grey = [0.95,0.95,0.95];
            objectColors = []; objectPickColors = [];
            const lightBlueIndices = [13,14,15,16,17,19,20,21];

            objectsData.forEach((obj,i)=>{
                objectVertexCounts[i] = obj.points.length;
                objectColors[i] = lightBlueIndices.includes(i) ? lightBlue : grey;
                const id = i+1; // 0 reserved for background
                const r = id & 0xFF, g = (id>>8)&0xFF, b = (id>>16)&0xFF;
                objectPickColors[i] = [r/255, g/255, b/255];
            });

            // Compute wing rotation center from object 18 and total vertices
            wingCenter = computeObjectCenter(18);
            numVertices = objectVertexCounts.reduce((a,b)=>a+(b||0), 0);

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
    // create position and normal buffers per object and upload data
    objectPositionBuffers = [];
    objectNormalBuffers = [];
    objectsData.forEach((obj,i)=>{
        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(obj.points), gl.STATIC_DRAW);
        objectPositionBuffers.push(posBuf);

        const norms = (obj.normals && obj.normals.length) ? obj.normals : obj.points.map(()=>vec3(0,0,1));
        const normBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(norms), gl.STATIC_DRAW);
        objectNormalBuffers.push(normBuf);
    });

    // Uniform locations
    uColorLoc = gl.getUniformLocation(program, "uColor");
    normalMatrixLoc = gl.getUniformLocation(program, "normalMatrix");
    // lighting uniforms
    uLightEnabledLoc = gl.getUniformLocation(program, 'uLightEnabled');
    uLightPosLoc = gl.getUniformLocation(program, 'uLightPos');
    uLightColorLoc = gl.getUniformLocation(program, 'uLightColor');
    uLightIntensityLoc = gl.getUniformLocation(program, 'uLightIntensity');
    uAmbientLoc = gl.getUniformLocation(program, 'uAmbientFactor');
    uDiffuseLoc = gl.getUniformLocation(program, 'uDiffuseFactor');
    uSpecularLoc = gl.getUniformLocation(program, 'uSpecularFactor');
    uShininessLoc = gl.getUniformLocation(program, 'uShininess');
    // texture uniforms
    uUseTextureLoc = gl.getUniformLocation(program, 'uUseTexture');
    uUseImageTextureLoc = gl.getUniformLocation(program, 'uUseImageTexture');
    uSamplerLoc = gl.getUniformLocation(program, 'uSampler');
    uTexColor1Loc = gl.getUniformLocation(program, 'uTexColor1');
    uTexColor2Loc = gl.getUniformLocation(program, 'uTexColor2');
    uTexTilingLoc = gl.getUniformLocation(program, 'uTexTiling');
    uTexMixLoc = gl.getUniformLocation(program, 'uTexMix');

    // make pick code still work using position buffers reference
    objectBuffers = objectPositionBuffers.slice();
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
    modelMatrix = buildModelMatrix();

    // bind framebuffer and viewport, clear
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(pickProgram);

    // set projection and modelView into pick program (cached locations)
    if (pickLocations.modelViewMatrix) gl.uniformMatrix4fv(pickLocations.modelViewMatrix, false, flatten(modelViewMatrix));
    if (pickLocations.projectionMatrix) gl.uniformMatrix4fv(pickLocations.projectionMatrix, false, flatten(projectionMatrix));

    // draw each object with its pick color
    for (var i = 0; i < objectBuffers.length; i++) {
        bindAttr(objectBuffers[i], pickLocations.aPosition, 4);

        if (pickLocations.modelMatrix) gl.uniformMatrix4fv(pickLocations.modelMatrix, false, flatten(modelMatrix));
        var pickColor = objectPickColors[i] || [0,0,0];
        if (pickLocations.uColor) gl.uniform3fv(pickLocations.uColor, new Float32Array(pickColor));

        var count = objectVertexCounts[i] || 0;
        if (count > 0) gl.drawArrays(gl.TRIANGLES, 0, count);
    }

    // read pixel
    const pixels = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // unbind framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);

    // decode id (we encoded id = r + g<<8 + b<<16) and subtract 1
    const id = pixels[0] + (pixels[1] << 8) + (pixels[2] << 16);
    return (id === 0) ? -1 : id - 1;
}

function updateCamera() {
    const eye = add(vec3(
        cameraDistance * Math.sin(cameraRotationY) * Math.cos(cameraRotationX),
        cameraDistance * Math.sin(cameraRotationX),
        cameraDistance * Math.cos(cameraRotationY) * Math.cos(cameraRotationX)
    ), cameraPosition);
    const at = cameraPosition, up = vec3(0,1,0);
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

    // cache frequently-used attribute locations
    vPositionLoc = gl.getAttribLocation(program, "aPosition");
    vNormalLoc = gl.getAttribLocation(program, "aNormal");

    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
    modelMatrixLoc = gl.getUniformLocation(program, "modelMatrix");

    projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 1000);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // small DOM helper to shorten repetitive calls
    const G = id => document.getElementById(id);

    // init pick shader program
    pickProgram = initShaders(gl, "pick-vertex-shader", "pick-fragment-shader");
    // cache pick program uniform/attrib locations to avoid repeated lookups
    pickLocations.modelViewMatrix = gl.getUniformLocation(pickProgram, 'modelViewMatrix');
    pickLocations.projectionMatrix = gl.getUniformLocation(pickProgram, 'projectionMatrix');
    pickLocations.modelMatrix = gl.getUniformLocation(pickProgram, 'modelMatrix');
    pickLocations.uColor = gl.getUniformLocation(pickProgram, 'uColor');
    pickLocations.aPosition = gl.getAttribLocation(pickProgram, 'aPosition');
    // prepare picking framebuffer/texture
    createPickingFramebuffer(canvas.width, canvas.height);

    debugInfoDiv = G('debugInfo');

    // Combined mouse handler: dragging rotates camera; otherwise, debug hover triggers picking
    canvas.addEventListener('mousedown', function(e){ isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; });
    canvas.addEventListener('mouseup', function(){ isDragging = false; });
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left), y = Math.floor(e.clientY - rect.top);
        if (isDragging) {
            const dx = e.clientX - lastMouseX, dy = e.clientY - lastMouseY;
            cameraRotationY += dx * 0.01; cameraRotationX += dy * 0.01;
            cameraRotationX = Math.max(Math.min(cameraRotationX, Math.PI/2), -Math.PI/2);
            lastMouseX = e.clientX; lastMouseY = e.clientY;
        } else {
            const debugOn = G('debugToggle') && G('debugToggle').checked;
            if (!debugOn) return;
            const readY = rect.height - y - 1;
            const idx = pickAt(x, readY);
            debugInfoDiv.textContent = (idx === null || idx < 0) ? 'No object under cursor' : ('Object ' + idx + ': ' + ((objectsData[idx] && objectsData[idx].name) || ('object' + idx)));
        }
    });

    // Mouse wheel for zoom
    canvas.addEventListener("wheel", function(e) {
        e.preventDefault();
        cameraDistance += e.deltaY * 0.1;
        if (cameraDistance < 50) cameraDistance = 50;
        if (cameraDistance > 500) cameraDistance = 500;
    });

    // Short binding helper and compact control wiring
    var bind = function(id, ev, fn){ var el = G(id); if(!el) return el; if(ev === 'input') el.oninput = fn; else el.onchange = fn; return el; };

    bind('sliderRotateX','input', e => cameraRotationX = parseFloat(e.target.value) * Math.PI / 180);
    bind('sliderRotateY','input', e => cameraRotationY = parseFloat(e.target.value) * Math.PI / 180);
    bind('sliderZoom','input', e => cameraDistance = parseFloat(e.target.value));

    bind('objTranslateX','input', e => objTranslate[0] = parseFloat(e.target.value));
    bind('objTranslateY','input', e => objTranslate[1] = parseFloat(e.target.value));
    bind('objTranslateZ','input', e => objTranslate[2] = parseFloat(e.target.value));
    bind('objRotateX','input', e => objRotateX = parseFloat(e.target.value));
    bind('objRotateY','input', e => objRotateY = parseFloat(e.target.value));
    bind('objRotateZ','input', e => objRotateZ = parseFloat(e.target.value));
    bind('objScale','input', e => objScale = parseFloat(e.target.value));

    bind('wingRotateToggle','change', e => { isWingRotating = e.target.checked; if(isWingRotating) lastFrameTime = performance.now(); var wa = G('wingRotateAngle'); if(wa) wa.disabled = isWingRotating; });
    bind('wingRotateSpeed','input', e => wingRotateSpeed = parseFloat(e.target.value));
    bind('wingRotateAngle','input', e => { if(!isWingRotating) wingRotationAngle = parseFloat(e.target.value); });

    // Lighting & texture controls wiring
    var lightToggle = document.getElementById('lightToggle');
    var lightColorInput = document.getElementById('lightColor');
    var lightPosX = document.getElementById('lightPosX');
    var lightPosY = document.getElementById('lightPosY');
    var lightPosZ = document.getElementById('lightPosZ');
    var lightIntensity = document.getElementById('lightIntensity');
    var lightAmbient = document.getElementById('lightAmbient');
    var lightDiffuse = document.getElementById('lightDiffuse');
    var lightSpecular = document.getElementById('lightSpecular');
    var lightShininess = document.getElementById('lightShininess');

    var texToggle = document.getElementById('texToggle');
    var texColor1 = document.getElementById('texColor1');
    var texColor2 = document.getElementById('texColor2');
    var texTiling = document.getElementById('texTiling');
    var texMix = document.getElementById('texMix');

    // add a file input for uploading an image texture (insert near texture controls)
    (function(){
        var texControlsGroup = texToggle && texToggle.parentNode;
        if (texControlsGroup) {
            var fileLabel = document.createElement('label');
            fileLabel.textContent = 'Upload Texture Image:';
            fileLabel.style.display = 'inline-block';
            fileLabel.style.width = '150px';
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.id = 'texFile';
            fileInput.style.display = 'inline-block';
            fileInput.style.marginLeft = '4px';
            texControlsGroup.appendChild(document.createElement('br'));
            texControlsGroup.appendChild(fileLabel);
            texControlsGroup.appendChild(fileInput);

            fileInput.addEventListener('change', function(e){
                var f = e.target.files && e.target.files[0];
                if (!f) return;
                var reader = new FileReader();
                reader.onload = function(evt){
                    var img = new Image();
                    img.onload = function(){
                        // create or replace GL texture
                        if (sceneTexture) { gl.deleteTexture(sceneTexture); sceneTexture = null; }
                        sceneTexture = gl.createTexture();
                        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
                        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                        gl.generateMipmap(gl.TEXTURE_2D);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                        gl.bindTexture(gl.TEXTURE_2D, null);

                        // enable texture use
                        sceneUseImageTexture = true;
                        if (texToggle) texToggle.checked = true;
                        sceneUseTexture = true;
                    };
                    img.src = evt.target.result;
                };
                reader.readAsDataURL(f);
            });
        }
    })();

    function colorHexToVec3(hex) {
        hex = hex.replace('#','');
        return [parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255];
    }

    // initialize scene vars from controls
    sceneLightEnabled = lightToggle.checked;
    sceneLightColor = colorHexToVec3(lightColorInput.value);
    sceneLightPos = vec3(parseFloat(lightPosX.value), parseFloat(lightPosY.value), parseFloat(lightPosZ.value));
    sceneLightIntensity = parseFloat(lightIntensity.value);
    sceneAmbient = parseFloat(lightAmbient.value);
    sceneDiffuse = parseFloat(lightDiffuse.value);
    sceneSpecular = parseFloat(lightSpecular.value);
    sceneShininess = parseFloat(lightShininess.value);

    sceneUseTexture = texToggle.checked;
    sceneTexColor1 = colorHexToVec3(texColor1.value);
    sceneTexColor2 = colorHexToVec3(texColor2.value);
    sceneTexTiling = parseFloat(texTiling.value);
    sceneTexMix = parseFloat(texMix.value);

    // update JS state on input changes
    lightToggle.onchange = function(e){ sceneLightEnabled = e.target.checked; };
    lightColorInput.oninput = function(e){ sceneLightColor = colorHexToVec3(e.target.value); };
    lightPosX.oninput = lightPosY.oninput = lightPosZ.oninput = function(){
        sceneLightPos = vec3(parseFloat(lightPosX.value), parseFloat(lightPosY.value), parseFloat(lightPosZ.value));
    };
    lightIntensity.oninput = function(e){ sceneLightIntensity = parseFloat(e.target.value); };
    lightAmbient.oninput = function(e){ sceneAmbient = parseFloat(e.target.value); };
    lightDiffuse.oninput = function(e){ sceneDiffuse = parseFloat(e.target.value); };
    lightSpecular.oninput = function(e){ sceneSpecular = parseFloat(e.target.value); };
    lightShininess.oninput = function(e){ sceneShininess = parseFloat(e.target.value); };

    texToggle.onchange = function(e){ sceneUseTexture = e.target.checked; };
    texColor1.oninput = function(e){ sceneTexColor1 = colorHexToVec3(e.target.value); };
    texColor2.oninput = function(e){ sceneTexColor2 = colorHexToVec3(e.target.value); };
    texTiling.oninput = function(e){ sceneTexTiling = parseFloat(e.target.value); };
    texMix.oninput = function(e){ sceneTexMix = parseFloat(e.target.value); };

    // Load the OBJ file
    loadOBJFile('./fan.obj'); // Use explicit relative path
};

function render(timestamp) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    if (numVertices > 0) {
        updateCamera();

        // Update wing rotation if animation is on
        if (isWingRotating && lastFrameTime) {
            var deltaTime = (timestamp - lastFrameTime) / 1000.0; // seconds
            wingRotationAngle += wingRotateSpeed * deltaTime;
        }
        lastFrameTime = timestamp;

    // Build base model matrix from object transform state
    var baseModel = buildModelMatrix();

        // Draw each object
        var vPosition = gl.getAttribLocation(program, "aPosition");
        var vNormal = gl.getAttribLocation(program, "aNormal");
        for (var i = 0; i < objectPositionBuffers.length; i++) {
                // bind position/normal using cached attribute locations
                bindAttr(objectPositionBuffers[i], vPositionLoc, 4);
                bindAttr(objectNormalBuffers[i], vNormalLoc, 3);

            var objMatrix = baseModel;
            
            // If this is a wing object, apply additional rotation around wingCenter
            if (wingObjects.includes(i)) {
                // 1. Translate to origin
                var negCenter = translate(-wingCenter[0], -wingCenter[1], -wingCenter[2]);
                // 2. Rotate
                var wingRot = rotateY(wingRotationAngle);
                // 3. Translate back
                var posCenter = translate(wingCenter[0], wingCenter[1], wingCenter[2]);
                
                // Combine: modelMatrix * (posCenter * wingRot * negCenter)
                var wingTransform = mult(posCenter, mult(wingRot, negCenter));
                objMatrix = mult(baseModel, wingTransform);
            }

            if (modelMatrixLoc) gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(objMatrix));

            // compute and set normal matrix
            if (normalMatrixLoc) {
                var nm = normalMatrix(mult(modelViewMatrix, objMatrix));
                gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(nm));
            }

            // set color
            if (uColorLoc && objectColors[i]) {
                gl.uniform3fv(uColorLoc, new Float32Array(objectColors[i]));
            }

            // set lighting/texture uniforms per-frame
            setSceneUniforms();
            var count = objectVertexCounts[i] || 0;
            if (count > 0) gl.drawArrays(gl.TRIANGLES, 0, count);
        }
    }
    
    requestAnimationFrame(render);
}

// Build the model matrix from current object transform state
function buildModelMatrix() {
    var S = scale(objScale, objScale, objScale);
    var RX = rotateX(objRotateX);
    var RY = rotateY(objRotateY);
    var RZ = rotateZ(objRotateZ);
    var T = translate(objTranslate[0], objTranslate[1], objTranslate[2]);
    return mult(T, mult(RZ, mult(RY, mult(RX, S))));
}

// Set lighting & texture uniforms from scene state (call when program is active)
function setSceneUniforms() {
    if (uLightEnabledLoc) gl.uniform1i(uLightEnabledLoc, sceneLightEnabled ? 1 : 0);
    if (uLightPosLoc) gl.uniform3fv(uLightPosLoc, new Float32Array(sceneLightPos));
    if (uLightColorLoc) gl.uniform3fv(uLightColorLoc, new Float32Array(sceneLightColor));
    if (uLightIntensityLoc) gl.uniform1f(uLightIntensityLoc, sceneLightIntensity);
    if (uAmbientLoc) gl.uniform1f(uAmbientLoc, sceneAmbient);
    if (uDiffuseLoc) gl.uniform1f(uDiffuseLoc, sceneDiffuse);
    if (uSpecularLoc) gl.uniform1f(uSpecularLoc, sceneSpecular);
    if (uShininessLoc) gl.uniform1f(uShininessLoc, sceneShininess);

    if (uUseTextureLoc) gl.uniform1i(uUseTextureLoc, sceneUseTexture ? 1 : 0);
    if (uUseImageTextureLoc) gl.uniform1i(uUseImageTextureLoc, sceneUseImageTexture ? 1 : 0);
    // bind uploaded image texture to unit 0 when available
    if (uSamplerLoc) {
        gl.activeTexture(gl.TEXTURE0);
        if (sceneUseImageTexture && sceneTexture) {
            gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.uniform1i(uSamplerLoc, 0);
    }
    if (uTexColor1Loc) gl.uniform3fv(uTexColor1Loc, new Float32Array(sceneTexColor1));
    if (uTexColor2Loc) gl.uniform3fv(uTexColor2Loc, new Float32Array(sceneTexColor2));
    if (uTexTilingLoc) gl.uniform1f(uTexTilingLoc, sceneTexTiling);
    if (uTexMixLoc) gl.uniform1f(uTexMixLoc, sceneTexMix);
}

// helper to bind a buffer to an attribute location and enable it
function bindAttr(buffer, loc, size) {
    if (!buffer || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
}