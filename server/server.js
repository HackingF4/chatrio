// Reiniciando o servidor - Forçando novo deploy
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuração do CORS para produção
const allowedOrigins = [
  'https://chatrioo.netlify.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Permitir requisições sem origin (como apps mobile)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); // Temporariamente permitindo todas as origens
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Middleware adicional para garantir headers CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*'); // Temporariamente permitindo todas as origens
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Configuração do Socket.IO com CORS
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  },
  transports: ['websocket'],
  pingTimeout: 30000,
  pingInterval: 10000
});

// Middleware para parsing JSON e URL encoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Configurar io como uma propriedade do app
app.set('io', io);

// Socket.io
const connectedUsers = new Map();
const messageCache = new Map(); // Cache para evitar duplicação
const MESSAGE_CACHE_SIZE = 1000;

// Função para limpar mensagens antigas do cache
const cleanMessageCache = () => {
  if (messageCache.size > MESSAGE_CACHE_SIZE) {
    const entries = Array.from(messageCache.entries());
    const oldestEntries = entries.slice(0, entries.length - MESSAGE_CACHE_SIZE);
    oldestEntries.forEach(([key]) => messageCache.delete(key));
  }
};

io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);
  
  // Quando um usuário se conecta
  socket.on('user connected', (userData) => {
    if (!userData || !userData.username) return;
    
    console.log('Dados do usuário conectado:', userData);
    
    connectedUsers.set(socket.id, {
      ...userData,
      socketId: socket.id,
      _id: userData.id || userData._id,
      isMuted: userData.isMuted || false,
      role: userData.role || 'user'
    });
    
    socket.join('Bate-papo 1');
    
    const usersList = Array.from(connectedUsers.values()).map(user => ({
      _id: user._id,
      username: user.username,
      profileImage: user.profileImage,
      isMuted: user.isMuted,
      role: user.role
    }));
    
    io.emit('users online', usersList);
  });

  // Quando um usuário entra em uma sala
  socket.on('join room', (room) => {
    if (!room) return;
    
    console.log(`Usuário ${socket.id} entrando na sala: ${room}`);
    socket.leaveAll();
    socket.join(room);
  });

  // Quando uma mensagem é enviada
  socket.on('chat message', (messageData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'Usuário não encontrado' });
      return;
    }

    if (user.isMuted) {
      socket.emit('error', { message: 'Você está mutado e não pode enviar mensagens.' });
      return;
    }

    if (!messageData || !messageData.room || !messageData.message || !messageData.message.content) {
      socket.emit('error', { message: 'Dados da mensagem inválidos' });
      return;
    }

    const { room, message } = messageData;
    
    // Criar ID único para a mensagem
    const messageId = `${user._id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Verificar se a mensagem já está no cache
    if (messageCache.has(messageId)) {
      return;
    }

    // Criar objeto da mensagem
    const newMessage = {
      _id: messageId,
      content: message.content.trim(),
      sender: {
        username: user.username,
        profileImage: user.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'
      },
      createdAt: new Date(),
      room: room
    };

    // Adicionar ao cache com timestamp
    messageCache.set(messageId, {
      message: newMessage,
      timestamp: Date.now()
    });
    
    // Limpar cache se necessário
    cleanMessageCache();
    
    // Emitir apenas para a sala específica
    io.to(room).emit('new message', newMessage);
  });

  // Quando um usuário é mutado
  socket.on('user muted', (data) => {
    const user = Array.from(connectedUsers.values()).find(u => u._id === data.userId);
    if (user) {
      user.isMuted = true;
      io.emit('users online', Array.from(connectedUsers.values()));
    }
  });

  // Quando um usuário é desmutado
  socket.on('user unmuted', (data) => {
    const user = Array.from(connectedUsers.values()).find(u => u._id === data.userId);
    if (user) {
      user.isMuted = false;
      io.emit('users online', Array.from(connectedUsers.values()));
    }
  });

  // Quando um usuário solicita a lista de usuários
  socket.on('get users', () => {
    const usersList = Array.from(connectedUsers.values()).map(user => ({
      _id: user._id,
      username: user.username,
      profileImage: user.profileImage,
      isMuted: user.isMuted,
      role: user.role
    }));
    
    io.emit('users online', usersList);
  });

  // Quando um usuário se desconecta
  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
    connectedUsers.delete(socket.id);
    
    const usersList = Array.from(connectedUsers.values()).map(user => ({
      _id: user._id,
      username: user.username,
      profileImage: user.profileImage,
      isMuted: user.isMuted,
      role: user.role
    }));
    
    io.emit('users online', usersList);
  });
});

// Conexão com MongoDB
mongoose.set('strictQuery', false);

// URI fixa para produção
const MONGODB_URI = 'mongodb+srv://jisogomes333:khAvapesqxhWDxxt@cluster0.olcsf.mongodb.net/chat-app?retryWrites=true&w=majority';

// Log para debug
console.log('Conectando ao MongoDB...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('Conectado ao MongoDB com sucesso');
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
})
.catch(err => {
  console.error('Erro ao conectar ao MongoDB:', err);
  process.exit(1);
});

// Rotas
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes); 