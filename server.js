const server = Bun.serve({
    port: 3000,
    // Add WebSocket support
    websocket: {
        // Handle new WebSocket connections
        open(ws) {
            try {
                console.log(`WebSocket connection opened: ${ws.remoteAddress}`);

                // Assign a unique ID to the player
                const playerId = generatePlayerId();
                ws.data = { playerId, lastPingTime: Date.now() }; // Store player ID and ping time

                // Add player to the connected players with proper initialization
                gameState.players[playerId] = {
                    id: playerId,
                    position: { x: 0, y: 5, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    health: 100,
                    connected: true
                };

                // Add the WebSocket to our connections map
                gameState.connections[playerId] = ws;

                // Notify the client of their ID
                ws.send(JSON.stringify({
                    type: 'PLAYER_CONNECTED',
                    data: {
                        id: playerId,
                        position: gameState.players[playerId].position
                    }
                }));

                // Log active connections after new connection
                logConnectionStats(true);

                // Broadcast state to all clients
                broadcastGameState();
            } catch (err) {
                console.error('Error in WebSocket open handler:', err);
            }
        },

        // Define the message handler
        message(ws, message) {
            try {
                const data = JSON.parse(message);

                // Update last ping time for this connection
                if (ws.data) {
                    ws.data.lastPingTime = Date.now();
                }

                handleClientMessage(ws, data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        },

        // Handle WebSocket connection close
        close(ws, code, reason) {
            console.log(`WebSocket connection closed: ${ws.remoteAddress} (Code: ${code}, Reason: ${reason || 'None'})`);

            if (ws.data && ws.data.playerId) {
                const playerId = ws.data.playerId;

                // Remove player from game state and connections map
                if (gameState.players[playerId]) {
                    delete gameState.players[playerId];
                }

                if (gameState.connections[playerId]) {
                    delete gameState.connections[playerId];
                }

                // Log active connections after disconnection
                logConnectionStats(true);

                // Notify other clients that a player disconnected
                broadcastGameState();
            }
        },

        // Define ping interval to keep connections alive
        idleTimeout: 120, // Seconds until inactive connections are closed
    },
    fetch(req, server) {
        const url = new URL(req.url);
        console.log(`Received request for: ${url.pathname}`);

        // Handle WebSocket upgrade requests
        if (url.pathname === "/ws") {
            console.log("Received WebSocket upgrade request");
            if (server.upgrade(req)) {
                console.log("WebSocket upgrade successful");
                return;
            }
            console.error("WebSocket upgrade failed");
            return new Response("WebSocket upgrade failed", { status: 400 });
        }

        // Serve index.html for root path
        if (url.pathname === "/") {
            console.log("Serving index.html");
            return new Response(Bun.file("index.html"), {
                headers: {
                    "Content-Type": "text/html",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Serve test.html
        if (url.pathname === "/test.html") {
            console.log("Serving test.html");
            return new Response(Bun.file("test.html"), {
                headers: {
                    "Content-Type": "text/html",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // Special case for Ammo.js files
        if (url.pathname === "/ammo.wasm.js" || url.pathname === "/ammo.wasm.wasm") {
            console.log(`Serving Ammo file from public directory: ${url.pathname}`);
            try {
                const file = Bun.file(`public${url.pathname}`);
                const contentType = url.pathname.endsWith('.js') ?
                    "application/javascript" : "application/wasm";

                return new Response(file, {
                    headers: {
                        "Content-Type": contentType,
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            } catch (e) {
                console.error(`Error serving Ammo file ${url.pathname}:`, e);
                return new Response("File not found", { status: 404 });
            }
        }

        // Handle JavaScript files
        if (url.pathname.endsWith('.js')) {
            console.log(`Serving JS file: ${url.pathname}`);
            const filePath = url.pathname.slice(1);
            try {
                const file = Bun.file(filePath);
                return new Response(file, {
                    headers: {
                        "Content-Type": "application/javascript",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            } catch (e) {
                console.error(`Error serving JS file ${filePath}:`, e);
                return new Response("File not found", { status: 404 });
            }
        }

        // Handle WASM files
        if (url.pathname.endsWith('.wasm')) {
            console.log(`Serving WASM file: ${url.pathname}`);
            const filePath = url.pathname.slice(1);
            try {
                const file = Bun.file(filePath);
                return new Response(file, {
                    headers: {
                        "Content-Type": "application/wasm",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            } catch (e) {
                console.error(`Error serving WASM file ${filePath}:`, e);
                return new Response("File not found", { status: 404 });
            }
        }

        // Serve other files
        try {
            const filePath = url.pathname.slice(1);
            console.log(`Attempting to serve: ${filePath}`);
            const file = Bun.file(filePath);
            return new Response(file);
        } catch (e) {
            console.error(`Error serving ${url.pathname}:`, e);
            return new Response("Not Found", { status: 404 });
        }
    },
});

// Initialize server-side game state
const gameState = {
    players: {}, // Map of player IDs to player objects
    connections: {}, // Map of player IDs to WebSocket connections
    projectiles: [], // Array of projectiles
    enemies: [], // Array of enemies
    lastUpdateTime: Date.now(),
    lastStatsTime: Date.now(),
    lastCleanupTime: Date.now(), // Initialize lastCleanupTime
    gameLoopActive: false // Flag to track if game loop is running
};

// Function to generate a unique player ID
function generatePlayerId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// Handle messages from clients
function handleClientMessage(ws, data) {
    if (!ws.data || !ws.data.playerId) {
        console.log(`Received message from unregistered player:`, data);
        return;
    }

    const playerId = ws.data.playerId;

    // Check if player exists in gameState
    if (!gameState.players[playerId]) {
        console.log(`Player ${playerId} not found in gameState, recreating player`);
        // Recreate player in gameState
        gameState.players[playerId] = {
            id: playerId,
            position: { x: 0, y: 5, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            health: 100,
            connected: true
        };
    }

    switch (data.type) {
        case 'PLAYER_UPDATE':
            try {
                // Update player position, rotation, etc. with validation
                if (data.position && typeof data.position === 'object') {
                    // Ensure position has valid properties
                    const position = {
                        x: typeof data.position.x === 'number' ? data.position.x : gameState.players[playerId].position.x,
                        y: typeof data.position.y === 'number' ? data.position.y : gameState.players[playerId].position.y,
                        z: typeof data.position.z === 'number' ? data.position.z : gameState.players[playerId].position.z
                    };
                    gameState.players[playerId].position = position;
                }

                if (data.rotation && typeof data.rotation === 'object') {
                    // Ensure rotation has valid properties
                    const rotation = {
                        x: typeof data.rotation.x === 'number' ? data.rotation.x : gameState.players[playerId].rotation.x,
                        y: typeof data.rotation.y === 'number' ? data.rotation.y : gameState.players[playerId].rotation.y,
                        z: typeof data.rotation.z === 'number' ? data.rotation.z : gameState.players[playerId].rotation.z
                    };
                    gameState.players[playerId].rotation = rotation;
                }
            } catch (err) {
                console.error(`Error updating player ${playerId}:`, err);
            }
            break;

        case 'PLAYER_SHOOT':
            // Handle player shooting
            console.log(`Player ${playerId} fired a projectile`);
            // Will implement projectile logic later
            break;

        case 'PLAYER_JUMP':
            // Handle player jump
            console.log(`Player ${playerId} jumped`);
            // Will implement jump logic later
            break;

        case 'PING':
            // Handle ping from client (keep-alive)
            ws.send(JSON.stringify({
                type: 'PONG',
                timestamp: Date.now()
            }));
            break;

        default:
            console.log(`Unknown message type: ${data.type}`);
    }
}

// Broadcast game state to all connected clients
function broadcastGameState() {
    try {
        // Create a sanitized version of the game state to broadcast
        const sanitizedPlayers = {};

        // Sanitize player data to ensure valid structure
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];

            // Only include connected players with valid data
            if (player && player.connected) {
                // Ensure player has valid position and rotation
                sanitizedPlayers[playerId] = {
                    id: playerId,
                    position: {
                        x: typeof player.position?.x === 'number' ? player.position.x : 0,
                        y: typeof player.position?.y === 'number' ? player.position.y : 5,
                        z: typeof player.position?.z === 'number' ? player.position.z : 0
                    },
                    rotation: {
                        x: typeof player.rotation?.x === 'number' ? player.rotation.x : 0,
                        y: typeof player.rotation?.y === 'number' ? player.rotation.y : 0,
                        z: typeof player.rotation?.z === 'number' ? player.rotation.z : 0
                    },
                    health: typeof player.health === 'number' ? player.health : 100
                };
            }
        }

        const payload = JSON.stringify({
            type: 'GAME_STATE',
            data: {
                players: sanitizedPlayers,
                projectiles: gameState.projectiles,
                enemies: gameState.enemies,
                timestamp: Date.now()
            }
        });

        // Count active connections
        let activeConnections = 0;

        // Send to each client directly
        for (const playerId in gameState.connections) {
            const ws = gameState.connections[playerId];
            // WebSocket.OPEN is 1
            if (ws && ws.readyState === 1) {
                try {
                    ws.send(payload);
                    activeConnections++;
                } catch (error) {
                    console.error(`Error sending to player ${playerId}:`, error);
                    // Remove the connection if we can't send to it
                    try {
                        ws.close();
                    } catch (closeError) {
                        // Ignore close errors
                    }
                    delete gameState.connections[playerId];
                    delete gameState.players[playerId];
                }
            } else if (ws) {
                console.log(`Socket for player ${playerId} not open (readyState: ${ws.readyState}), removing`);
                // Clean up non-open connections
                delete gameState.connections[playerId];
                delete gameState.players[playerId];
            }
        }
    } catch (err) {
        console.error('Error in broadcastGameState:', err);
    }
}

// Log connection stats
function logConnectionStats(force = false) {
    const now = Date.now();
    if (force || now - gameState.lastStatsTime > 5000) {
        const activeConnections = Object.keys(gameState.connections).length;
        const activePlayers = Object.keys(gameState.players).length;

        console.log(`Active connections: ${activeConnections}`);
        console.log(`Active players: ${activePlayers}`);
        gameState.lastStatsTime = now;
    }
}

// Check for inactive connections and remove them
function cleanupInactiveConnections() {
    const now = Date.now();
    const timeout = 30000; // 30 seconds timeout

    for (const playerId in gameState.connections) {
        const ws = gameState.connections[playerId];
        if (ws && ws.data && ws.data.lastPingTime) {
            const lastActive = now - ws.data.lastPingTime;
            if (lastActive > timeout) {
                console.log(`Removing inactive player ${playerId} (last active ${lastActive / 1000}s ago)`);

                // Close the connection
                try {
                    ws.close();
                } catch (err) {
                    console.error(`Error closing websocket for player ${playerId}:`, err);
                }

                // Remove player from game state and connections
                delete gameState.players[playerId];
                delete gameState.connections[playerId];
            }
        }
    }
}

// Define tick rate
const TICK_RATE = 20; // 20 updates per second (50ms)

// Start game tick loop if not already running
function startGameLoop() {
    if (gameState.gameLoopActive) {
        console.log('Game loop already running, not starting a new one');
        return;
    }

    console.log('Starting game tick loop');
    gameState.gameLoopActive = true;

    // Store interval ID so we can clear it if needed
    gameState.tickInterval = setInterval(() => {
        try {
            updateGameState();
            broadcastGameState();

            // Periodically check for inactive connections
            if (Date.now() - (gameState.lastCleanupTime || 0) > 10000) { // Every 10 seconds
                cleanupInactiveConnections();
                gameState.lastCleanupTime = Date.now();
            }

            // Log stats periodically
            logConnectionStats();
        } catch (err) {
            // Log error but continue game loop
            console.error('Error in game tick loop:', err);
        }
    }, 1000 / TICK_RATE);
}

// Update game state
function updateGameState() {
    try {
        const currentTime = Date.now();
        const deltaTime = (currentTime - gameState.lastUpdateTime) / 1000; // Convert to seconds
        gameState.lastUpdateTime = currentTime;

        // Update projectiles
        // Will implement projectile updates later

        // Update enemies
        // Will implement enemy updates later
    } catch (err) {
        console.error('Error in updateGameState:', err);
    }
}

// Start the game loop
startGameLoop();

console.log(`Server running at http://localhost:${server.port} with WebSocket support`); 