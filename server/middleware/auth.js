const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret';

module.exports = async (req, res, next) => {
  try {
    // Verificar se o token está presente no header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Token não fornecido' });
    }

    // Verificar se o token é válido
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verificar se o usuário ainda existe
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    // Verificar se o usuário está banido
    if (user.isBanned) {
      return res.status(403).json({ message: 'Sua conta foi banida' });
    }

    // Adicionar informações do usuário ao objeto request
    req.user = {
      userId: user._id,
      role: user.role,
      isMuted: user.isMuted
    };

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
}; 