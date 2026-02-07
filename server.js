const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const HOST = '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// SSE Clients: { pathId: [res1, res2, ...] }
const clients = {};

function addClient(pathId, res) {
    if (!clients[pathId]) clients[pathId] = [];
    clients[pathId].push(res);
    return clients[pathId].length;
}

function removeClient(pathId, res) {
    if (!clients[pathId]) return;
    clients[pathId] = clients[pathId].filter(c => c !== res);
    if (clients[pathId].length === 0) delete clients[pathId];
}

function broadcast(pathId, data, excludeRes) {
    if (!clients[pathId]) return;
    clients[pathId].forEach(client => {
        if (client !== excludeRes) {
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    });
}

const requestHandler = (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // API Handling
    if (pathname.startsWith('/api/panchuko/')) {
        let id = pathname.replace('/api/panchuko/', '');
        let isEvents = false;
        let isNotify = false;

        if (id.endsWith('/events')) {
            isEvents = true;
            id = id.replace('/events', '');
        } else if (id.endsWith('/notify')) {
            isNotify = true;
            id = id.replace('/notify', '');
        }

        if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid path ID' }));
            return;
        }

        // SSE Endpoint
        if (isEvents) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            });

            const updatedClients = addClient(id, res);

            // Send initial connection success
            res.write(`data: ${JSON.stringify({ type: 'connected', clients: updatedClients })}\n\n`);

            req.on('close', () => {
                removeClient(id, res);
            });
            return;
        }

        // Notify Endpoint
        if (isNotify) {
            if (req.method === 'POST') {
                broadcast(id, { type: 'notification', message: 'Update available' }, null);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
            }
            return;
        }


        const filePath = path.join(DATA_DIR, id + '.txt');
        const lockPath = path.join(DATA_DIR, id + '.lock');

        if (req.method === 'GET') {
            // Check if locked
            if (fs.existsSync(lockPath)) {
                const lockPass = fs.readFileSync(lockPath, 'utf8'); // Don't trim yet, see what is there
                const reqPassRaw = req.headers['x-password'] || '';
                let reqPass = reqPassRaw;
                try {
                    reqPass = decodeURIComponent(reqPassRaw);
                } catch (e) {
                    // fallback
                }

                console.log(`[AUTH CHECK] File: "${lockPass}" (len:${lockPass.length}) vs Request: "${reqPass}" (len:${reqPass.length})`);

                // Lenient check: exact match OR trimmed match
                const match = (reqPass === lockPass) || (reqPass.trim() === lockPass.trim());

                if (!match) {
                    console.log('-> Auth FAILED');
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Password required', locked: true }));
                    return;
                }
                console.log('-> Auth SUCCESS');
            }

            if (fs.existsSync(filePath)) {
                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to read file' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ content: data, locked: fs.existsSync(lockPath) }));
                    }
                });
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found', content: '', locked: fs.existsSync(lockPath) }));
            }
        } else if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', chunk => {
                bodyStr += chunk.toString();
            });
            req.on('end', () => {
                let body;
                try {
                    body = JSON.parse(bodyStr);
                } catch (e) {
                    // Fallback for backward compatibility
                    body = { content: bodyStr };
                }

                const content = body.content;
                const password = body.password;
                const newPassword = body.newPassword;

                // Check auth
                if (fs.existsSync(lockPath)) {
                    const lockPass = fs.readFileSync(lockPath, 'utf8').trim();
                    if (password !== lockPass) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Password required', locked: true }));
                        return;
                    }
                }

                // Handle Locking/Unlocking
                if (newPassword !== undefined) {
                    if (newPassword && newPassword.trim() !== '') {
                        fs.writeFileSync(lockPath, newPassword.trim());
                    } else {
                        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
                    }
                }

                // Handle Content
                if (content === undefined && newPassword !== undefined) {
                    // Only updating password
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, locked: !!(newPassword && newPassword.trim()) }));
                    return;
                }

                if (!content || content.trim() === '') {
                    // Content is empty, delete the file if it exists
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Failed to delete file' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, deleted: true }));
                            }
                        });
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, deleted: true }));
                    }
                } else {
                    fs.writeFile(filePath, content, (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to save file' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, locked: fs.existsSync(lockPath) }));
                        }
                    });
                }
            });
        } else {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        return;
    }

    // Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    let filePath = path.join(__dirname, safePath);
    let extname = path.extname(filePath).toLowerCase();
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
};

// Start Server (HTTP)
const server = http.createServer(requestHandler);

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Access locally at http://localhost:${PORT}/`);
});
