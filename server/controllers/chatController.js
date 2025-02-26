const Message = require('../models/message');
const User = require('../models/user');

exports.sendMessage = async (req, res) => {
  try {
    const { content, room } = req.body;
    const userId = req.user.userId;

    // Verificar se usuário está mutado
    const user = await User.findById(userId);
    if (user.isMuted) {
      return res.status(403).json({ message: 'Você está mutado e não pode enviar mensagens' });
    }

    const message = new Message({
      sender: userId,
      content,
      room,
      type: 'text'
    });

    await message.save();

    // Populate sender info para retornar
    await message.populate('sender', 'username profileImage');

    const messageToSend = {
      _id: message._id,
      content: message.content,
      sender: {
        username: message.sender.username,
        profileImage: message.sender.profileImage
      },
      room: message.room,
      createdAt: message.createdAt
    };

    // Emitir mensagem via Socket.io
    const io = req.app.get('io');
    io.to(room).emit('new message', messageToSend);

    res.status(201).json(messageToSend);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ message: 'Erro ao enviar mensagem', error: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { room } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await Message.find({ room })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username profileImage')
      .lean()
      .exec();

    const formattedMessages = messages.map(message => ({
      _id: message._id,
      content: message.content,
      sender: {
        username: message.sender.username,
        profileImage: message.sender.profileImage
      },
      room: message.room,
      createdAt: message.createdAt
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ message: 'Erro ao buscar mensagens', error: error.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Mensagem não encontrada' });
    }

    // Verificar se o usuário é o dono da mensagem ou moderador/admin
    if (message.sender.toString() !== userId && !['moderator', 'admin'].includes(userRole)) {
      return res.status(403).json({ message: 'Não autorizado' });
    }

    await message.deleteOne();
    
    // Notificar outros usuários via Socket.io
    const io = req.app.get('io');
    io.to(message.room).emit('message deleted', messageId);

    res.json({ message: 'Mensagem deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
    res.status(500).json({ message: 'Erro ao deletar mensagem', error: error.message });
  }
};

exports.clearMessages = async (req, res) => {
  try {
    const { room } = req.body;
    const userRole = req.user.role;

    // Verificar se é admin
    if (userRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administradores podem limpar o chat' });
    }

    // Deletar todas as mensagens da sala
    await Message.deleteMany({ room });
    
    // Notificar usuários via Socket.io
    const io = req.app.get('io');
    io.to(room).emit('chat cleared', { room });

    res.json({ message: 'Chat limpo com sucesso' });
  } catch (error) {
    console.error('Erro ao limpar chat:', error);
    res.status(500).json({ message: 'Erro ao limpar chat', error: error.message });
  }
}; 