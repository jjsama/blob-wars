// Global reference to debug overlay
let debugDiv = null;

export function initDebug() {
    console.log('Debug system initialized');

    // Remove any existing debug overlays first
    const existingDebug = document.getElementById('debug');
    if (existingDebug) {
        existingDebug.remove();
    }

    // Create a new debug div
    debugDiv = document.createElement('div');
    debugDiv.id = 'debug';
    debugDiv.style.position = 'fixed';
    debugDiv.style.top = '0';
    debugDiv.style.left = '0';
    debugDiv.style.width = '100%';
    debugDiv.style.maxHeight = '50vh';
    debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    debugDiv.style.color = '#fff';
    debugDiv.style.padding = '10px';
    debugDiv.style.fontFamily = 'monospace';
    debugDiv.style.fontSize = '12px';
    debugDiv.style.overflowY = 'auto';
    debugDiv.style.zIndex = '9999';
    debugDiv.style.display = 'none'; // Hidden by default
    document.body.appendChild(debugDiv);

    // Remove any existing tilde key listeners
    const oldListener = window._debugKeyListener;
    if (oldListener) {
        document.removeEventListener('keydown', oldListener);
    }

    // Add new tilde key listener
    const keyListener = (event) => {
        if (event.key === '`' || event.key === '~') {
            event.preventDefault();
            debugDiv.style.display = debugDiv.style.display === 'none' ? 'block' : 'none';
        }
    };
    window._debugKeyListener = keyListener;
    document.addEventListener('keydown', keyListener);
}

export function log(message, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}`;

    // Log to console
    console.log(formattedMessage, ...args);

    // Append to debug div if it exists
    if (debugDiv) {
        const logLine = document.createElement('div');
        logLine.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        logLine.style.padding = '2px 0';
        logLine.textContent = args.length > 0 ?
            `${formattedMessage} ${args.map(a => JSON.stringify(a)).join(' ')}` :
            formattedMessage;
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

    // Log to console
    console.error(errorMsg);
    if (err) {
        if (err instanceof Error) {
            console.error(err.message);
            console.error(err.stack);
        } else {
            console.error(err);
        }
    }

    // Add to debug overlay with red color
    if (debugDiv) {
        const errorLine = document.createElement('div');
        errorLine.style.color = '#ff4444';
        errorLine.style.borderBottom = '1px solid rgba(255, 0, 0, 0.2)';
        errorLine.style.padding = '2px 0';
        errorLine.textContent = errorMsg;
        if (err) {
            const errorDetails = document.createElement('div');
            errorDetails.style.paddingLeft = '20px';
            errorDetails.style.color = '#ff8888';
            errorDetails.textContent = err instanceof Error ?
                `${err.message}\n${err.stack}` :
                JSON.stringify(err, null, 2);
            errorLine.appendChild(errorDetails);
        }
        debugDiv.appendChild(errorLine);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

export const DEBUG_MODE = true;
