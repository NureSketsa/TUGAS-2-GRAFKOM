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
    var normals = [];
    for (var i = 0; i < objData.faces.length; i++) {
        var face = objData.faces[i];
        var v1 = objData.vertices[face[0]];
        var v2 = objData.vertices[face[1]];
        var v3 = objData.vertices[face[2]];
        points.push(v1);
        points.push(v2);
        points.push(v3);
        // compute flat normal for the face
        var p1 = vec3(v1[0], v1[1], v1[2]);
        var p2 = vec3(v2[0], v2[1], v2[2]);
        var p3 = vec3(v3[0], v3[1], v3[2]);
        var n = normalize(cross(subtract(p2, p1), subtract(p3, p1)));
        normals.push(n);
        normals.push(n);
        normals.push(n);
    }
    return { positions: points, normals: normals };
}

// Convert parsed obj data into an array of objects each with its own points array
function objToObjectsPointsArray(objData) {
    var out = [];
    if (!objData.objects || objData.objects.length === 0) {
        // Fallback: single anonymous object using all faces
        var pa = objToPointsArray(objData);
        out.push({ name: 'object0', points: pa.positions, normals: pa.normals });
        return out;
    }

    for (var i = 0; i < objData.objects.length; i++) {
        var o = objData.objects[i];
        var pts = [];
        var norms = [];
        for (var j = 0; j < o.faces.length; j++) {
            var f = o.faces[j];
            var v1 = objData.vertices[f[0]];
            var v2 = objData.vertices[f[1]];
            var v3 = objData.vertices[f[2]];
            pts.push(v1);
            pts.push(v2);
            pts.push(v3);
            var p1 = vec3(v1[0], v1[1], v1[2]);
            var p2 = vec3(v2[0], v2[1], v2[2]);
            var p3 = vec3(v3[0], v3[1], v3[2]);
            var n = normalize(cross(subtract(p2, p1), subtract(p3, p1)));
            norms.push(n);
            norms.push(n);
            norms.push(n);
        }
        out.push({ name: o.name || ('object' + i), points: pts, normals: norms });
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