export function createDebugSphere(scene, position, color = 0xff0000, size = 1) {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    scene.add(sphere);
    return sphere;
}

export function logSceneInfo(scene) {
    console.log('Scene children count:', scene.children.length);
    scene.children.forEach((child, index) => {
        console.log(`Child ${index}:`, child.type, child.position);
    });
}

// Debug utility functions
export function initDebug() {
    // Make sure debug element exists
    const debugElement = document.getElementById('debug');
    if (!debugElement) {
        const newDebugElement = document.createElement('div');
        newDebugElement.id = 'debug';
        newDebugElement.style.position = 'absolute';
        newDebugElement.style.top = '10px';
        newDebugElement.style.left = '10px';
        newDebugElement.style.color = 'white';
        newDebugElement.style.background = 'rgba(0, 0, 0, 0.7)';
        newDebugElement.style.padding = '10px';
        newDebugElement.style.fontFamily = 'monospace';
        newDebugElement.style.zIndex = '100';
        newDebugElement.style.maxHeight = '80vh';
        newDebugElement.style.overflowY = 'auto';
        newDebugElement.innerHTML = 'Debug initialized';
        document.body.appendChild(newDebugElement);
    }
}

export function log(message) {
    console.log(message);
    const debugElement = document.getElementById('debug');
    if (debugElement) {
        debugElement.innerHTML += `<br>${message}`;
    }
}

export function error(message, err) {
    console.error(message, err);
    const debugElement = document.getElementById('debug');
    if (debugElement) {
        debugElement.innerHTML += `<br><span style="color:red">ERROR: ${message}</span>`;
        if (err && err.message) {
            debugElement.innerHTML += `<br><span style="color:red">- ${err.message}</span>`;
        }
    }
}

// Make these functions global
window.debugLog = log;
window.debugError = error; 