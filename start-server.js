// A simple script to start the game server with improved output

// Define ASCII art for server banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ██╗      ██████╗ ██████╗     ██╗    ██╗ █████╗  ║
║   ██╔══██╗██║     ██╔═══██╗██╔══██╗    ██║    ██║██╔══██╗ ║
║   ██████╔╝██║     ██║   ██║██████╔╝    ██║ █╗ ██║███████║ ║
║   ██╔══██╗██║     ██║   ██║██╔══██╗    ██║███╗██║██╔══██║ ║
║   ██████╔╝███████╗╚██████╔╝██████╔╝    ╚███╔███╔╝██║  ██║ ║
║   ╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝      ╚══╝╚══╝ ╚═╝  ╚═╝ ║
║                                                           ║
║               == MULTIPLAYER SERVER ==                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

// Print server information
console.log(banner);
console.log('Starting Blob Wars Multiplayer Server...');
console.log('Press Ctrl+C to stop the server');
console.log('');

// Start the server process
const server = Bun.spawn(['bun', 'run', 'server.js'], {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: { ...process.env }
});

// Handle process exit
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.kill();
    setTimeout(() => {
        console.log('Server stopped.');
        process.exit(0);
    }, 500);
});

// Log server start
console.log('Server process started with PID:', server.pid); 