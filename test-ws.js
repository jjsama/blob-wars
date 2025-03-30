// Simple WebSocket client test
import WebSocket from 'ws';

console.log('Starting WebSocket test...');

// Create a WebSocket connection
const connectToServer = () => {
    console.log('Connecting to ws://localhost:3000/ws...');
    const ws = new WebSocket('ws://localhost:3000/ws');

    // Connection opened
    ws.on('open', () => {
        console.log('Connection established!');

        // Send a test message
        const message = JSON.stringify({
            type: 'PLAYER_UPDATE',
            position: { x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 },
            rotation: { x: 0, y: 0, z: 0 },
            timestamp: Date.now()
        });

        console.log('Sending message:', message);
        ws.send(message);

        // Setup ping interval
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                console.log('Sending ping...');
                ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
            } else {
                clearInterval(pingInterval);
            }
        }, 5000);
    });

    // Listen for messages
    ws.on('message', (data) => {
        console.log('Received message:', data.toString());
        try {
            const parsedData = JSON.parse(data);
            console.log('Message type:', parsedData.type);

            if (parsedData.type === 'PLAYER_CONNECTED') {
                console.log('Connected as player:', parsedData.data.id);
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    // Connection closed
    ws.on('close', (code, reason) => {
        console.log(`Connection closed (Code: ${code}, Reason: ${reason || 'None provided'})`);

        // Try to reconnect after a delay
        setTimeout(connectToServer, 5000);
    });

    // Connection error
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    return ws;
};

// Start the connection
const ws = connectToServer();

// Handle script termination
process.on('SIGINT', () => {
    console.log('Closing connection and exiting...');
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    process.exit(0);
}); 