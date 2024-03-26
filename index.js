const fs = require('fs');
const jsonServer = require('json-server');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const server = jsonServer.create();
const wss = new WebSocket.Server({ server });

server.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

const clients = [];

wss.on('connection', (ws) => {
    console.log('WebSocket connected');

    ws.on('message', (message) => {
        try {
            message = JSON.parse(message);
            console.log(`Received message: ${message}`);
            if (message.method) {
                switch (message.method) {
                    case 'connection':
                        connectionHandler(ws, message);
                        break;
                    case 'addComment':
                        broadcastConnection(ws, message);
                        break;
                    default:
                        console.error('Unknown method:', message.method);
                }
            } else {
                console.error('Method not provided in message:', message);
            }
        } catch (error) {
            console.error('Error parsing JSON:', error);
        }
    });

    ws.on('close', (code, reason) => {
        console.log('WebSocket disconnected');
        console.log(`WebSocket disconnected with code ${code}: ${reason}`);

        const index = clients.indexOf(ws);
        if (index !== -1) {
            clients.splice(index, 1);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const router = jsonServer.router('./db.json');


server.use(jsonServer.defaults({}));
server.use(jsonServer.bodyParser);

server.use('/socket', (req, res, next) => {
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
        wss.emit('connection', ws, req);
    });
});

server.post('/signup', (req, res) => {
    try {
        const { username, password, email } = req.body;
        const db = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'db.json'), 'UTF-8'));
        const { users = [] } = db;

        const existingUser = users.find((user) => user.username === username);
        if (existingUser) {
            return res.status(400).json({ message: 'User with this name already exists' });
        }

        const existingEmail = users.find((user) => user.email === email);
        if (existingEmail) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const maxUserId = users.reduce((maxId, user) => Math.max(maxId, user.id), 0);
        const userId = maxUserId + 1;

        const newUser = { id: userId, username, email, password, status: 'Active', admin: false };
        users.push(newUser);
        fs.writeFileSync(path.resolve(__dirname, 'db.json'), JSON.stringify({ ...db, users }));

        return res.status(201).json(newUser);
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
});

// Эндпоинт для логина
server.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const db = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'db.json'), 'UTF-8'));
        const { users = [] } = db;

        const userFromBd = users.find(
            (user) => user.username === username && user.password === password,
        );

        if (userFromBd) {
            if (userFromBd.status === 'Active') {
                return res.json(userFromBd);
            }
            return res.status(401).json({ message: 'User blocked' });
        }

        return res.status(403).json({ message: 'User not found' });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: e.message });
    }
});

server.use(router);

// запуск сервера
server.listen(8000, () => {
    console.log('server is running on 8000 port');
});

const connectionHandler = (ws, msg) => {
    clients.push(ws);
    ws.id = msg.id;
    broadcastConnection(ws, msg);
};

const broadcastConnection = (ws, msg) => {
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(msg));
            } catch (error) {
                console.error('Error broadcasting message:', error);
            }
        }
    });
};
