const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';

    if (req.url === '/download/agent.exe') {
        const file = path.join(__dirname, 'agent.exe');
        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(500);
                return res.end("Failed to download file");
            }
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="agent.exe"'
            });
            res.end(data);
        });
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/html' });
            res.end(err.code === 'ENOENT' ? '<h1>404 Not Found</h1>' : 'Server Error');
        } else {
            res.writeHead(200, { 'Content-Type': mime });
            res.end(content);
        }
    });
});

const wss = new WebSocket.Server({ server });
const rooms = {};

function broadcast(room, msg, exclude) {
    rooms[room]?.forEach(c => {
        if (c.id !== exclude && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify(msg));
        }
    });
}

function updateUserList(room) {
    const users = rooms[room]?.map(c => ({ id: c.id, name: c.name })) || [];
    broadcast(room, { type: 'user-list-update', users });
}

wss.on('connection', ws => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    let roomId;

    ws.on('message', msg => {
        const data = JSON.parse(msg);

        switch (data.type) {
            case 'join':
                roomId = data.roomId;
                rooms[roomId] ||= [];
                ws.send(JSON.stringify({
                    type: 'welcome',
                    id,
                    users: rooms[roomId].map(u => ({ id: u.id, name: u.name }))
                }));
                rooms[roomId].push({ id, name: data.name, ws });
                broadcast(roomId, { type: 'user-joined', newUser: { id, name: data.name } }, id);
                updateUserList(roomId);
                break;

            case 'offer':
            case 'answer':
            case 'candidate':
            case 'request-control':
            case 'grant-control':
            case 'deny-control':
            case 'revoke-control':
            case 'control-event':
            case 'request-screen-share':
            case 'deny-screen-share':
            case 'stream-started':
            case 'stream-ended':
                const target = rooms[roomId]?.find(c => c.id === data.to);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    data.from = id;
                    target.ws.send(JSON.stringify(data));
                }
                if (['stream-started', 'stream-ended'].includes(data.type)) updateUserList(roomId);
                break;
        }
    });

    ws.on('close', () => {
        if (roomId && rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter(c => c.id !== id);
            broadcast(roomId, { type: 'user-left', id });
            updateUserList(roomId);
            if (!rooms[roomId].length) delete rooms[roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
