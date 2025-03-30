export function initDebug() {
    console.log('Debug system initialized');

    // Create a debug div if it doesn't exist
    if (!document.getElementById('debug')) {
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debug';
        document.body.appendChild(debugDiv);
    }
}

export function log(message, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}`;

    // Log to console
    console.log(formattedMessage, ...args);

    // Append to debug div if it exists
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        const logLine = document.createElement('div');
        logLine.textContent = args.length > 0 ? `${formattedMessage} ${args.map(a => JSON.stringify(a)).join(' ')}` : formattedMessage;
        debugDiv.appendChild(logLine);

        // Auto-scroll to bottom
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

export function error(message, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ERROR: ${message}`;

    // Log to console with error styling
    console.error(formattedMessage, ...args);

    // Append to debug div with error styling if it exists
    const debugDiv = document.getElementById('debug');
    if (debugDiv) {
        const errorLine = document.createElement('div');
        errorLine.style.color = 'red';
        errorLine.style.fontWeight = 'bold';
        errorLine.textContent = args.length > 0 ? `${formattedMessage} ${args.map(a => JSON.stringify(a)).join(' ')}` : formattedMessage;
        debugDiv.appendChild(errorLine);

        // Auto-scroll to bottom
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

export const DEBUG_MODE = true;
