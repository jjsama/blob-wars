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
