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
            'gameStateUpdate': []
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
        // If URL not provided, construct it based on the current hostname
        if (!serverUrl) {
            // Check if we're on localhost and use explicit localhost in that case
            const isLocalhost = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname === '';

            // Use explicit protocol and host for local development
            if (isLocalhost) {
                serverUrl = `ws://localhost:3000/ws`;
            } else {
                // For production/deployed environments, use relative path with current hostname
                serverUrl = `ws://${window.location.hostname}:3000/ws`;
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
                    console.log(`WebSocket connection closed (Code: ${event.code}, Reason: ${event.reason || 'None provided'})`);
                    this.connected = false;

                    // Clear ping interval
                    if (this.pingInterval) {
                        clearInterval(this.pingInterval);
                        this.pingInterval = null;
                    }

                    this._emitEvent('disconnect');
                    clearTimeout(connectionTimeout);

                    // Only reconnect if autoReconnect is enabled
                    if (this.autoReconnect) {
                        this.reconnectAttempts++;
                        this._scheduleReconnect();
                    }
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
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
     * Update player state on the server
     * @param {Object} position - Player position
     * @param {Object} rotation - Player rotation
     */
    updatePlayerState(position, rotation) {
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
            timestamp: Date.now()
        });
    }

    /**
     * Send a jump event to the server
     */
    sendJump() {
        this.send('PLAYER_JUMP');
    }

    /**
     * Send a shoot event to the server
     * @param {Object} direction - Direction vector { x, y, z }
     * @param {Object} origin - Origin position { x, y, z }
     */
    sendShoot(direction, origin) {
        this.send('PLAYER_SHOOT', {
            direction,
            origin
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

                        // Debug: log player positions from game state
                        if (message.data.players) {
                            for (const playerId in message.data.players) {
                                const player = message.data.players[playerId];
                                if (player && player.position && playerId !== this.playerId) {
                                    console.log(`Remote player ${playerId} position: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`);
                                }
                            }
                        }

                        this._emitEvent('gameStateUpdate', message.data);
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