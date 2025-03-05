const server = Bun.serve({
    port: 3000,
    fetch(req) {
        const url = new URL(req.url);
        console.log(`Received request for: ${url.pathname}`);

        // Serve index.html for root path
        if (url.pathname === "/") {
            console.log("Serving index.html");
            return new Response(Bun.file("index.html"), {
                headers: {
                    "Content-Type": "text/html",
                    // Add CORS headers if needed
                    "Access-Control-Allow-Origin": "*"
                }
            });
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

console.log(`Server running at http://localhost:${server.port}`); 