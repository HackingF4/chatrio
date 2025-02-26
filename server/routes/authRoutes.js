const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Rotas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/setup-admin', authController.setupInitialAdmin);

// Rotas protegidas
router.post('/profile-photo', auth, authController.updateProfilePhoto);
router.post('/promote-admin', auth, authController.promoteToAdmin);
router.post('/mute-user', auth, authController.muteUser);
router.post('/unmute-user', auth, authController.unmuteUser);

module.exports = router; 