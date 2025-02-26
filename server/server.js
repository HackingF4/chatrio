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
  'http://localhost:3000',
  'https://chatrio.netlify.app',
  'https://chatrioo.netlify.app',
  process.env.FRONTEND_URL // Permite URL dinâmica do frontend
].filter(Boolean); // Remove valores undefined/null

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configurar io como uma propriedade do app
app.set('io', io);

// Socket.io
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('Novo usuário conectado:', socket.id);
  
  // Quando um usuário se conecta
  socket.on('user connected', (userData) => {
    console.log('Dados do usuário conectado:', userData);
    
    connectedUsers.set(socket.id, {
      ...userData,
      socketId: socket.id,
      _id: userData.id || userData._id,
      isMuted: userData.isMuted || false,
      role: userData.role || 'user'
    });
    
    socket.join('geral');
    
    // Emite lista atualizada de usuários
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
    socket.leaveAll();
    socket.join(room);
    console.log(`Usuário ${socket.id} entrou na sala: ${room}`);
  });

  // Quando uma mensagem é enviada
  socket.on('chat message', (messageData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    // Verificar se o usuário está mutado
    if (user.isMuted) {
      socket.emit('error', { message: 'Você está mutado e não pode enviar mensagens.' });
      return;
    }

    const { room, message } = messageData;
    io.to(room).emit('new message', message);
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

// Log para debug
console.log('Tentando conectar ao MongoDB com URI:', process.env.MONGODB_URI);

// URI de fallback para desenvolvimento
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://jisogomes333:khAvapesqxhWDxxt@cluster0.olcsf.mongodb.net/chat-app?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('Conectado ao MongoDB');
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