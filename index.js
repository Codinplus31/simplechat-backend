require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  },
  pingTimeout: 5000, // Reduce from default 20000
  pingInterval: 10000, // Reduce from default 25000
  upgradeTimeout: 5000, // Reduce from default 10000
  transports: ['websocket'], // Force WebSocket transport
  allowUpgrades: false // Prevent transport upgrades
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO chat_users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
    res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM chat_users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username FROM chat_users WHERE id != $1', [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/messages', authenticateToken, async (req, res) => {
  try {
    const { recipient_id } = req.query;
    let query = 'SELECT * FROM live_messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1) ORDER BY created_at DESC LIMIT 50';
    const result = await pool.query(query, [req.user.id, recipient_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('join', (userId) => {
  //  console.log(`User ${userId} joined`);
    socket.join(userId);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, recipientId, content } = data;
      const result = await pool.query(
        'INSERT INTO live_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *',
        [senderId, recipientId, content]
      );
      const newMessage = result.rows[0];
     // console.log('Message saved:');
      
      // Emit to both sender and recipient
      io.to(senderId).to(recipientId).emit('message', newMessage);
      //console.log('Message emitted to rooms:', senderId, recipientId);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
