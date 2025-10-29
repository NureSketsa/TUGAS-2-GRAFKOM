"use strict";

function parseOBJ(objText) {
    var lines = objText.split('\n');
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