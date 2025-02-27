// Configuração do Socket.IO e API
const SOCKET_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://web-production-fa86.up.railway.app';

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://web-production-fa86.up.railway.app/api';

let socket = null;
let currentUser = null;
let currentRoom = 'Bate-papo 1';
let darkMode = localStorage.getItem('darkMode') === 'true';
let processedMessages = new Set();
let isConnecting = false;

// Variáveis para chamada de voz
let localStream = null;
let peerConnection = null;
let callTimer = null;
let callDuration = 0;
let isMuted = false;
let callParticipants = new Map(); // Mapa de participantes da chamada
let selectedAudioDevice = null;

// Configuração do WebRTC
const peerConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Verificar autenticação ao carregar a página
const checkAuth = () => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (!token || !savedUser) {
        window.location.href = '/';
        return false;
    }

    try {
        currentUser = JSON.parse(savedUser);
        return true;
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        localStorage.clear();
        window.location.href = '/';
        return false;
    }
};

// Inicializar conexão com Socket.IO
const initializeSocket = () => {
    if (!checkAuth() || isConnecting) return;
    
    isConnecting = true;
    
    socket = io(SOCKET_URL, {
        auth: { token: getToken() },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        forceNew: true,
        withCredentials: true,
        extraHeaders: {
            'Origin': window.location.origin
        }
    });

    // Configurar event listeners do socket
    socket.on('connect', () => {
        console.log('Conectado ao servidor');
        isConnecting = false;
        
        if (currentUser) {
            socket.emit('user connected', currentUser);
            socket.emit('join room', currentRoom);
            socket.emit('get users');
        }
    });

    socket.on('disconnect', () => {
        console.log('Desconectado do servidor');
        isConnecting = false;
    });

    socket.on('connect_error', (error) => {
        console.error('Erro de conexão:', error);
        isConnecting = false;
    });

    socket.on('new message', (message) => {
        if (message.room === currentRoom) {
            const container = document.getElementById('messageContainer');
            if (container) {
                const messageElement = createMessageElement(message);
                container.appendChild(messageElement);
                scrollToBottom();
            }
        }
    });

    socket.on('users online', (users) => {
        if (Array.isArray(users)) {
            updateOnlineUsers(users);
        }
    });

    // Eventos de chamada de voz
    socket.on('call-made', async (data) => {
        console.log('Chamada recebida:', data);
        try {
            const caller = data.caller;
            const confirmCall = confirm(`${caller.username} está te chamando. Deseja atender?`);
            
            if (!confirmCall) {
                socket.emit('call-rejected', { targetUserId: caller.id });
                return;
            }
            
            // Solicitar permissão para usar o microfone
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true,
                video: false 
            });
            
            // Criar conexão peer
            peerConnection = new RTCPeerConnection(peerConfig);
            
            // Adicionar stream local
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            // Configurar handlers
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        candidate: event.candidate,
                        targetUserId: caller.id
                    });
                }
            };
            
            peerConnection.ontrack = (event) => {
                console.log('Stream remoto recebido');
                const remoteAudio = new Audio();
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play().catch(console.error);
            };

            peerConnection.onconnectionstatechange = (event) => {
                console.log('Estado da conexão:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    console.log('Chamada conectada!');
                    document.getElementById('callStatus').textContent = 'Conectado';
                    startCallTimer();
                }
            };
            
            // Aceitar oferta
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('call-answered', {
                targetUserId: caller.id,
                answer: answer
            });
            
            // Mostrar modal de chamada
            showCallModal('Em chamada com ' + caller.username);
            const avatarElement = document.getElementById('callUserAvatar');
            avatarElement.src = caller.profileImage;
            startCallTimer();
            
        } catch (error) {
            console.error('Erro ao receber chamada:', error);
            socket.emit('call-rejected', { targetUserId: data.caller.id });
            alert('Erro ao receber chamada. Verifique se o microfone está disponível.');
        }
    });

    socket.on('call-answered', async (data) => {
        console.log('Chamada atendida:', data);
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            document.getElementById('callStatus').textContent = 'Conectado';
            document.getElementById('callUserAvatar').classList.remove('calling');
            startCallTimer();
        } catch (error) {
            console.error('Erro ao processar resposta da chamada:', error);
            endCall();
        }
    });

    socket.on('call-rejected', () => {
        alert('Chamada recusada pelo usuário');
        endCall();
    });

    socket.on('call-ended', () => {
        alert('Chamada encerrada');
        endCall();
    });

    socket.on('ice-candidate', async (data) => {
        console.log('ICE candidate recebido:', data);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error('Erro ao adicionar ICE candidate:', error);
            }
        }
    });

    return socket;
};

// Função para lidar com novas mensagens
const handleNewMessage = (message) => {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const isCurrentUser = currentUser && message.sender.username === currentUser.username;
    if (isCurrentUser) {
        messageElement.classList.add('message-own');
    }

    messageElement.innerHTML = `
        <img src="${message.sender.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" alt="Avatar" class="avatar">
        <div class="message-content">
            <div class="message-header">
                <span class="username">${message.sender.username}</span>
                <span class="timestamp">${formatDate(message.createdAt)}</span>
            </div>
            <div class="message-text">${message.content}</div>
        </div>
    `;

    container.appendChild(messageElement);
    scrollToBottom();

    // Notificar se a mensagem não for do usuário atual
    if (message.userId !== currentUser.id) {
        notifyNewMessage(message);
    }
};

// Função para lidar com usuário mutado
const handleUserMuted = (data) => {
    if (currentUser && data.userId === currentUser.id) {
        currentUser.isMuted = true;
        localStorage.setItem('user', JSON.stringify(currentUser));
    }
};

// Função para lidar com usuário desmutado
const handleUserUnmuted = (data) => {
    if (currentUser && data.userId === currentUser.id) {
        currentUser.isMuted = false;
        localStorage.setItem('user', JSON.stringify(currentUser));
    }
};

// Função para lidar com chat limpo
const handleChatCleared = () => {
    const container = document.getElementById('messageContainer');
    container.innerHTML = '';
};

// Função para obter o token
const getToken = () => localStorage.getItem('token');

// Função para formatar data
const formatDate = (date) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Função para verificar e renovar o token
const checkAndRenewToken = async () => {
    const token = getToken();
    if (!token) return false;

    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Token inválido');
        }

        const data = await response.json();
        
        // Atualizar token se necessário
        if (data.newToken) {
            localStorage.setItem('token', data.newToken);
        }

        return true;
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        return false;
    }
};

// Função para fazer logout
const logout = () => {
    // Desconectar do Socket.IO
    if (socket) {
        socket.disconnect();
    }
    
    // Limpar dados do localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirecionar para a página de login
    window.location.href = '/';
};

// Função para carregar mensagens com cache e retry
const loadMessages = async (room = currentRoom) => {
    try {
        // Tentar carregar do cache primeiro
        const cachedMessages = sessionStorage.getItem(`messages_${room}`);
        if (cachedMessages) {
            displayMessages(JSON.parse(cachedMessages));
        }

        // Fazer requisição ao servidor com retry
        const maxRetries = 3;
        let attempt = 0;
        let success = false;

        while (!success && attempt < maxRetries) {
            try {
                const response = await fetch(`${API_URL}/chat/messages?room=${room}`, {
                    headers: {
                        'Authorization': `Bearer ${getToken()}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Erro ao carregar mensagens');
                }

                const messages = await response.json();
                
                // Atualizar cache
                sessionStorage.setItem(`messages_${room}`, JSON.stringify(messages));
                
                // Exibir mensagens apenas se forem diferentes das que estão em cache
                if (!cachedMessages || JSON.stringify(messages) !== cachedMessages) {
                    displayMessages(messages);
                }

                success = true;
            } catch (error) {
                attempt++;
                if (attempt === maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        // Se houver erro, usar cache se disponível
        const cachedMessages = sessionStorage.getItem(`messages_${room}`);
        if (cachedMessages) {
            displayMessages(JSON.parse(cachedMessages));
        } else {
            const container = document.getElementById('messageContainer');
            if (container) {
                container.innerHTML = '<div class="system-message"><div class="message-content"><div class="message-text"><i class="fas fa-exclamation-circle"></i> Erro ao carregar mensagens. Tentando reconectar...</div></div></div>';
            }
            // Tentar reconectar ao Socket.IO
            if (socket) {
                socket.connect();
            }
        }
    }
};

// Função para exibir mensagens
const displayMessages = (messages) => {
    const container = document.getElementById('messageContainer');
    container.innerHTML = '';

    messages.reverse().forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });

    scrollToBottom();
};

// Função para criar elemento de mensagem
const createMessageElement = (message) => {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${currentUser && message.sender.username === currentUser.username ? 'message-own' : ''}`;
    messageElement.dataset.messageId = message._id;

    const isImage = message.type === 'image';
    
    messageElement.innerHTML = `
        <img src="${message.sender.profileImage}" alt="Avatar" class="avatar">
        <div class="message-content">
            <div class="message-header">
                <span class="username">${message.sender.username}</span>
                <span class="timestamp">${formatDate(message.createdAt)}</span>
            </div>
            <div class="message-text">
                ${isImage 
                    ? `<img src="${message.imageUrl}" alt="Imagem compartilhada" class="shared-image" onclick="openImageModal('${message.imageUrl}')">`
                    : message.content}
            </div>
        </div>
    `;

    return messageElement;
};

// Função para abrir modal de imagem
const openImageModal = (imageUrl) => {
    const modal = document.createElement('div');
    modal.className = 'modal image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <img src="${imageUrl}" alt="Imagem em tamanho original">
        </div>
    `;

    modal.querySelector('.close').onclick = () => modal.remove();
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
};

// Função para enviar mensagem
const sendMessage = (text, type = 'text') => {
    if (!socket || !socket.connected) return;
    
    const messageData = {
        room: currentRoom,
        message: {
            content: text,
            type: type,
            sender: {
                username: currentUser.username,
                profileImage: currentUser.profileImage
            }
        }
    };
    
    socket.emit('chat message', messageData);
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.value = '';
        messageInput.focus();
    }
};

// Função para atualizar lista de usuários com cache
const updateOnlineUsers = (users) => {
    if (!Array.isArray(users)) {
        console.log('Lista de usuários inválida:', users);
        return;
    }

    // Verificar se a lista é diferente da cache
    const cachedUsers = sessionStorage.getItem('online_users');
    if (cachedUsers && JSON.stringify(users) === cachedUsers) {
        return; // Se for igual, não atualiza
    }

    // Atualizar cache
    sessionStorage.setItem('online_users', JSON.stringify(users));

    const currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser) {
        console.log('Usuário atual não encontrado');
        return;
    }

    const isAdmin = currentUser.role === 'admin';
    const userList = document.getElementById('userList');
    const adminPanel = document.getElementById('adminPanel');

    // Limpar lista de usuários
    if (userList) {
        userList.innerHTML = '';
    }

    // Remover duplicatas e garantir que todos estão online
    const uniqueUsers = users.filter((user, index, self) =>
        index === self.findIndex((u) => u._id === user._id)
    );

    // Ordenar usuários (admins primeiro)
    uniqueUsers.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return a.username.localeCompare(b.username);
    });

    // Atualizar lista de usuários normal
    uniqueUsers.forEach(user => {
        const userItem = document.createElement('li');
        userItem.className = 'user-item';
        if (user.isMuted) userItem.classList.add('muted');

        userItem.innerHTML = `
            <img src="${user.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" 
                 alt="${user.username}" 
                 class="user-avatar">
            <span class="username">${user.username}</span>
            ${user.isMuted ? '<span class="muted-tag">Mutado</span>' : ''}
            ${user.role === 'admin' ? '<span class="admin-tag">Admin</span>' : ''}
            <span class="online-status"></span>
        `;

        userList.appendChild(userItem);
    });

    // Atualizar painel de admin
    if (isAdmin && adminPanel) {
        const userListAdmin = adminPanel.querySelector('.user-list-admin');
        if (userListAdmin) {
            userListAdmin.innerHTML = '';
            
            uniqueUsers.forEach(user => {
                if (user._id === currentUser.id) return;

                const userItemAdmin = document.createElement('div');
                userItemAdmin.className = 'user-item-admin';
                userItemAdmin.innerHTML = `
                    <div class="user-info">
                        <img src="${user.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" 
                             alt="${user.username}" 
                             class="user-avatar">
                        <span class="username">${user.username}</span>
                        ${user.role === 'admin' ? '<span class="admin-tag">Admin</span>' : ''}
                    </div>
                    ${user.role !== 'admin' ? `
                        <div class="user-actions">
                            <button class="${user.isMuted ? 'unmute-button' : 'mute-button'}" 
                                    onclick="${user.isMuted ? 'unmuteUser' : 'muteUser'}('${user._id}')">
                                <i class="fas fa-${user.isMuted ? 'volume-up' : 'volume-mute'}"></i>
                            </button>
                        </div>
                    ` : ''}
                `;
                userListAdmin.appendChild(userItemAdmin);
            });
        }
        adminPanel.style.display = 'block';
    }
};

// Função para rolar para o final das mensagens
const scrollToBottom = () => {
    const container = document.getElementById('messageContainer');
    container.scrollTop = container.scrollHeight;
};

// Função para alternar tema
const toggleTheme = () => {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    document.body.classList.toggle('light-theme', !darkMode);
    
    const themeIcon = document.querySelector('#themeToggle i');
    themeIcon.className = darkMode ? 'fas fa-sun' : 'fas fa-moon';
};

// Função para atualizar foto de perfil
const updateProfilePhoto = async (photoData) => {
    try {
        // Remover o prefixo "data:image/..." da string base64 se existir
        const base64Data = photoData.includes('base64,') ? photoData.split('base64,')[1] : photoData;

        const response = await fetch(`${API_URL}/auth/profile-photo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ photoData: base64Data })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao atualizar foto');
        }

        const data = await response.json();
        
        // Atualizar foto no localStorage
        const user = JSON.parse(localStorage.getItem('user'));
        user.profileImage = data.profileImage;
        localStorage.setItem('user', JSON.stringify(user));

        // Atualizar foto na interface
        document.getElementById('userAvatar').src = data.profileImage;

        // Fechar modal
        document.getElementById('profileModal').style.display = 'none';

        // Notificar outros usuários
        if (socket && socket.connected) {
            socket.emit('user connected', {
                id: user.id,
                username: user.username,
                profileImage: user.profileImage,
                role: user.role,
                isMuted: user.isMuted
            });
        }

        alert('Foto de perfil atualizada com sucesso!');
    } catch (error) {
        console.error('Erro detalhado:', error);
        alert('Erro ao atualizar foto de perfil: ' + error.message);
    }
};

// Função para fazer upload da foto de perfil
window.uploadProfilePhoto = async () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Por favor, selecione uma foto primeiro.');
        return;
    }

    // Verificar tamanho do arquivo
    if (file.size > 5 * 1024 * 1024) { // 5MB
        alert('A imagem é muito grande. Por favor, selecione uma imagem menor que 5MB.');
        return;
    }
    
    try {
        // Mostrar loading
        const saveButton = document.getElementById('saveProfilePhoto');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Salvando...';
        }
        
        // Comprimir a imagem antes do upload
        const compressedImage = await compressImage(file, 800);
        
        // Remover o prefixo "data:image/..." da string base64
        const base64Data = compressedImage.split('base64,')[1];
        
        const response = await fetch(`${API_URL}/auth/profile-photo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
                'Accept': 'application/json',
                'Origin': window.location.origin
            },
            mode: 'cors',
            credentials: 'include',
            body: JSON.stringify({ 
                photoData: base64Data,
                contentType: file.type
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Erro interno do servidor' }));
            throw new Error(errorData.message || 'Erro ao fazer upload da foto');
        }
        
        const data = await response.json();
        
        // Atualizar foto no localStorage
        const currentUser = JSON.parse(localStorage.getItem('user'));
        currentUser.profileImage = data.profileImage;
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        // Atualizar foto na interface
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar) {
            userAvatar.src = data.profileImage;
        }
        
        // Fechar modal
        const profileModal = document.getElementById('profileModal');
        if (profileModal) {
            profileModal.style.display = 'none';
        }
        
        // Notificar outros usuários se o socket estiver conectado
        if (socket && socket.connected) {
            socket.emit('profile photo updated', { 
                userId: currentUser._id, 
                profileImage: data.profileImage 
            });
        }
        
        alert('Foto de perfil atualizada com sucesso!');
    } catch (error) {
        console.error('Erro detalhado ao fazer upload:', error);
        alert(`Erro ao fazer upload da foto: ${error.message}`);
    } finally {
        // Restaurar botão
        const saveButton = document.getElementById('saveProfilePhoto');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Salvar';
        }
    }
};

// Função para comprimir imagem
const compressImage = async (file, maxWidth = 800) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (maxWidth * height) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Desenhar imagem mantendo a proporção
                ctx.drawImage(img, 0, 0, width, height);
                
                // Comprimir para JPEG com qualidade 0.8
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        };
    });
};

// Funções globais para mutar/desmutar usuários
window.muteUser = async function(userId) {
  try {
    const response = await fetch('/api/auth/mute-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ targetUserId: userId })
    });

    if (!response.ok) {
      throw new Error('Erro ao mutar usuário');
    }

    socket.emit('user muted', { userId });
    socket.emit('get users');
    
    alert('Usuário mutado com sucesso!');
  } catch (error) {
    console.error('Erro ao mutar usuário:', error);
    alert('Erro ao mutar usuário: ' + error.message);
  }
};

window.unmuteUser = async function(userId) {
  try {
    const response = await fetch('/api/auth/unmute-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ targetUserId: userId })
    });

    if (!response.ok) {
      throw new Error('Erro ao desmutar usuário');
    }

    socket.emit('user unmuted', { userId });
    socket.emit('get users');
    
    alert('Usuário desmutado com sucesso!');
  } catch (error) {
    console.error('Erro ao desmutar usuário:', error);
    alert('Erro ao desmutar usuário: ' + error.message);
  }
};

// Função para limpar o chat
window.clearChat = async function() {
    const confirmClear = confirm('Tem certeza que deseja limpar todo o chat? Esta ação não pode ser desfeita.');
    if (!confirmClear) return;

    try {
        const response = await fetch(`${API_URL}/chat/clear`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ room: currentRoom })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Erro ao limpar chat');
        }

        // O socket.io irá atualizar a interface quando receber o evento 'chat cleared'
    } catch (error) {
        console.error('Erro ao limpar chat:', error);
        alert('Erro ao limpar chat: ' + error.message);
    }
};

// Função para configurar preview da foto
function setupPhotoPreview() {
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('imagePreview');
    const uploadActions = document.querySelector('.upload-actions');
    const profileModal = document.getElementById('profileModal');
    const saveButton = document.getElementById('saveProfilePhoto');

    // Event listener para o input de arquivo
    if (fileInput) {
        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) {
                imagePreview.style.display = 'none';
                uploadActions.style.display = 'none';
                return;
            }

            try {
                // Criar URL para preview
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.src = e.target.result;
                    imagePreview.style.display = 'block';
                    // Mostrar os botões
                    uploadActions.style.display = 'flex';
                    uploadActions.style.justifyContent = 'space-between';
                    uploadActions.style.marginTop = '20px';
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Erro ao carregar imagem:', error);
                alert('Erro ao carregar imagem. Tente novamente.');
            }
        });
    }

    // Configurar botão de fechar modal
    const closeButton = document.querySelector('.close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            profileModal.style.display = 'none';
            // Limpar preview e esconder botões ao fechar
            imagePreview.style.display = 'none';
            uploadActions.style.display = 'none';
        });
    }

    // Fechar modal quando clicar fora
    window.addEventListener('click', (event) => {
        if (event.target === profileModal) {
            profileModal.style.display = 'none';
            // Limpar preview e esconder botões ao fechar
            imagePreview.style.display = 'none';
            uploadActions.style.display = 'none';
        }
    });

    // Configurar botão de salvar
    if (saveButton) {
        saveButton.onclick = uploadProfilePhoto;
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Carregar usuário atual
        const savedUser = localStorage.getItem('user');
        if (!savedUser) {
            window.location.href = '/';
            return;
        }

        currentUser = JSON.parse(savedUser);
        
        // Configurar interface do usuário
        setupUserInterface();
        
        // Inicializar Socket.IO
        socket = initializeSocket();
        
        // Configurar eventos
        setupEventListeners();
        
        // Configurar preview da foto
        setupPhotoPreview();
        
    } catch (error) {
        console.error('Erro ao inicializar chat:', error);
        localStorage.clear();
        window.location.href = '/';
    }
});

// Função para configurar interface do usuário
const setupUserInterface = () => {
    try {
        const currentUser = JSON.parse(localStorage.getItem('user'));
        if (!currentUser) {
            window.location.href = '/login.html';
            return;
        }

        document.getElementById('username').textContent = currentUser.username;
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar && currentUser.profileImage) {
            userAvatar.src = currentUser.profileImage;
        }

        const previewImage = document.getElementById('previewImage');
        if (previewImage && currentUser.profileImage) {
            previewImage.src = currentUser.profileImage;
            previewImage.style.display = 'block';
        }

        setupPhotoPreview();
        initializeSocket();
        setupEventListeners();
    } catch (error) {
        console.error('Erro ao inicializar o chat:', error);
        alert('Erro ao inicializar o chat. Por favor, faça login novamente.');
        window.location.href = '/login.html';
    }
};

// Função para enviar imagem no chat
async function handleChatImage(file) {
    try {
        // Converter arquivo para base64
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        // Enviar mensagem com a imagem
        if (socket && socket.connected) {
            socket.emit('chat message', {
                room: currentRoom,
                message: {
                    type: 'image',
                    imageUrl: base64,
                    sender: {
                        username: currentUser.username,
                        profileImage: currentUser.profileImage
                    }
                }
            });
        }
    } catch (error) {
        console.error('Erro ao enviar imagem:', error);
        alert('Erro ao enviar imagem. Por favor, tente novamente.');
    }
}

// Configurar event listeners
const setupEventListeners = () => {
    // Event listener para logout
    document.getElementById('logoutButton')?.addEventListener('click', () => {
        const confirmLogout = confirm('Tem certeza que deseja sair?');
        if (confirmLogout) {
            logout();
        }
    });

    // Event listener para alternar tema
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        toggleTheme();
        const emojiPicker = document.getElementById('emojiPicker');
        if (emojiPicker) {
            emojiPicker.classList.toggle('light', !darkMode);
        }
    });

    // Event listener para foto de perfil
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        userAvatar.addEventListener('click', () => {
            const profileModal = document.getElementById('profileModal');
            if (profileModal) {
                profileModal.style.display = 'block';
            }
        });
    }

    // Event listener para seleção de canal
    document.getElementById('channelList')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const newRoom = e.target.textContent.replace('#', '').trim();
            changeRoom(newRoom);
        }
    });

    // Event listener para envio de imagem no chat
    const imageButton = document.querySelector('.image-button');
    const chatImageInput = document.getElementById('chatImageInput');

    if (imageButton && chatImageInput) {
        imageButton.addEventListener('click', () => {
            chatImageInput.click();
        });

        chatImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) { // 5MB
                    alert('A imagem é muito grande. Por favor, selecione uma imagem menor que 5MB.');
                    return;
                }
                await handleChatImage(file);
                chatImageInput.value = ''; // Limpar input
            }
        });
    }

    // Configurar emoji picker
    setupEmojiPicker();
};

// Configurar emoji picker
const setupEmojiPicker = () => {
    const emojiButton = document.getElementById('emojiButton');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('messageInput');

    if (!emojiButton || !emojiPicker || !messageInput) return;

    emojiButton.addEventListener('click', () => {
        emojiPicker.classList.toggle('visible');
        emojiPicker.classList.toggle('light', !darkMode);
    });

    document.addEventListener('click', (e) => {
        if (!emojiButton.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.classList.remove('visible');
        }
    });

    emojiPicker.addEventListener('emoji-click', event => {
        const cursor = messageInput.selectionStart;
        const text = messageInput.value;
        const newText = text.slice(0, cursor) + event.detail.unicode + text.slice(cursor);
        messageInput.value = newText;
        messageInput.focus();
        messageInput.selectionStart = cursor + event.detail.unicode.length;
        messageInput.selectionEnd = cursor + event.detail.unicode.length;
    });
};

// Iniciar atualizações da lista de usuários
const startUserListUpdates = () => {
    // Atualizar lista inicial
    socket.emit('get users');

    // Atualizar a cada 3 segundos
    const updateInterval = setInterval(() => {
        if (socket.connected) {
            socket.emit('get users');
        }
    }, 3000);

    // Limpar intervalo quando a página for fechada
    window.addEventListener('beforeunload', () => {
        clearInterval(updateInterval);
    });
};

// Função para mudar de sala
const changeRoom = (newRoom) => {
    // Atualizar canal ativo
    document.querySelectorAll('#channelList li').forEach(li => {
        li.classList.remove('active');
    });
    
    const roomElement = document.querySelector(`#channelList li:contains('${newRoom}')`);
    if (roomElement) {
        roomElement.classList.add('active');
    }

    // Mudar de sala
    currentRoom = newRoom;
    document.getElementById('currentChannel').textContent = newRoom;
    socket.emit('join room', newRoom);
    loadMessages(newRoom);
};

// Função para mostrar modal de chamada
const showCallModal = (status) => {
    const modal = document.getElementById('voiceCallModal');
    const statusElement = document.getElementById('callStatus');
    const avatar = document.getElementById('callUserAvatar');
    
    statusElement.textContent = status;
    avatar.src = currentUser.profileImage;
    modal.style.display = 'block';
};

// Função para iniciar timer da chamada
const startCallTimer = () => {
    callDuration = 0;
    updateCallDuration();
    callTimer = setInterval(updateCallDuration, 1000);
};

// Função para atualizar duração da chamada
const updateCallDuration = () => {
    callDuration++;
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    document.getElementById('callDuration').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Função para encerrar chamada
const endCall = () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    document.getElementById('voiceCallModal').style.display = 'none';
    document.getElementById('callUserAvatar').classList.remove('calling');
    
    socket.emit('call-ended');
};

// Função para mutar/desmutar microfone
const toggleMute = () => {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;
        
        const muteButton = document.getElementById('muteButton');
        muteButton.innerHTML = isMuted ? 
            '<i class="fas fa-microphone-slash"></i>' : 
            '<i class="fas fa-microphone"></i>';
        muteButton.classList.toggle('muted', isMuted);
    }
};

// Event listeners para chamadas
socket.on('call-made', handleIncomingCall);

socket.on('call-answered', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    document.getElementById('callStatus').textContent = 'Em chamada';
    document.getElementById('callUserAvatar').classList.remove('calling');
    startCallTimer();
});

socket.on('call-rejected', () => {
    alert('Chamada recusada');
    endCall();
});

socket.on('call-ended', () => {
    endCall();
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error('Erro ao adicionar ICE candidate:', error);
        }
    }
});

// Event listeners para botões
document.getElementById('voiceCallButton').addEventListener('click', () => {
    const targetUser = prompt('Digite o ID do usuário para chamar:');
    if (targetUser && targetUser.trim()) {
        console.log('Iniciando chamada para:', targetUser);
        startCall(targetUser.trim());
    }
});

document.getElementById('muteButton').addEventListener('click', toggleMute);
document.getElementById('endCallButton').addEventListener('click', endCall);

// Função para iniciar chamada
const startCall = async (targetUserId) => {
    try {
        // Verificar se já existe uma chamada em andamento
        if (peerConnection) {
            alert('Já existe uma chamada em andamento.');
            return;
        }

        // Verificar se o usuário alvo existe
        if (!targetUserId) {
            alert('Por favor, informe o ID do usuário para chamar.');
            return;
        }

        // Listar dispositivos de áudio disponíveis
        await listAudioDevices();

        // Solicitar permissão para usar o microfone
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        // Criar conexão peer
        peerConnection = new RTCPeerConnection(peerConfig);
        
        // Adicionar stream local
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Configurar handlers
        setupPeerConnectionHandlers(targetUserId);
        
        // Criar e enviar oferta
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true
        });
        await peerConnection.setLocalDescription(offer);
        
        // Emitir evento de chamada
        socket.emit('call-user', {
            targetUserId: targetUserId,
            offer: offer,
            caller: {
                id: currentUser._id,
                username: currentUser.username,
                profileImage: currentUser.profileImage
            }
        });
        
        // Mostrar modal de chamada
        showCallModal('Chamando...');
        
        // Adicionar usuário atual à lista de participantes
        addCallParticipant(currentUser, 'Você');
        
    } catch (error) {
        console.error('Erro ao iniciar chamada:', error);
        alert('Erro ao iniciar chamada. Verifique se o microfone está disponível.');
        endCall();
    }
};

// Função para listar dispositivos de áudio
const listAudioDevices = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const audioSelect = document.getElementById('audioInput');
        audioSelect.innerHTML = '';
        
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microfone ${audioSelect.length + 1}`;
            audioSelect.appendChild(option);
        });
        
        // Selecionar o dispositivo padrão ou o primeiro disponível
        if (!selectedAudioDevice && audioInputs.length > 0) {
            selectedAudioDevice = audioInputs[0].deviceId;
            audioSelect.value = selectedAudioDevice;
        }
    } catch (error) {
        console.error('Erro ao listar dispositivos de áudio:', error);
    }
};

// Função para configurar handlers da conexão peer
const setupPeerConnectionHandlers = (targetUserId) => {
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                targetUserId: targetUserId
            });
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Stream remoto recebido');
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(console.error);
    };

    peerConnection.onconnectionstatechange = (event) => {
        console.log('Estado da conexão:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            document.getElementById('callStatus').textContent = 'Conectado';
            startCallTimer();
        }
    };
};

// Função para adicionar participante à chamada
const addCallParticipant = (user, status = '') => {
    const participantsList = document.getElementById('callParticipantsList');
    const participantItem = document.createElement('li');
    participantItem.dataset.userId = user._id;
    
    participantItem.innerHTML = `
        <img src="${user.profileImage}" alt="${user.username}" class="participant-avatar">
        <span class="participant-name">${user.username}</span>
        <span class="participant-status">${status}</span>
    `;
    
    participantsList.appendChild(participantItem);
    callParticipants.set(user._id, user);
};

// Função para remover participante da chamada
const removeCallParticipant = (userId) => {
    const participantItem = document.querySelector(`#callParticipantsList li[data-user-id="${userId}"]`);
    if (participantItem) {
        participantItem.remove();
    }
    callParticipants.delete(userId);
};

// Função para atualizar volume do microfone
const updateMicrophoneVolume = (volume) => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.applyConstraints({
                volume: volume / 100
            }).catch(console.error);
        }
    }
};

// Event listeners para controles de áudio
document.getElementById('audioInput').addEventListener('change', async (e) => {
    selectedAudioDevice = e.target.value;
    if (localStream) {
        // Parar tracks atuais
        localStream.getTracks().forEach(track => track.stop());
        
        try {
            // Obter novo stream com o dispositivo selecionado
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: selectedAudioDevice },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Substituir tracks na conexão peer
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const audioSender = senders.find(sender => sender.track.kind === 'audio');
                if (audioSender) {
                    audioSender.replaceTrack(localStream.getAudioTracks()[0]);
                }
            }
        } catch (error) {
            console.error('Erro ao trocar dispositivo de áudio:', error);
            alert('Erro ao trocar dispositivo de áudio. Por favor, tente novamente.');
        }
    }
});

document.getElementById('micVolume').addEventListener('input', (e) => {
    updateMicrophoneVolume(e.target.value);
}); 