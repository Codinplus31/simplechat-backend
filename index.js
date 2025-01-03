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
 /* pingTimeout: 5000, // Reduce from default 20000
  pingInterval: 10000, // Reduce from default 25000
  upgradeTimeout: 5000, // Reduce from default 10000
  transports: ['websocket'], // Force WebSocket transport
  allowUpgrades: false */ 
  // Prevent transport upgrades
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

app.get('/users/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username FROM chat_users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
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


// Track online users, active chats, and typing status
const onlineUsers = new Map();
const activeChats = new Map();
const typingUsers = new Map();
/*
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('user_connected', (userId) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId.toString());
    updateUserStatus(userId);
  });

  socket.on('enter_chat', ({ userId, recipientId }) => {
    const chatId = getChatId(userId, recipientId);
    if (!activeChats.has(chatId)) {
      activeChats.set(chatId, new Set());
    }
    activeChats.get(chatId).add(userId);
    updateChatStatus(userId, recipientId);
  });

  socket.on('leave_chat', ({ userId, recipientId }) => {
    const chatId = getChatId(userId, recipientId);
    if (activeChats.has(chatId)) {
      activeChats.get(chatId).delete(userId);
      if (activeChats.get(chatId).size === 0) {
        activeChats.delete(chatId);
      }
    }
    updateChatStatus(userId, recipientId);
  });

  socket.on('start_typing', ({ userId, recipientId }) => {
    const chatId = getChatId(userId, recipientId);
    if (activeChats.has(chatId) && activeChats.get(chatId).size === 2) {
      typingUsers.set(chatId, userId);
      io.to(recipientId.toString()).emit('typing_status', {
        userId,
        isTyping: true
      });
    }
  });

  socket.on('stop_typing', ({ userId, recipientId }) => {
    const chatId = getChatId(userId, recipientId);
    typingUsers.delete(chatId);
    io.to(recipientId.toString()).emit('typing_status', {
      userId,
      isTyping: false
    });
  });

  socket.on('disconnect', () => {
    let disconnectedUserId = null;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        break;
      }
    }

    if (disconnectedUserId) {
      onlineUsers.delete(disconnectedUserId);
      for (const [chatId, users] of activeChats.entries()) {
        if (users.has(disconnectedUserId)) {
          users.delete(disconnectedUserId);
          if (users.size === 0) {
            activeChats.delete(chatId);
          } else {
            const recipientId = Array.from(users)[0];
            updateChatStatus(disconnectedUserId, recipientId);
          }
        }
      }
      // Clear typing status for disconnected user
      for (const [chatId, typingUserId] of typingUsers.entries()) {
        if (typingUserId === disconnectedUserId) {
          typingUsers.delete(chatId);
          const [user1, user2] = chatId.split('-');
          const recipientId = user1 === disconnectedUserId ? user2 : user1;
          io.to(recipientId).emit('typing_status', {
            userId: disconnectedUserId,
            isTyping: false
          });
        }
      }
    }
  });

  // Existing message handling code...
  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, recipientId, content } = data;
      const result = await pool.query(
        'INSERT INTO live_messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *',
        [senderId, recipientId, content]
      );
      
      const chatId = getChatId(senderId, recipientId);
      typingUsers.delete(chatId);
      io.to(recipientId.toString()).emit('typing_status', {
        userId: senderId,
        isTyping: false
      });

      socket.to(recipientId.toString()).emit('message', result.rows[0]);
      socket.emit('message', result.rows[0]);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}); */
const onlineUsers = new Set();

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('user_connected', (userId) => {
    console.log(`User connected: ${userId}`);
    onlineUsers.add(userId);
    socket.join(userId.toString());
    io.emit('user_status_change', { userId, status: 'online' });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    const userId = Array.from(onlineUsers).find(id => socket.rooms.has(id.toString()));
    if (userId) {
      onlineUsers.delete(userId);
      io.emit('user_status_change', { userId, status: 'offline' });
    }
  });

  socket.on('start_typing', ({ userId, recipientId }) => {
    console.log(`User ${userId} started typing to ${recipientId}`);
    socket.to(recipientId.toString()).emit('typing_status', { userId, isTyping: true });
  });

  socket.on('stop_typing', ({ userId, recipientId }) => {
    console.log(`User ${userId} stopped typing to ${recipientId}`);
    socket.to(recipientId.toString()).emit('typing_status', { userId, isTyping: false });
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, recipientId, content } = data;
      console.log(`Message from ${senderId} to ${recipientId}: ${content}`);
      const result = await pool.query(
        'INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *',
        [senderId, recipientId, content]
      );
      
      io.to(recipientId.toString()).emit('message', result.rows[0]);
      socket.emit('message', result.rows[0]);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
});


function getChatId(userId1, userId2) {
  return [userId1, userId2].sort().join('-');
}

function updateUserStatus(userId) {
  for (const [chatId, users] of activeChats.entries()) {
    if (users.has(userId)) {
      const recipientId = Array.from(users).find(id => id !== userId);
      updateChatStatus(userId, recipientId);
    }
  }
}

function updateChatStatus(userId, recipientId) {
  const chatId = getChatId(userId, recipientId);
  const isActive = activeChats.has(chatId) && activeChats.get(chatId).size === 2;
  io.to(userId.toString()).emit('chat_status', {
    recipientId,
    isActive
  });
  io.to(recipientId.toString()).emit('chat_status', {
    recipientId: userId,
    isActive
  });
}


// ... rest of the server code ...


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
