const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Rotas públicas
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/setup-admin', authController.setupInitialAdmin);

// Rota para verificar token
router.post('/verify', auth, (req, res) => {
    // Se chegou aqui, o token é válido (middleware auth já verificou)
    res.json({ 
        valid: true,
        user: req.user
    });
});

// Rotas protegidas
router.post('/profile-photo', auth, authController.updateProfilePhoto);
router.post('/promote-admin', auth, authController.promoteToAdmin);
router.post('/mute-user', auth, authController.muteUser);
router.post('/unmute-user', auth, authController.unmuteUser);

module.exports = router; 