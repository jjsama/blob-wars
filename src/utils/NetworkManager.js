/**
 * NetworkManager.js
 * Manages WebSocket connections and communication with the game server
 */

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.connected = false;
        this.lastUpdateTime = 0;
        this.messageQueue = [];
        this.eventListeners = {
            'connect': [],
            'disconnect': [],
            'playerConnected': [],
            'playerDisconnected': [],
            'gameStateUpdate': [],
            'playerDamage': [],
            'playerDeath': [],
            'playerRespawn': [],
            'projectileSpawn': []
        };
        this.serverTimeOffset = 0;
        this.RETRY_CONNECTION_DELAY = 3000; // Time in ms to wait before retrying connection
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 3; // Maximum number of reconnect attempts
        this.autoReconnect = true; // Whether to automatically reconnect
        this.pingInterval = null; // Keep track of ping interval
        this.PING_INTERVAL = 5000; // Send a ping every 5 seconds
    }

    /**
     * Initialize the NetworkManager and connect to the server
     * @param {String} serverUrl - The WebSocket server URL
     * @returns {Promise} - Resolves when connected, rejects on error
     */
    async connect(serverUrl = null) {
        // If URL not provided, construct it based on environment
        if (!serverUrl) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Check if we're in production (Digital Ocean)
            if (window.location.hostname.includes('digitaloceanspaces.com') ||
                window.location.hostname.includes('ondigitalocean.app')) {
                // Use your Digital Ocean app URL - replace this with your actual app URL
                serverUrl = `wss://${window.location.hostname}/ws`;
            } else {
                // Local development
                serverUrl = `${protocol}//${window.location.host}/ws`;
            }
        }

        console.log(`Attempting to connect to WebSocket server at ${serverUrl}`);

        return new Promise((resolve, reject) => {
            try {
                // Don't attempt to connect if we've reached the max reconnect attempts
                if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                    console.log(`Maximum reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached, stopping reconnection.`);
                    this.autoReconnect = false;
                    reject(new Error("Maximum reconnection attempts reached"));
                    return;
                }

                // If we already have a socket, close it first
                if (this.socket) {
                    try {
                        this.socket.close();
                        console.log("Closed existing socket connection");
                    } catch (err) {
                        console.warn("Error closing existing socket:", err);
                    }

                    // Clear any existing ping interval
                    if (this.pingInterval) {
                        clearInterval(this.pingInterval);
                        this.pingInterval = null;
                    }
                }

                // Create a new WebSocket connection
                console.log(`Creating new WebSocket connection to ${serverUrl}`);
                this.socket = new WebSocket(serverUrl);

                // Add properties to track connection state
                this.socket.connecting = true;
                this.socket.connectionStartTime = Date.now();

                // Setup timeout to avoid hanging indefinitely
                const connectionTimeout = setTimeout(() => {
                    if (this.socket.connecting) {
                        console.error(`WebSocket connection timeout after ${(Date.now() - this.socket.connectionStartTime) / 1000}s`);
                        reject(new Error("Connection timeout"));
                        this.reconnectAttempts++;

                        // Try to close the socket
                        try {
                            this.socket.close();
                        } catch (err) {
                            // Ignore errors during close
                        }
                    }
                }, 5000); // 5 second timeout

                this.socket.onopen = () => {
                    console.log('WebSocket connection opened successfully');
                    this.socket.connecting = false;
                    this.connected = true;
                    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                    this.processMessageQueue();
                    this._emitEvent('connect');
                    clearTimeout(connectionTimeout);

                    // Start sending periodic pings to keep the connection alive
                    this._startHeartbeat();

                    resolve();
                };

                this.socket.onmessage = (event) => {
                    // Connection is working if we're receiving messages
                    this.socket.connecting = false;
                    this._handleMessage(event.data);
                };

                this.socket.onclose = (event) => {
                    this.socket.connecting = false;
                    const reason = event.reason || 'No reason provided';
                    const code = event.code;
                    let explanation = '';

                    // Add human-readable explanations for common WebSocket close codes
                    switch (code) {
                        case 1000:
                            explanation = 'Normal closure';
                            break;
                        case 1001:
                            explanation = 'Server going down or browser navigating away';
                            break;
                        case 1002:
                            explanation = 'Protocol error';
                            break;
                        case 1003:
                            explanation = 'Received data cannot be accepted';
                            break;
                        case 1005:
                            explanation = 'No status code was provided';
                            break;
                        case 1006:
                            explanation = 'Connection lost abnormally';
                            break;
                        case 1007:
                            explanation = 'Message format error';
                            break;
                        case 1008:
                            explanation = 'Policy violation';
                            break;
                        case 1009:
                            explanation = 'Message too big';
                            break;
                        case 1010:
                            explanation = 'Required extension missing';
                            break;
                        case 1011:
                            explanation = 'Internal server error';
                            break;
                        case 1015:
                            explanation = 'TLS handshake failure';
                            break;
                        default:
                            explanation = 'Unknown error';
                    }

                    console.log(`WebSocket connection closed:
                        Code: ${code}
                        Reason: ${reason}
                        Explanation: ${explanation}
                        Reconnect Attempts: ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}
                        Auto Reconnect: ${this.autoReconnect}
                        URL: ${this.socket.url}`);

                    this.connected = false;

                    // Clear ping interval
                    if (this.pingInterval) {
                        clearInterval(this.pingInterval);
                        this.pingInterval = null;
                    }

                    this._emitEvent('disconnect', { code, reason, explanation });
                    clearTimeout(connectionTimeout);

                    // Only reconnect if autoReconnect is enabled and it wasn't a normal closure
                    if (this.autoReconnect && code !== 1000) {
                        this.reconnectAttempts++;
                        this._scheduleReconnect();
                    }
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    console.log(`Connection details:
                        URL: ${this.socket.url}
                        Ready State: ${this.socket.readyState}
                        Connecting: ${this.socket.connecting}
                        Protocol: ${this.socket.protocol}
                        Extensions: ${this.socket.extensions || 'none'}`);

                    if (this.socket.connecting) {
                        this.socket.connecting = false;
                        clearTimeout(connectionTimeout);
                        this.reconnectAttempts++;
                        reject(error);
                    }
                };
            } catch (error) {
                console.error('Failed to connect to server:', error);
                this.reconnectAttempts++;
                reject(error);
            }
        });
    }

    /**
     * Start sending periodic pings to keep the connection alive
     * @private
     */
    _startHeartbeat() {
        // Clear any existing interval first
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        // Start a new ping interval
        this.pingInterval = setInterval(() => {
            if (this.connected && this.socket) {
                // WebSocket.OPEN is 1
                if (this.socket.readyState === 1) {
                    console.log('Sending ping to server...');
                    this.send('PING', { timestamp: Date.now() });
                } else {
                    console.warn(`Socket not open, readyState: ${this.socket.readyState}`);
                    // If socket closed (3) or closing (2), attempt to reconnect
                    if (this.socket.readyState >= 2) {
                        this.connected = false;
                        if (this.autoReconnect) {
                            this._scheduleReconnect();
                        }
                    }
                }
            }
        }, this.PING_INTERVAL);

        console.log(`Heartbeat started, sending ping every ${this.PING_INTERVAL / 1000} seconds`);
    }

    /**
     * Disable automatic reconnection
     */
    disableAutoReconnect() {
        this.autoReconnect = false;
        console.log("Automatic reconnection disabled");
    }

    /**
     * Enable automatic reconnection
     */
    enableAutoReconnect() {
        this.autoReconnect = true;
        this.reconnectAttempts = 0;
        console.log("Automatic reconnection enabled");
    }

    /**
     * Schedule a reconnection attempt after delay
     * @private
     */
    _scheduleReconnect() {
        if (!this.autoReconnect || this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
            console.log("Not reconnecting: auto-reconnect disabled or max attempts reached");
            return;
        }

        console.log(`Attempting to reconnect in ${this.RETRY_CONNECTION_DELAY / 1000} seconds... (Attempt ${this.reconnectAttempts} of ${this.MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
            if (!this.connected && this.autoReconnect) {
                console.log(`Reconnection attempt ${this.reconnectAttempts}...`);
                this.connect().catch(error => {
                    console.error('Reconnection failed:', error);
                });
            }
        }, this.RETRY_CONNECTION_DELAY);
    }

    /**
     * Send a message to the server
     * @param {String} type - Message type
     * @param {Object} data - Message data
     */
    send(type, data = {}) {
        const message = JSON.stringify({
            type,
            ...data,
            timestamp: Date.now()
        });

        if (!this.connected) {
            this.messageQueue.push(message);
            return;
        }

        try {
            // WebSocket.OPEN is 1
            if (this.socket && this.socket.readyState === 1) {
                this.socket.send(message);
            } else {
                console.warn(`Cannot send message, socket readyState: ${this.socket?.readyState}`);
                this.messageQueue.push(message);

                // If socket not open, attempt to reconnect
                if (this.socket && this.socket.readyState !== 1) {
                    this.connected = false;
                    if (this.autoReconnect) {
                        this._scheduleReconnect();
                    }
                }
            }
        } catch (error) {
            console.error(`Error sending message (${type}):`, error);
            this.messageQueue.push(message); // Queue messages if there's an error
        }
    }

    /**
     * Process any queued messages when connection is established
     * @private
     */
    processMessageQueue() {
        if (this.messageQueue.length > 0) {
            console.log(`Processing ${this.messageQueue.length} queued messages`);
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                try {
                    this.socket.send(message);
                } catch (error) {
                    console.error('Error sending queued message:', error);
                    // Push back to queue if sending failed
                    this.messageQueue.unshift(message);
                    break;
                }
            }
        }
    }

    /**
     * Update player state to send to the server
     * @param {Object} position - Player position
     * @param {Object} rotation - Player rotation
     * @param {Object} playerState - Additional player state info
     */
    updatePlayerState(position, rotation, playerState = {}) {
        if (!this.connected || !this.playerId) {
            return;
        }

        // Log position updates occasionally for debugging
        if (Math.random() < 0.05) {
            console.log(`Sending position update: x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`);
        }

        this.send('PLAYER_UPDATE', {
            position,
            rotation,
            health: playerState.health,
            isAttacking: playerState.isAttacking,
            isDead: playerState.isDead,
            animation: playerState.animation,
            timestamp: Date.now()
        });
    }

    /**
     * Send a jump event to the server
     */
    sendJump() {
        if (!this.connected || !this.socket) return;

        this.send('PLAYER_JUMP', {
            timestamp: Date.now()
        });
    }

    /**
     * Send a shoot event to the server
     * @param {Object} direction - The direction vector
     * @param {Object} origin - The origin/position of the projectile
     * @param {String} projectileId - Unique ID for the projectile
     */
    sendShoot(direction, origin, projectileId) {
        if (!this.connected || !this.socket) return;

        this.send('PLAYER_SHOOT', {
            direction: {
                x: direction.x,
                y: direction.y,
                z: direction.z
            },
            origin: {
                x: origin.x,
                y: origin.y,
                z: origin.z
            },
            projectileId: projectileId
        });
    }

    /**
     * Send player attack event to the server
     */
    sendAttack() {
        this.send('PLAYER_ATTACK', {
            timestamp: Date.now()
        });
    }

    /**
     * Send player damage event to the server
     * @param {String} targetId - ID of the player who was damaged
     * @param {Number} amount - Amount of damage dealt
     */
    sendDamage(targetId, amount) {
        this.send('PLAYER_DAMAGE', {
            targetId,
            amount,
            timestamp: Date.now()
        });
    }

    /**
     * Send player death event to the server
     */
    sendDeath() {
        this.send('PLAYER_DEATH', {
            timestamp: Date.now()
        });
    }

    /**
     * Send player respawn event to the server
     * @param {Object} position - Respawn position
     */
    sendRespawn(position) {
        this.send('PLAYER_RESPAWN', {
            position,
            timestamp: Date.now()
        });
    }

    /**
     * Send projectile spawn event to the server
     * @param {Object} projectileData - Data about the spawned projectile
     */
    sendProjectileSpawn(projectileData) {
        if (!this.connected || !this.socket) return;

        this.send('PROJECTILE_SPAWN', {
            id: projectileData.id,
            position: {
                x: projectileData.position.x,
                y: projectileData.position.y,
                z: projectileData.position.z
            },
            velocity: {
                x: projectileData.velocity.x,
                y: projectileData.velocity.y,
                z: projectileData.velocity.z
            },
            ownerId: projectileData.ownerId,
            timestamp: Date.now()
        });
    }

    /**
     * Register an event listener
     * @param {String} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        } else {
            console.warn(`Unknown event: ${event}`);
        }
    }

    /**
     * Remove an event listener
     * @param {String} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(
                cb => cb !== callback
            );
        }
    }

    /**
     * Emit an event to all registered listeners
     * @param {String} event - Event name
     * @param {*} data - Event data
     * @private
     */
    _emitEvent(event, data) {
        if (this.eventListeners[event]) {
            for (const callback of this.eventListeners[event]) {
                callback(data);
            }
        }
    }

    /**
     * Handle a message from the server
     * @param {String} data - The message data
     * @private
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data);

            if (!message.type) {
                console.error('Received message without type:', message);
                return;
            }

            // Log message reception
            console.log(`Received message: ${message.type}`);

            switch (message.type) {
                case 'PLAYER_CONNECTED':
                    if (message.data && message.data.id) {
                        console.log(`Connected as player: ${message.data.id}`);
                        this.playerId = message.data.id;
                        this._emitEvent('playerConnected', message.data);
                    }
                    break;

                case 'GAME_STATE':
                    // Process game state update - the most important message type for sync
                    if (message.data) {
                        console.log('Received game state update with player data:', Object.keys(message.data.players).length);
                        this._emitEvent('gameStateUpdate', message.data);
                    }
                    break;

                case 'PROJECTILE_SPAWN':
                    // Handle projectile spawn from server
                    if (message.data) {
                        console.log(`Received projectile spawn: ${message.data.id}`);
                        this._emitEvent('projectileSpawn', message.data);
                    }
                    break;

                case 'PLAYER_DAMAGE':
                    // Handle damage event from server
                    if (message.data) {
                        console.log(`Received damage event for player: ${message.data.targetId}, amount: ${message.data.amount}`);
                        this._emitEvent('playerDamage', message.data);
                    }
                    break;

                case 'PLAYER_DEATH':
                    // Handle death event from server
                    if (message.data) {
                        console.log(`Received death event for player: ${message.data.playerId}`);
                        this._emitEvent('playerDeath', message.data);
                    }
                    break;

                case 'PLAYER_RESPAWN':
                    // Handle respawn event from server
                    if (message.data) {
                        console.log(`Received respawn event for player: ${message.data.playerId}`);
                        this._emitEvent('playerRespawn', message.data);
                    }
                    break;

                case 'PONG':
                    // Update server time offset for syncing
                    if (message.timestamp && message.serverTime) {
                        const now = Date.now();
                        const roundTripTime = now - message.timestamp;
                        const serverTime = message.serverTime;

                        // Calculate time offset between client and server
                        this.serverTimeOffset = serverTime - (now - roundTripTime / 2);

                        console.log(`Ping response received. Round trip time: ${roundTripTime}ms, Server time offset: ${this.serverTimeOffset}ms`);
                    }
                    break;

                default:
                    console.log(`Unhandled message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error, data);
        }
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        if (this.socket && this.connected) {
            this.socket.close();
        }
    }

    /**
     * Get the current server time (adjusted for estimated offset)
     * @returns {Number} Server time in milliseconds
     */
    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }
}