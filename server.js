const server = Bun.serve({
    port: process.env.PORT || 3000,
    // Add WebSocket support
    websocket: {
        // Handle new WebSocket connections
        open(ws) {
            // *** Wrap entire handler in try...catch ***
            try {
                console.log(`WebSocket connection opened: ${ws.remoteAddress}`);

                // Assign a unique ID to the player
                const playerId = generatePlayerId();
                ws.data = { playerId, lastPingTime: Date.now() }; // Store player ID and ping time

                // Add player to the connected players with proper initialization
                gameState.players[playerId] = {
                    id: playerId,
                    position: { x: 0, y: 5, z: 0 }, // Start slightly above ground
                    rotation: { x: 0, y: 0, z: 0 },
                    health: 100,
                    isDead: false,
                    isAttacking: false,
                    isJumping: false, // *** Initialize isJumping ***
                    animation: 'idle',
                    lastProcessedInput: 0,
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

                // --- Temporarily delay the first broadcast --- 
                // Broadcast state to all clients (might error if called too early?)
                // Consider adding a small delay or ensuring state is ready
                // broadcastGameState(); 
                console.log(`[Open] Skipping immediate broadcast for ${playerId}`);
                // The regular game loop will eventually broadcast the state.
                // --- End temporary delay ---

            } catch (err) {
                // *** Log any error during open ***
                console.error('[!!!] Critical Error in WebSocket open handler:', err);
                // Optionally try to close the connection gracefully on error
                try { ws.close(1011, "Server error during connection setup"); } catch (closeErr) { }
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
                console.error('[!!!] Critical Error parsing/handling WebSocket message:', error);
                console.error('Offending message content (raw):', message);
                try { ws.close(1008, "Server error processing message"); } catch (closeErr) { }
            }
        },

        // Handle WebSocket connection close
        close(ws, code, reason) {
            const remoteAddr = ws.remoteAddress || 'Unknown Address'; // Get address before potential data loss
            const playerId = ws.data?.playerId || 'Unknown Player ID'; // Get Player ID safely
            console.log(`WebSocket connection closed for Player: ${playerId} (${remoteAddr}) - Code: ${code}, Reason: ${reason || 'None'})`);

            // Clean up if player data exists
            if (ws.data && ws.data.playerId) {
                const pid = ws.data.playerId; // Use local var for clarity

                // Remove player from game state and connections map
                if (gameState.players[pid]) {
                    console.log(`Removing player ${pid} from gameState.players`);
                    delete gameState.players[pid];
                } else {
                    console.log(`Player ${pid} not found in gameState.players during close`);
                }

                if (gameState.connections[pid]) {
                    console.log(`Removing player ${pid} from gameState.connections`);
                    delete gameState.connections[pid];
                } else {
                    console.log(`Player ${pid} not found in gameState.connections during close`);
                }

                // Log active connections after disconnection
                logConnectionStats(true);

                // Notify other clients that a player disconnected (consider delaying slightly?)
                // Use pid here
                // TODO: Broadcasting here might cause issues if server is shutting down. Re-evaluate.
                broadcastGameState(); // Let broadcast handle filtering disconnected players
            } else {
                console.log(`Closing connection did not have associated player data.`);
            }
        },

        // Define ping interval to keep connections alive
        idleTimeout: 300, // Increased from 120 seconds to 300 seconds (5 minutes)
    },
    async fetch(req, server) {
        const url = new URL(req.url);
        console.log(`Received request for: ${url.pathname} [${req.method}]`);
        console.log('Request headers:', Object.fromEntries(req.headers.entries()));
        console.log('Request origin:', req.headers.get('origin'));

        // Add detailed error handling
        try {
            // Enhanced CORS headers
            const corsHeaders = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
                "Access-Control-Max-Age": "86400", // 24 hours
                "Access-Control-Allow-Credentials": "true"
            };

            // Log the CORS headers we're sending back
            console.log('Responding with CORS headers:', corsHeaders);

            // Handle OPTIONS requests (CORS preflight)
            if (req.method === "OPTIONS") {
                console.log("Handling CORS preflight request");
                return new Response(null, {
                    status: 204,
                    headers: corsHeaders
                });
            }

            // Handle WebSocket upgrade requests
            if (url.pathname === "/ws") {
                console.log("Received WebSocket upgrade request");
                if (server.upgrade(req)) {
                    console.log("WebSocket upgrade successful");
                    return;
                }
                console.error("WebSocket upgrade failed");
                return new Response("WebSocket upgrade failed", {
                    status: 400,
                    headers: corsHeaders
                });
            }

            // Serve index.html for root path
            if (url.pathname === "/") {
                console.log("Serving index.html");
                try {
                    const file = Bun.file("dist/index.html");
                    const exists = await file.exists();
                    if (!exists) {
                        console.error("index.html not found in path:", process.cwd());
                        return new Response("index.html not found", {
                            status: 404,
                            headers: corsHeaders
                        });
                    }
                    return new Response(file, {
                        headers: {
                            "Content-Type": "text/html",
                            ...corsHeaders
                        }
                    });
                } catch (e) {
                    console.error("Error serving index.html:", e, "Current directory:", process.cwd());
                    return new Response("Error serving index.html", {
                        status: 500,
                        headers: corsHeaders
                    });
                }
            }

            // Special case for Ammo.js files
            if (url.pathname === "/ammo.wasm.js" || url.pathname === "/ammo.wasm.wasm") {
                console.log(`Serving Ammo file: ${url.pathname}`);
                try {
                    // Try dist directory first
                    let file = Bun.file(`dist${url.pathname}`);
                    let exists = await file.exists();

                    if (!exists) {
                        // Try public directory if not in dist
                        file = Bun.file(`public${url.pathname}`);
                        exists = await file.exists();

                        if (!exists) {
                            console.error(`Ammo file ${url.pathname} not found in dist or public directories`);
                            return new Response("File not found", {
                                status: 404,
                                headers: corsHeaders
                            });
                        }
                    }

                    const contentType = url.pathname.endsWith('.js') ?
                        "application/javascript" : "application/wasm";

                    return new Response(file, {
                        headers: {
                            "Content-Type": contentType,
                            ...corsHeaders
                        }
                    });
                } catch (e) {
                    console.error(`Error serving Ammo file ${url.pathname}:`, e);
                    return new Response("Error serving file", {
                        status: 500,
                        headers: corsHeaders
                    });
                }
            }

            // Handle JavaScript files
            if (url.pathname.endsWith('.js')) {
                console.log(`Serving JS file: ${url.pathname}`);
                try {
                    // Try dist directory first
                    let file = Bun.file(`dist${url.pathname}`);
                    let exists = await file.exists();

                    if (!exists) {
                        // Try root directory if not in dist
                        file = Bun.file(url.pathname.slice(1));
                        exists = await file.exists();

                        if (!exists) {
                            console.error(`JS file ${url.pathname} not found in dist or root directories`);
                            return new Response("File not found", {
                                status: 404,
                                headers: corsHeaders
                            });
                        }
                    }

                    return new Response(file, {
                        headers: {
                            "Content-Type": "application/javascript",
                            ...corsHeaders
                        }
                    });
                } catch (e) {
                    console.error(`Error serving JS file ${url.pathname}:`, e);
                    return new Response("Error serving file", {
                        status: 500,
                        headers: corsHeaders
                    });
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
        } catch (e) {
            console.error("Unhandled server error:", e);
            return new Response("Internal Server Error", {
                status: 500,
                headers: {
                    "Content-Type": "text/plain",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
    },
});

// Initialize server-side game state
const gameState = {
    players: {}, // Map of player IDs to player objects
    connections: {}, // Map of player IDs to WebSocket connections
    projectiles: [], // Array of active projectiles
    enemies: [], // Array of enemies
    lastUpdateTime: Date.now(),
    lastStatsTime: Date.now(),
    lastCleanupTime: Date.now(), // Initialize lastCleanupTime
    gameLoopActive: false, // Flag to track if game loop is running
    lastBroadcastState: null, // Store the state from the last broadcast for delta calculation
    broadcastCounter: 0 // Counter for sending periodic full updates
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
    const player = gameState.players[playerId]; // Get player object reference

    // Check if player exists in gameState
    if (!player) { // Use the reference
        console.log(`Player ${playerId} not found in gameState, ignoring message type: ${data.type}`);
        // Don't recreate player here, rely on open() handler
        return;
    }

    switch (data.type) {
        case 'PLAYER_UPDATE':
            try {
                // Update player position, rotation, etc. with validation
                if (data.position && typeof data.position === 'object') {
                    // Ensure position has valid properties
                    const position = {
                        x: typeof data.position.x === 'number' ? data.position.x : player.position.x,
                        y: typeof data.position.y === 'number' ? Math.max(0, data.position.y) : player.position.y, // Ensure Y is never negative
                        z: typeof data.position.z === 'number' ? data.position.z : player.position.z
                    };

                    // Apply basic speed check to prevent teleporting/speedhacking
                    const prevPos = player.position;
                    const distance = Math.sqrt(
                        Math.pow(position.x - prevPos.x, 2) +
                        Math.pow(position.y - prevPos.y, 2) +
                        Math.pow(position.z - prevPos.z, 2)
                    );

                    // If distance is too large, reject the update
                    // *** Increased threshold slightly ***
                    const MAX_MOVEMENT_PER_UPDATE = 15; // Increased from 10
                    if (distance > MAX_MOVEMENT_PER_UPDATE) {
                        console.log(`Rejecting movement from ${playerId}: distance ${distance.toFixed(2)} exceeds limit`);
                    } else {
                        player.position = position;
                    }
                }

                if (data.rotation && typeof data.rotation === 'object') {
                    // Ensure rotation has valid properties
                    const rotation = {
                        x: typeof data.rotation.x === 'number' ? data.rotation.x : player.rotation.x,
                        y: typeof data.rotation.y === 'number' ? data.rotation.y : player.rotation.y,
                        z: typeof data.rotation.z === 'number' ? data.rotation.z : player.rotation.z
                    };
                    player.rotation = rotation;
                }

                // Update player state if provided
                if (data.health !== undefined && typeof data.health === 'number') {
                    player.health = data.health;
                }

                if (data.isDead !== undefined) {
                    player.isDead = Boolean(data.isDead);
                }

                if (data.animation) {
                    player.animation = data.animation;
                }

                if (data.isAttacking !== undefined) {
                    player.isAttacking = Boolean(data.isAttacking);
                }

                // Store sequence number for client-side prediction
                if (data.sequence !== undefined && typeof data.sequence === 'number') {
                    player.lastProcessedInput = data.sequence;
                }
            } catch (err) {
                console.error(`Error updating player ${playerId}:`, err);
            }
            break;

        case 'PROJECTILE_SPAWN':
            // Handle projectile spawn
            if (data.id && data.position && data.velocity && data.ownerId) {
                // Validate projectile data
                if (typeof data.position.x !== 'number' ||
                    typeof data.position.y !== 'number' ||
                    typeof data.position.z !== 'number' ||
                    typeof data.velocity.x !== 'number' ||
                    typeof data.velocity.y !== 'number' ||
                    typeof data.velocity.z !== 'number') {
                    console.error('Invalid projectile data:', data);
                    return;
                }

                const projectile = {
                    id: data.id,
                    ownerId: data.ownerId,
                    position: {
                        x: data.position.x,
                        y: data.position.y,
                        z: data.position.z
                    },
                    velocity: {
                        x: data.velocity.x,
                        y: data.velocity.y,
                        z: data.velocity.z
                    },
                    createdAt: Date.now(),
                    active: true
                };

                // Add to game state
                gameState.projectiles.push(projectile);

                // Broadcast to all clients including sender for confirmation
                broadcastToAll({
                    type: 'PROJECTILE_SPAWN',
                    data: projectile
                });

                console.log(`Projectile ${projectile.id} spawned by player ${data.ownerId}`);
            } else {
                console.error('Invalid projectile spawn data:', data);
            }
            break;

        case 'PLAYER_JUMP':
            console.log(`Player ${playerId} jumped`);
            if (player && !player.isJumping && !player.isDead) {
                player.isJumping = true;

                // Reset isJumping after a short delay (e.g., 1 second)
                // Store the timeout ID on the player object to prevent multiple resets
                if (player.jumpTimeoutId) {
                    clearTimeout(player.jumpTimeoutId);
                }
                player.jumpTimeoutId = setTimeout(() => {
                    if (player) { // Check if player still exists
                        player.isJumping = false;
                        player.jumpTimeoutId = null; // Clear the stored ID
                        console.log(`Player ${playerId} jump state reset`);
                    }
                }, 1000); // 1 second duration for jump state
            }
            break;

        case 'PLAYER_SHOOT':
            // Handle player shooting
            console.log(`Player ${playerId} fired a projectile`);
            if (data.direction && data.origin) {
                // Create projectile in game state
                const projectile = {
                    id: `proj_${playerId}_${Date.now()}`,
                    ownerId: playerId,
                    origin: data.origin,
                    direction: data.direction,
                    speed: 50, // Units per second
                    damage: 10,
                    createdAt: Date.now(),
                    position: { ...data.origin }, // Start at origin
                    active: true
                };

                gameState.projectiles.push(projectile);
                console.log(`Created projectile ${projectile.id} for player ${playerId}`);
            }
            break;

        case 'PLAYER_ATTACK':
            // Handle player attack
            console.log(`Player ${playerId} attacked`);
            player.isAttacking = true;

            // Reset attack state after animation duration
            setTimeout(() => {
                if (player) { // Check player still exists
                    player.isAttacking = false;
                }
            }, 800);
            break;

        case 'PLAYER_DAMAGE':
            // Handle player damage event
            if (data.targetId && typeof data.amount === 'number') {
                const targetId = data.targetId;
                const amount = data.amount;

                // Validate target exists
                const targetPlayer = gameState.players[targetId]; // Use reference
                if (targetPlayer) {

                    // Apply damage only if player is alive
                    if (!targetPlayer.isDead) {
                        targetPlayer.health = Math.max(0, targetPlayer.health - amount);
                        console.log(`Player ${targetId} took ${amount} damage, health: ${targetPlayer.health}`);

                        // Check if player died
                        if (targetPlayer.health <= 0) {
                            targetPlayer.isDead = true;
                            targetPlayer.health = 0;
                            console.log(`Player ${targetId} died from damage by ${playerId}`);

                            // Broadcast death event
                            broadcastToAll({
                                type: 'PLAYER_DEATH',
                                data: {
                                    playerId: targetId,
                                    killerId: playerId
                                }
                            });

                            // Schedule respawn after delay
                            setTimeout(() => {
                                if (gameState.players[targetId]) {
                                    gameState.players[targetId].health = 100;
                                    gameState.players[targetId].isDead = false;
                                    gameState.players[targetId].position = {
                                        x: Math.random() * 20 - 10, // Random position within ±10
                                        y: 5, // Above ground
                                        z: Math.random() * 20 - 10
                                    };

                                    // Broadcast respawn event
                                    broadcastToAll({
                                        type: 'PLAYER_RESPAWN',
                                        data: {
                                            playerId: targetId,
                                            position: gameState.players[targetId].position
                                        }
                                    });

                                    console.log(`Player ${targetId} respawned`);
                                }
                            }, 3000); // 3 second respawn time
                        }

                        // Broadcast damage event to all players
                        broadcastToAll({
                            type: 'PLAYER_DAMAGE',
                            data: {
                                targetId,
                                amount,
                                attackerId: playerId
                            }
                        });
                    }
                }
            }
            break;

        case 'PLAYER_DEATH':
            // Player reported their own death
            if (!player.isDead) {
                player.isDead = true;
                player.health = 0;

                console.log(`Player ${playerId} reported death`);

                // Broadcast death event
                broadcastToAll({
                    type: 'PLAYER_DEATH',
                    data: {
                        playerId: playerId
                    }
                });

                // Schedule respawn
                setTimeout(() => {
                    if (player) { // Check player still exists
                        player.health = 100;
                        player.isDead = false;
                        player.position = {
                            x: Math.random() * 20 - 10,
                            y: 5,
                            z: Math.random() * 20 - 10
                        };

                        console.log(`Player ${playerId} respawned`);

                        // Broadcast respawn event
                        broadcastToAll({
                            type: 'PLAYER_RESPAWN',
                            data: {
                                playerId: playerId,
                                position: player.position
                            }
                        });
                    }
                }, 3000); // 3 second respawn time
            }
            break;

        case 'PLAYER_RESPAWN':
            // Player is requesting a respawn
            if (player.isDead) {
                const respawnPos = data.position || {
                    x: Math.random() * 20 - 10,
                    y: 5,
                    z: Math.random() * 20 - 10
                };

                player.health = 100;
                player.isDead = false;
                player.position = respawnPos;

                console.log(`Player ${playerId} manually respawned`);

                // Broadcast respawn event
                broadcastToAll({
                    type: 'PLAYER_RESPAWN',
                    data: {
                        playerId: playerId,
                        position: respawnPos
                    }
                });
            }
            break;

        case 'PING':
            // Handle ping from client (keep-alive)
            ws.send(JSON.stringify({
                type: 'PONG',
                timestamp: data.timestamp, // Echo back client timestamp for RTT calc
                serverTime: Date.now()
            }));
            break;

        default:
            console.log(`Unknown message type: ${data.type}`);
    }
}

// Broadcast game state to all connected clients
function broadcastGameState() {
    // *** Wrap entire function logic in try...catch ***
    try {
        let payloadObject = {};
        let sendFullState = false;

        // Periodically send full state as a fallback/keyframe
        gameState.broadcastCounter++;
        if (!gameState.lastBroadcastState || gameState.broadcastCounter >= 100) { // Send full state every 100 ticks (5 seconds)
            sendFullState = true;
            gameState.broadcastCounter = 0;
            // Minimal logging inside loop
            // console.log('[Broadcast] Sending full state update.');
        }

        // --- Prepare Current Sanitized State (Needed for both full and delta) ---
        const currentPlayersState = {};
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            if (player && player.connected) { // Only consider connected players
                // Basic validation/sanitization
                currentPlayersState[playerId] = {
                    id: playerId,
                    position: player.position || { x: 0, y: 5, z: 0 },
                    rotation: player.rotation || { x: 0, y: 0, z: 0 },
                    health: typeof player.health === 'number' ? player.health : 100,
                    isDead: Boolean(player.isDead),
                    isAttacking: Boolean(player.isAttacking),
                    isJumping: Boolean(player.isJumping), // *** Include isJumping flag ***
                    animation: player.animation || 'idle',
                    lastProcessedInput: player.lastProcessedInput || 0
                };
            }
        }
        // TODO: Add projectile state processing here later

        if (sendFullState) {
            payloadObject = {
                type: 'GAME_STATE',
                data: {
                    players: currentPlayersState,
                    // projectiles: currentProjectilesState, // Add later
                    enemies: gameState.enemies, // Send enemies always for now
                    timestamp: Date.now()
                }
            };
        } else {
            // --- Calculate Delta --- 
            const playerDeltas = {};
            const removedPlayerIds = [];

            // Check for changed/new players
            for (const playerId in currentPlayersState) {
                const currentPlayer = currentPlayersState[playerId];
                const lastPlayer = gameState.lastBroadcastState?.players?.[playerId];

                if (!lastPlayer) {
                    // New player: send full data
                    playerDeltas[playerId] = currentPlayer;
                } else {
                    // Existing player: check for changes
                    const delta = {};
                    let changed = false;
                    for (const key in currentPlayer) {
                        // Check if key exists in lastPlayer to avoid errors if state structure changes
                        if (!lastPlayer.hasOwnProperty(key) || !deepCompare(currentPlayer[key], lastPlayer[key])) {
                            delta[key] = currentPlayer[key];
                            changed = true;
                        }
                    }
                    if (changed) {
                        // Important: Always include ID in delta for identification
                        delta.id = playerId;
                        playerDeltas[playerId] = delta;
                    }
                }
            }

            // Check for removed players
            for (const playerId in gameState.lastBroadcastState?.players) {
                if (!currentPlayersState[playerId]) {
                    removedPlayerIds.push(playerId);
                }
            }

            // Only send delta if there are actual changes
            if (Object.keys(playerDeltas).length > 0 || removedPlayerIds.length > 0 /* || projectile changes later */) {
                payloadObject = {
                    type: 'GAME_STATE_DELTA',
                    data: {
                        playerDeltas: playerDeltas,
                        removedPlayerIds: removedPlayerIds,
                        // projectileDeltas... // Add later
                        timestamp: Date.now()
                    }
                };
            } else {
                // No changes, don't send anything this tick
                // Update lastBroadcastState anyway to reflect no changes needed sending
                gameState.lastBroadcastState = {
                    players: JSON.parse(JSON.stringify(currentPlayersState))
                    // projectiles: JSON.parse(JSON.stringify(currentProjectilesState)) // Add later
                };
                return; // Exit early
            }
        }

        // --- Send Payload --- 
        // Ensure payload has a type before attempting to stringify/send
        if (!payloadObject.type) {
            // console.log('[Broadcast] No payload type determined, skipping send.');
            return;
        }

        const payload = JSON.stringify(payloadObject);
        let activeConnections = 0;

        for (const playerId in gameState.connections) {
            const ws = gameState.connections[playerId];
            // WebSocket.OPEN is 1
            if (ws && ws.readyState === 1) {
                try {
                    ws.send(payload);
                    activeConnections++;
                } catch (sendError) {
                    console.error(`[Broadcast] Error sending to player ${playerId}:`, sendError);
                    // Remove the connection if we can't send to it
                    try {
                        ws.close(1011, "Error during broadcast");
                    } catch (closeError) {
                        // Ignore close errors
                    }
                    // Safely delete references
                    if (gameState.connections[playerId]) delete gameState.connections[playerId];
                    if (gameState.players[playerId]) delete gameState.players[playerId];
                }
            } else if (ws) {
                // Clean up non-open connections proactively
                console.log(`[Broadcast] Socket for player ${playerId} not open (readyState: ${ws.readyState}), removing`);
                try { ws.close(1001, "Socket not open"); } catch (closeErr) { }
                if (gameState.connections[playerId]) delete gameState.connections[playerId];
                if (gameState.players[playerId]) delete gameState.players[playerId];
            } else {
                // Clean up null/undefined connection entries
                console.warn(`[Broadcast] Found null/undefined connection for Player ID: ${playerId}. Cleaning up.`);
                if (gameState.connections[playerId]) delete gameState.connections[playerId];
                if (gameState.players[playerId]) delete gameState.players[playerId];
            }
        }

        // Log active connections count - Reduce frequency
        if (gameState.broadcastCounter % 50 === 0) { // Log every 50 broadcasts (~2.5 seconds)
            console.log(`[Broadcast] Sent ${payloadObject.type} to ${activeConnections} active connections (Counter: ${gameState.broadcastCounter})`);
        }

        // --- Update lastBroadcastState AFTER sending --- 
        if (payloadObject.type) { // Only update if we actually sent something
            gameState.lastBroadcastState = {
                players: JSON.parse(JSON.stringify(currentPlayersState))
                // projectiles: JSON.parse(JSON.stringify(currentProjectilesState)) // Add later
            };
        }
    } catch (err) {
        // *** Log any error during broadcast ***
        console.error('[!!!] Critical Error in broadcastGameState:', err);
    }
}

// Helper function to broadcast message to all connected clients
function broadcastToAll(message) {
    const payload = JSON.stringify(message);

    for (const playerId in gameState.connections) {
        const ws = gameState.connections[playerId];
        if (ws && ws.readyState === 1) {
            try {
                ws.send(payload);
            } catch (error) {
                console.error(`Error broadcasting to player ${playerId}:`, error);
            }
        }
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
    const timeout = 300000; // Increased from 30000 (30 seconds) to 300000 (5 minutes)

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
    let serverPingCounter = 0; // Counter for server pings

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

            // Send server pings periodically
            serverPingCounter++;
            if (serverPingCounter >= 400) { // Send approx every 20 seconds (400 ticks * 50ms/tick)
                sendServerPings();
                serverPingCounter = 0;
            }

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

        // Apply ground constraint to all players - prevent them from falling through
        // or getting stuck in the air
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];

            // Skip dead players
            if (player.isDead) continue;

            // If player is below ground, reset to ground level
            if (player.position.y < 0) {
                player.position.y = 0;
            }

            // If player has been in the air without updating for too long (3 seconds),
            // force them back to ground
            if (!player.lastYUpdateTime) {
                player.lastYUpdateTime = currentTime;
                player.lastY = player.position.y;
            }
            else if (player.position.y > 0.5 &&
                Math.abs(player.position.y - player.lastY) < 0.01 &&
                currentTime - player.lastYUpdateTime > 3000) {
                // Player has been stuck in the air - force back to ground
                console.log(`Player ${playerId} appeared stuck at y=${player.position.y.toFixed(2)} - resetting to ground`);
                player.position.y = 0;
                player.lastYUpdateTime = currentTime;
            }

            // Track Y position changes
            if (Math.abs(player.position.y - player.lastY) > 0.01) {
                player.lastY = player.position.y;
                player.lastYUpdateTime = currentTime;
            }
        }

        // Update projectiles
        updateProjectiles(deltaTime);

        // Check for projectile collisions with players
        checkProjectilePlayerCollisions();

        // Update enemies - basic implementation
        updateEnemies(deltaTime);
    } catch (err) {
        console.error('Error in updateGameState:', err);
    }
}

// Update projectile positions
function updateProjectiles(deltaTime) {
    const MAX_PROJECTILE_LIFETIME = 5000; // 5 seconds max lifetime

    // Update each projectile position based on velocity and speed
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.projectiles[i];

        // Check if projectile is too old
        const age = Date.now() - projectile.createdAt;
        if (age > MAX_PROJECTILE_LIFETIME) {
            // Remove old projectiles
            gameState.projectiles.splice(i, 1);
            continue;
        }

        // Skip inactive projectiles
        if (!projectile.active) {
            gameState.projectiles.splice(i, 1);
            continue;
        }

        // Update position based on velocity
        if (projectile.velocity) {
            projectile.position.x += projectile.velocity.x * deltaTime;
            projectile.position.y += projectile.velocity.y * deltaTime;
            projectile.position.z += projectile.velocity.z * deltaTime;
        } else {
            // If no velocity, remove the projectile
            console.log('Removing projectile without velocity');
            gameState.projectiles.splice(i, 1);
        }
    }
}

// Check for projectile collisions with players
function checkProjectilePlayerCollisions() {
    // Process each active projectile
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.projectiles[i];

        // Skip if already inactive
        if (!projectile.active) continue;

        // Check against each player
        for (const playerId in gameState.players) {
            // Skip if this is the projectile owner
            if (playerId === projectile.ownerId) continue;

            const player = gameState.players[playerId];

            // Skip dead players
            if (player.isDead) continue;

            // Calculate distance between projectile and player
            const dx = projectile.position.x - player.position.x;
            const dy = projectile.position.y - player.position.y;
            const dz = projectile.position.z - player.position.z;

            const distanceSquared = dx * dx + dy * dy + dz * dz;

            // Hit if distance is less than 2 units
            if (distanceSquared < 4) {
                // Mark projectile as inactive
                projectile.active = false;

                // Apply damage to the hit player
                const damage = projectile.damage || 10;

                // If player was alive, apply damage
                if (player.health > 0) {
                    player.health = Math.max(0, player.health - damage);

                    console.log(`Projectile hit: Player ${playerId} hit for ${damage} damage, health now ${player.health}`);

                    // Broadcast damage event
                    broadcastToAll({
                        type: 'PLAYER_DAMAGE',
                        data: {
                            targetId: playerId,
                            amount: damage,
                            attackerId: projectile.ownerId
                        }
                    });

                    // Check if player died
                    if (player.health <= 0) {
                        player.isDead = true;

                        console.log(`Player ${playerId} died from projectile by ${projectile.ownerId}`);

                        // Broadcast death event
                        broadcastToAll({
                            type: 'PLAYER_DEATH',
                            data: {
                                playerId: playerId,
                                killerId: projectile.ownerId
                            }
                        });

                        // Schedule respawn
                        setTimeout(() => {
                            if (gameState.players[playerId]) {
                                gameState.players[playerId].health = 100;
                                gameState.players[playerId].isDead = false;
                                gameState.players[playerId].position = {
                                    x: Math.random() * 20 - 10,
                                    y: 5,
                                    z: Math.random() * 20 - 10
                                };

                                console.log(`Player ${playerId} respawned`);

                                // Broadcast respawn event
                                broadcastToAll({
                                    type: 'PLAYER_RESPAWN',
                                    data: {
                                        playerId: playerId,
                                        position: gameState.players[playerId].position
                                    }
                                });
                            }
                        }, 3000); // 3 second respawn time
                    }
                }

                // Break to next projectile - this one has been consumed
                break;
            }
        }
    }
}

// Basic enemy update function
function updateEnemies(deltaTime) {
    // Enemies disabled for multiplayer-only mode
    return;

    // Previous enemy code commented out
    /*
    // Only update enemies if we have at least one player
    const playerCount = Object.keys(gameState.players).filter(id =>
        gameState.players[id].connected && !gameState.players[id].isDead
    ).length;

    if (playerCount === 0) return;

    // Adjust enemy count based on player count (1-2 enemies per player)
    const desiredEnemyCount = Math.min(10, Math.ceil(playerCount * 1.5));

    // Check if we need to spawn more enemies
    if (gameState.enemies.length < desiredEnemyCount) {
        spawnEnemy();
    }

    // Update each enemy
    for (let i = 0; i < gameState.enemies.length; i++) {
        const enemy = gameState.enemies[i];

        // Skip dead enemies
        if (enemy.isDead) continue;

        // Find closest player to chase
        let closestPlayer = null;
        let closestDistance = Infinity;

        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];

            // Skip dead or disconnected players
            if (player.isDead || !player.connected) continue;

            // Calculate distance
            const dx = enemy.position.x - player.position.x;
            const dz = enemy.position.z - player.position.z;
            const distanceSquared = dx * dx + dz * dz;

            if (distanceSquared < closestDistance) {
                closestDistance = distanceSquared;
                closestPlayer = player;
            }
        }

        // If we found a player to chase
        if (closestPlayer) {
            // Calculate direction to player
            const dx = closestPlayer.position.x - enemy.position.x;
            const dz = closestPlayer.position.z - enemy.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            // Only move if outside attack range
            if (distance > 2) {
                // Normalize direction
                const dirX = dx / distance;
                const dirZ = dz / distance;

                // Move toward player (slower movement speed)
                const moveSpeed = 0.1;
                enemy.position.x += dirX * moveSpeed;
                enemy.position.z += dirZ * moveSpeed;

                // Update rotation to face player
                enemy.rotation.y = Math.atan2(dirX, dirZ);
            }

            // If close enough, attack
            else if (Math.random() < 0.02) { // 2% chance per update to attack
                enemy.isAttacking = true;

                // Reset attack state after animation duration
                setTimeout(() => {
                    if (enemy) {
                        enemy.isAttacking = false;
                    }
                }, 800);

                // Deal damage to player
                if (closestPlayer.health > 0 && !closestPlayer.isDead) {
                    const damage = 10;
                    closestPlayer.health = Math.max(0, closestPlayer.health - damage);

                    console.log(`Enemy ${enemy.id} attacked player ${closestPlayer.id} for ${damage} damage`);

                    // Broadcast damage event
                    broadcastToAll({
                        type: 'PLAYER_DAMAGE',
                        data: {
                            targetId: closestPlayer.id,
                            amount: damage,
                            attackerId: null // null means enemy attack
                        }
                    });

                    // Check if player died
                    if (closestPlayer.health <= 0) {
                        closestPlayer.isDead = true;

                        console.log(`Player ${closestPlayer.id} died from enemy attack`);

                        // Broadcast death event
                        broadcastToAll({
                            type: 'PLAYER_DEATH',
                            data: {
                                playerId: closestPlayer.id
                            }
                        });

                        // Schedule respawn
                        setTimeout(() => {
                            if (gameState.players[closestPlayer.id]) {
                                gameState.players[closestPlayer.id].health = 100;
                                gameState.players[closestPlayer.id].isDead = false;
                                gameState.players[closestPlayer.id].position = {
                                    x: Math.random() * 20 - 10,
                                    y: 5,
                                    z: Math.random() * 20 - 10
                                };

                                console.log(`Player ${closestPlayer.id} respawned after enemy kill`);

                                // Broadcast respawn event
                                broadcastToAll({
                                    type: 'PLAYER_RESPAWN',
                                    data: {
                                        playerId: closestPlayer.id,
                                        position: gameState.players[closestPlayer.id].position
                                    }
                                });
                            }
                        }, 3000); // 3 second respawn time
                    }
                }
            }
        }
    }
    */
}

// Spawn a new enemy
function spawnEnemy() {
    // Enemies disabled for multiplayer-only mode
    return null;

    /*
    const enemyId = `enemy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Spawn away from players
    let spawnX = Math.random() * 40 - 20;
    let spawnZ = Math.random() * 40 - 20;

    const enemy = {
        id: enemyId,
        type: 'enemy',
        position: {
            x: spawnX,
            y: 0, // Ground level
            z: spawnZ
        },
        rotation: { x: 0, y: 0, z: 0 },
        health: 50,
        isDead: false,
        isAttacking: false,
        model: 'default',
        color: Math.floor(Math.random() * 0xFFFFFF)
    };

    gameState.enemies.push(enemy);
    console.log(`Spawned enemy ${enemyId} at x=${spawnX.toFixed(2)}, z=${spawnZ.toFixed(2)}`);

    return enemy;
    */
}

// Start the game loop
startGameLoop();

console.log(`Server running at http://localhost:${server.port} with WebSocket support`);

// --- Helper function for simple deep comparison --- 
function deepCompare(obj1, obj2) {
    // Basic comparison for this use case (position, rotation, primitive values)
    // Not a fully robust deep comparison, but sufficient here.
    return JSON.stringify(obj1) === JSON.stringify(obj2);
}

// --- New Function to Send Server Pings ---
function sendServerPings() {
    const pingMessage = JSON.stringify({ type: 'SERVER_PING' });
    let pingCount = 0;
    try {
        for (const playerId in gameState.connections) {
            const ws = gameState.connections[playerId];
            if (ws && ws.readyState === 1) { // WebSocket.OPEN
                try {
                    ws.send(pingMessage);
                    pingCount++;
                } catch (pingErr) {
                    console.error(`Error sending server ping to player ${playerId}:`, pingErr);
                    // Close potentially broken connection
                    try { ws.close(1011, "Server ping failed"); } catch (closeErr) { }
                    // Clean up immediately
                    if (gameState.connections[playerId]) delete gameState.connections[playerId];
                    if (gameState.players[playerId]) delete gameState.players[playerId];
                }
            }
        }
        if (pingCount > 0) {
            console.log(`[ServerPing] Sent ping to ${pingCount} clients.`);
        }
    } catch (err) {
        console.error('[!!!] Critical Error in sendServerPings loop:', err);
    }
}
// --- End New Function --- 