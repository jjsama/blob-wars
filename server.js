const server = Bun.serve({
    port: 3000,
    fetch(req) {
        const url = new URL(req.url);
        console.log(`Received request for: ${url.pathname}`);

        // Serve index.html for root path
        if (url.pathname === "/") {
            return new Response(Bun.file("index.html"), {
                headers: { "Content-Type": "text/html" }
            });
        }

        // Handle JavaScript files
        if (url.pathname.endsWith('.js')) {
            const filePath = url.pathname.slice(1); // Remove leading slash
            console.log(`Serving JavaScript file: ${filePath}`);
            return new Response(Bun.file(filePath), {
                headers: { "Content-Type": "application/javascript" }
            });
        }

        // Serve other files from their paths
        try {
            const file = Bun.file(url.pathname.slice(1));
            return new Response(file);
        } catch (e) {
            if (!url.pathname.includes('favicon.ico')) {
                console.error(`Error serving ${url.pathname}:`, e);
            }
            return new Response("Not Found", { status: 404 });
        }
    },
});

console.log(`Listening on http://localhost:${server.port}`); 