const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const agentWsUrl = 'ws://localhost:3001';

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }



     if (req.url === '/download/agent.exe') {
        const filePath = path.join(__dirname, 'agent.exe');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Failed to download file");
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="agent.exe"'
            });
            res.end(data);
        });
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});






const wss = new WebSocket.Server({ server });

const rooms = {};

function broadcast(roomId, message, excludeId) {
    if (rooms[roomId]) {
        rooms[roomId].forEach(client => {
            if (client.id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
}

function broadcastUserListUpdate(roomId) {
    if (rooms[roomId]) {
        const users = rooms[roomId].map(c => ({ id: c.id, name: c.name }));
        broadcast(roomId, { type: 'user-list-update', users });
    }
}

wss.on('connection', ws => {
    const clientId = Date.now().toString() + Math.random().toString(36).substr(2);
    ws.id = clientId;
    let currentRoomId;

    console.log(`Client ${clientId} connected`);

    ws.on('message', message => {
        const data = JSON.parse(message);
        console.log(`Received from ${clientId}:`, data);

        switch (data.type) {
            case 'join':
                currentRoomId = data.roomId;
                if (!rooms[currentRoomId]) {
                    rooms[currentRoomId] = [];
                }

                // Send welcome message to the new client to set their ID and init peer connections
                ws.send(JSON.stringify({
                    type: 'welcome',
                    id: clientId,
                    users: rooms[currentRoomId].map(c => ({ id: c.id, name: c.name })) // send existing users
                }));

                const newUser = { id: clientId, name: data.name, ws: ws };
                rooms[currentRoomId].push(newUser);

                // Notify existing clients that a new user has joined so they can create a peer connection
                broadcast(currentRoomId, {
                    type: 'user-joined',
                    newUser: { id: clientId, name: data.name }
                }, clientId);

                // Broadcast the complete, updated user list to EVERYONE
                broadcastUserListUpdate(currentRoomId);
                break;

            case 'offer':
            case 'answer':
            case 'candidate':
                if (rooms[currentRoomId]) {
                    const targetClient = rooms[currentRoomId].find(c => c.id === data.to);
                    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                        data.from = clientId;
                        targetClient.ws.send(JSON.stringify(data));
                    }
                }
                break;
            
            case 'stream-started':
                broadcast(currentRoomId, { type: 'stream-started', from: clientId }, clientId);
                // Also broadcast the updated user list so "(Sharing)" status appears
                broadcastUserListUpdate(currentRoomId);
                break;
            
            case 'stream-ended':
                 broadcast(currentRoomId, { type: 'stream-ended', from: clientId });
                 // Also broadcast the updated user list so "(Sharing)" status is removed
                 broadcastUserListUpdate(currentRoomId);
                 break;
            
            // Cases for Remote Control and Share Requests
            case 'request-control':
            case 'grant-control':
            case 'deny-control':
            case 'revoke-control':
            case 'control-event':
            case 'request-screen-share':
            case 'deny-screen-share':
                 if (rooms[currentRoomId]) {
                    const targetClient = rooms[currentRoomId].find(c => c.id === data.to);
                    if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                        data.from = clientId; // Add who it's from
                        targetClient.ws.send(JSON.stringify(data));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        if (currentRoomId && rooms[currentRoomId]) {
            rooms[currentRoomId] = rooms[currentRoomId].filter(client => client.id !== clientId);
            if (rooms[currentRoomId].length === 0) {
                delete rooms[currentRoomId];
            } else {
                // Notify remaining users that this client has left to tear down peer connections
                broadcast(currentRoomId, {
                    type: 'user-left',
                    id: clientId,
                });
                // Broadcast the updated user list to everyone
                broadcastUserListUpdate(currentRoomId);
            }
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is listening on http://localhost:${port}`);
});





