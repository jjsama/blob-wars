export function initDebug() {
    console.log('Debug system initialized');

    // Create a debug div if it doesn't exist
    if (!document.getElementById('debug')) {
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debug';
        debugDiv.style.position = 'fixed';
        debugDiv.style.top = '0';
        debugDiv.style.left = '0';
        debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        debugDiv.style.color = '#fff';
        debugDiv.style.padding = '10px';
        debugDiv.style.fontFamily = 'monospace';
        debugDiv.style.fontSize = '12px';
        debugDiv.style.maxHeight = '200px';
        debugDiv.style.overflowY = 'auto';
        debugDiv.style.zIndex = '1000';
        debugDiv.style.display = 'none'; // Hidden by default
        document.body.appendChild(debugDiv);

        // Add tilde key listener
        document.addEventListener('keydown', (event) => {
            if (event.key === '`' || event.key === '~') {
                event.preventDefault();
                debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
            }
        });
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

        // Limit the number of lines to prevent memory issues
        while (debugDiv.childNodes.length > 1000) {
            debugDiv.removeChild(debugDiv.firstChild);
        }
    }
}

/**
 * Log an error message to the console
 * @param {string} message - The error message
 * @param {Error|Object} [err] - Optional error object
 */
export function error(message, err) {
    const timestamp = new Date().toTimeString().split(' ')[0];
    const errorMsg = `[${timestamp}] ERROR: ${message}`;

    if (err) {
        if (err instanceof Error) {
            console.error(errorMsg, err.message);
            console.error(err.stack);
        } else if (typeof err === 'object') {
            console.error(errorMsg, JSON.stringify(err, null, 2));
        } else {
            console.error(errorMsg, err);
        }
    } else {
        console.error(errorMsg);
    }
}

export const DEBUG_MODE = true;
