"use strict";

function parseOBJ(objText) {
    var lines = objText.split('\n');
    console.log('Parsing OBJ file with', lines.length, 'lines');
    var vertices = [];
    var faces = [];
    var currentObject = null;
    var objects = [];
    
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        
        var parts = line.split(/\s+/);
        
        if (parts[0] === 'o') {
            // New object
            if (currentObject) {
                objects.push(currentObject);
            }
            currentObject = {
                name: parts[1],
                vertices: [],
                faces: [],
                vertexOffset: vertices.length
            };
        }
        else if (parts[0] === 'v') {
            // Vertex: v x y z
            var vertex = vec4(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3]),
                1.0
            );
            vertices.push(vertex);
            if (currentObject) {
                currentObject.vertices.push(vertex);
            }
        }
        else if (parts[0] === 'f') {
            // Face: f v1 v2 v3
            var face = [
                parseInt(parts[1]) - 1,
                parseInt(parts[2]) - 1,
                parseInt(parts[3]) - 1
            ];
            faces.push(face);
            if (currentObject) {
                currentObject.faces.push(face);
            }
        }
    }
    
    if (currentObject) {
        objects.push(currentObject);
    }
    
    return { 
        vertices: vertices, 
        faces: faces,
        objects: objects
    };
}

function objToPointsArray(objData) {
    var points = [];
    for (var i = 0; i < objData.faces.length; i++) {
        var face = objData.faces[i];
        points.push(objData.vertices[face[0]]);
        points.push(objData.vertices[face[1]]);
        points.push(objData.vertices[face[2]]);
    }
    return points;
}

// Convert parsed obj data into an array of objects each with its own points array
function objToObjectsPointsArray(objData) {
    var out = [];
    if (!objData.objects || objData.objects.length === 0) {
        // Fallback: single anonymous object using all faces
        out.push({ name: 'object0', points: objToPointsArray(objData) });
        return out;
    }

    for (var i = 0; i < objData.objects.length; i++) {
        var o = objData.objects[i];
        var pts = [];
        for (var j = 0; j < o.faces.length; j++) {
            var f = o.faces[j];
            pts.push(objData.vertices[f[0]]);
            pts.push(objData.vertices[f[1]]);
            pts.push(objData.vertices[f[2]]);
        }
        out.push({ name: o.name || ('object' + i), points: pts });
    }

    return out;
}

function scaleOBJ(objData, scaleX, scaleY, scaleZ) {
    var scaled = { 
        vertices: [], 
        faces: objData.faces,
        objects: objData.objects 
    };
    
    for (var i = 0; i < objData.vertices.length; i++) {
        scaled.vertices.push(vec4(
            objData.vertices[i][0] * scaleX,
            objData.vertices[i][1] * scaleY,
            objData.vertices[i][2] * scaleZ,
            1.0
        ));
    }
    
    return scaled;
}