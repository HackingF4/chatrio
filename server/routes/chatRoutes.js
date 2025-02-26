const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// Todas as rotas de chat requerem autenticação
router.use(auth);

// Rotas de mensagens
router.post('/messages', chatController.sendMessage);
router.get('/messages', chatController.getMessages);
router.delete('/messages/:messageId', chatController.deleteMessage);

// Rota para limpar mensagens (apenas admin)
router.post('/clear', auth, chatController.clearMessages);

module.exports = router; 