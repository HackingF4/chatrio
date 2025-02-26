const User = require('../models/user');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;

// Configuração do Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const JWT_SECRET = process.env.JWT_SECRET || 'seu_jwt_secret';

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validação básica
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Por favor, preencha todos os campos' 
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Email inválido' 
      });
    }

    // Verificar se usuário já existe
    const userExists = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (userExists) {
      return res.status(400).json({ 
        message: userExists.email === email.toLowerCase() 
          ? 'Este email já está em uso' 
          : 'Este nome de usuário já está em uso'
      });
    }

    // Criar novo usuário
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      profileImage: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`
    });

    await user.save();

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Usuário registrado com sucesso',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ 
      message: 'Erro ao registrar usuário',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Por favor, preencha todos os campos' 
      });
    }

    // Buscar usuário
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    // Verificar se está banido
    if (user.isBanned) {
      return res.status(403).json({ message: 'Sua conta foi banida' });
    }

    // Verificar senha
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        isMuted: user.isMuted
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      message: 'Erro ao fazer login',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
    });
  }
};

exports.updateProfilePhoto = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { photoData } = req.body;

        if (!photoData) {
            return res.status(400).json({ message: 'Nenhuma foto fornecida' });
        }

        if (!photoData.startsWith('data:image/')) {
            return res.status(400).json({ message: 'Formato de imagem inválido' });
        }

        // Upload para o Cloudinary
        const uploadResponse = await cloudinary.uploader.upload(photoData, {
            folder: 'chat-app/profile-photos',
            transformation: [
                { width: 200, height: 200, crop: 'fill' },
                { quality: 'auto' }
            ],
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
            format: 'jpg'
        });

        if (!uploadResponse || !uploadResponse.secure_url) {
            throw new Error('Erro no upload da imagem para o Cloudinary');
        }

        // Atualizar usuário no banco de dados
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // Se houver uma foto antiga, deletar do Cloudinary
        if (user.profileImage && user.profileImage.includes('cloudinary')) {
            try {
                const oldPublicId = user.profileImage.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`chat-app/profile-photos/${oldPublicId}`);
            } catch (deleteError) {
                console.error('Erro ao deletar imagem antiga:', deleteError);
                // Continuar mesmo se houver erro ao deletar a imagem antiga
            }
        }

        user.profileImage = uploadResponse.secure_url;
        await user.save();

        res.json({
            message: 'Foto de perfil atualizada com sucesso',
            profileImage: user.profileImage
        });
    } catch (error) {
        console.error('Erro detalhado ao atualizar foto de perfil:', error);
        
        // Mensagens de erro mais específicas
        if (error.http_code === 400) {
            return res.status(400).json({ 
                message: 'Formato de imagem não suportado ou arquivo muito grande'
            });
        }
        
        res.status(500).json({ 
            message: 'Erro ao atualizar foto de perfil: ' + (error.message || 'Erro interno do servidor')
        });
    }
};

exports.promoteToAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    // Verificar se o email foi fornecido
    if (!email) {
      return res.status(400).json({ message: 'Email é obrigatório' });
    }

    // Buscar usuário pelo email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Atualizar role para admin
    user.role = 'admin';
    await user.save();

    // Gerar novo token com a nova role
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Usuário promovido a administrador com sucesso',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Erro ao promover usuário:', error);
    res.status(500).json({ 
      message: 'Erro ao promover usuário',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
    });
  }
};

exports.setupInitialAdmin = async (req, res) => {
  try {
    const adminEmail = 'stormgomes5@gmail.com';
    
    // Buscar usuário pelo email
    const user = await User.findOne({ email: adminEmail.toLowerCase() });
    if (!user) {
      return res.status(404).send('Usuário não encontrado');
    }

    // Atualizar role para admin
    user.role = 'admin';
    await user.save();

    res.send(`
      <html>
        <head>
          <title>Admin configurado com sucesso</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f0f2f5;
            }
            .message {
              background: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              text-align: center;
            }
            .success {
              color: #28a745;
              font-size: 24px;
              margin-bottom: 15px;
            }
            .button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #007bff;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="message">
            <div class="success">✓ Administrador configurado com sucesso!</div>
            <p>O usuário ${adminEmail} agora é um administrador.</p>
            <p>Por favor, faça logout e login novamente para ativar as permissões.</p>
            <a href="/chat.html" class="button">Voltar para o Chat</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Erro ao configurar admin:', error);
    res.status(500).send('Erro ao configurar administrador: ' + error.message);
  }
};

exports.muteUser = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const adminId = req.user.userId;
    const adminRole = req.user.role;

    if (!targetUserId) {
      return res.status(400).json({ message: 'ID do usuário alvo não fornecido' });
    }

    // Verificar se é admin
    if (adminRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administradores podem mutar usuários' });
    }

    // Buscar usuário alvo
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Não permitir mutar outros admins
    if (targetUser.role === 'admin') {
      return res.status(403).json({ message: 'Não é possível mutar outros administradores' });
    }

    // Verificar se o usuário já está mutado
    if (targetUser.isMuted) {
      return res.status(400).json({ message: 'Usuário já está mutado' });
    }

    targetUser.isMuted = true;
    await targetUser.save();

    // Emitir evento via Socket.io
    const io = req.app.get('io');
    io.emit('user muted', { 
      userId: targetUser._id, 
      username: targetUser.username,
      isMuted: true
    });

    res.json({ 
      message: 'Usuário mutado com sucesso',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        isMuted: true,
        role: targetUser.role
      }
    });
  } catch (error) {
    console.error('Erro detalhado ao mutar usuário:', error);
    res.status(500).json({ 
      message: 'Erro ao mutar usuário',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
    });
  }
};

exports.unmuteUser = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const adminId = req.user.userId;
    const adminRole = req.user.role;

    // Verificar se é admin
    if (adminRole !== 'admin') {
      return res.status(403).json({ message: 'Apenas administradores podem desmutar usuários' });
    }

    // Buscar usuário alvo
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    targetUser.isMuted = false;
    await targetUser.save();

    // Emitir evento via Socket.io
    const io = req.app.get('io');
    io.emit('user unmuted', { userId: targetUser._id, username: targetUser.username });

    res.json({ 
      message: 'Usuário desmutado com sucesso',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        isMuted: false
      }
    });
  } catch (error) {
    console.error('Erro ao desmutar usuário:', error);
    res.status(500).json({ message: 'Erro ao desmutar usuário' });
  }
}; 