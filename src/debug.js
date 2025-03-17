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

// Create a toggleable console container
let consoleContainer;
let consoleVisible = false;

function createConsoleContainer() {
    if (consoleContainer) return consoleContainer;
    
    consoleContainer = document.createElement('div');
    consoleContainer.id = 'game-console';
    consoleContainer.style.position = 'fixed';
    consoleContainer.style.top = '0';
    consoleContainer.style.left = '0';
    consoleContainer.style.width = '100%';
    consoleContainer.style.height = '200px';
    consoleContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    consoleContainer.style.color = '#fff';
    consoleContainer.style.fontFamily = 'monospace';
    consoleContainer.style.fontSize = '12px';
    consoleContainer.style.padding = '10px';
    consoleContainer.style.overflowY = 'auto';
    consoleContainer.style.zIndex = '1000';
    consoleContainer.style.display = 'none'; // Hidden by default
    
    document.body.appendChild(consoleContainer);
    
    // Add event listener for Tab key to toggle console
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault(); // Prevent default tab behavior
            consoleVisible = !consoleVisible;
            consoleContainer.style.display = consoleVisible ? 'block' : 'none';
        }
    });
    
    return consoleContainer;
}

// Initialize the console container
createConsoleContainer();

// Export log and error functions
export function log(message) {
    console.log(message);
    
    if (!consoleContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    consoleContainer.appendChild(logEntry);
    
    // Auto-scroll to bottom
    consoleContainer.scrollTop = consoleContainer.scrollHeight;
}

export function error(message, err) {
    console.error(message, err);
    
    if (!consoleContainer) return;
    
    const errorEntry = document.createElement('div');
    errorEntry.textContent = `${message}: ${err?.message || err}`;
    errorEntry.style.color = '#ff5555';
    consoleContainer.appendChild(errorEntry);
    
    // Auto-scroll to bottom
    consoleContainer.scrollTop = consoleContainer.scrollHeight;
}

// Make these functions global
window.debugLog = log;
window.debugError = error; 