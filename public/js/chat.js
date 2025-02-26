// Configuração do Socket.IO e API
const SOCKET_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://web-production-fa86.up.railway.app';

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://web-production-fa86.up.railway.app/api';

let socket;
let currentUser;
let currentRoom = 'geral';
let darkMode = localStorage.getItem('darkMode') === 'true';

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
    if (!checkAuth()) return;

    socket = io(SOCKET_URL, {
        auth: {
            token: getToken()
        },
        transports: ['websocket'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000
    });

    setupSocketListeners();
};

// Configurar listeners do Socket.IO
const setupSocketListeners = () => {
    socket.on('connect', () => {
        console.log('Conectado ao servidor');
        socket.emit('user connected', currentUser);
        socket.emit('join room', currentRoom);
        loadMessages();
    });

    socket.on('reconnect', () => {
        console.log('Reconectado ao servidor');
        socket.emit('user connected', currentUser);
        socket.emit('join room', currentRoom);
        loadMessages();
    });

    socket.on('disconnect', () => {
        console.log('Desconectado do servidor');
        setTimeout(() => {
            socket.connect();
        }, 1000);
    });

    socket.on('connect_error', (error) => {
        console.error('Erro de conexão:', error);
        setTimeout(() => {
            socket.connect();
        }, 1000);
    });

    socket.on('users online', updateOnlineUsers);
    socket.on('new message', handleNewMessage);
    socket.on('user muted', handleUserMuted);
    socket.on('user unmuted', handleUserUnmuted);
    socket.on('chat cleared', handleChatCleared);
    socket.on('error', handleError);
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

// Função para lidar com erros
const handleError = (error) => {
    console.error('Erro:', error);
    alert(error.message);
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
    // Desconectar do Socket.io
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
    const div = document.createElement('div');
    div.className = 'message';
    div.dataset.messageId = message._id;
    
    const isCurrentUser = currentUser && message.sender.username === currentUser.username;
    if (isCurrentUser) {
        div.classList.add('message-own');
    }

    div.innerHTML = `
        <img src="${message.sender.profileImage}" alt="Avatar" class="avatar">
        <div class="message-content">
            <div class="message-header">
                <span class="username">${message.sender.username}</span>
                <span class="timestamp">${formatDate(message.createdAt)}</span>
            </div>
            <div class="message-text">${message.content}</div>
        </div>
    `;
    return div;
};

// Função para enviar mensagem
const sendMessage = (text) => {
    if (!socket || !socket.connected) {
        console.log('Socket não conectado. Tentando reconectar...');
        socket.connect();
        return;
    }

    if (!text.trim()) return;

    const messageData = {
        room: currentRoom,
        message: {
            content: text,
            sender: {
                username: currentUser.username,
                profileImage: currentUser.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'
            },
            createdAt: new Date()
        }
    };

    // Emitir a mensagem para o servidor
    socket.emit('chat message', messageData);

    // Limpar o campo de mensagem
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
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ photoData: `data:image/jpeg;base64,${base64Data}` })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao atualizar foto');
        }
        
        // Atualizar foto no localStorage
        const user = JSON.parse(localStorage.getItem('user'));
        user.profileImage = data.profileImage;
        localStorage.setItem('user', JSON.stringify(user));

        // Atualizar foto na interface
        document.getElementById('userAvatar').src = data.profileImage;

        // Fechar modal
        document.getElementById('profileModal').style.display = 'none';

        // Notificar outros usuários
        socket.emit('user connected', {
            id: user.id,
            username: user.username,
            profileImage: user.profileImage,
            role: user.role,
            isMuted: user.isMuted
        });

    } catch (error) {
        console.error('Erro detalhado:', error);
        alert('Erro ao atualizar foto de perfil: ' + error.message);
    }
};

// Função para redimensionar e comprimir imagem
const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;
                
                // Calcular dimensões mantendo proporção
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para JPEG com qualidade reduzida
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedDataUrl);
            };
            
            img.onerror = (error) => {
                reject(error);
            };
        };
        
        reader.onerror = (error) => {
            reject(error);
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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar Socket.IO e verificar autenticação
    initializeSocket();
    
    if (!currentUser) return;

    // Configurar tema
    document.body.classList.toggle('light-theme', !darkMode);
    const themeIcon = document.querySelector('#themeToggle i');
    if (themeIcon) {
        themeIcon.className = darkMode ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Configurar interface do usuário
    setupUserInterface();
    
    // Configurar eventos
    setupEventListeners();
    
    // Atualizar lista de usuários periodicamente
    startUserListUpdates();

    // Adicionar event listener para o formulário de mensagem
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                sendMessage(messageInput.value);
            }
        });
    }
});

// Configurar interface do usuário
const setupUserInterface = () => {
    // Atualizar informações do usuário
    document.getElementById('username').textContent = currentUser.username;
    document.getElementById('userAvatar').src = currentUser.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

    // Configurar painel de administração
    const adminPanelButton = document.getElementById('adminPanelButton');
    const adminPanel = document.getElementById('adminPanel');

    if (currentUser.role === 'admin' && adminPanelButton && adminPanel) {
        adminPanelButton.style.display = 'flex';
        
        adminPanelButton.addEventListener('click', () => {
            const isVisible = adminPanel.style.display === 'block';
            adminPanel.style.display = isVisible ? 'none' : 'block';
            adminPanelButton.style.backgroundColor = isVisible ? '#7289da' : '#5b6eae';
        });
    }
};

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

    // Event listener para seleção de canal
    document.getElementById('channelList')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const newRoom = e.target.textContent.replace('#', '').trim();
            changeRoom(newRoom);
        }
    });

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

// Socket.io event listeners
socket.on('connect', () => {
    console.log('Conectado ao servidor Socket.io');
    
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        
        // Enviar dados do usuário
        socket.emit('user connected', {
            id: currentUser.id,
            username: currentUser.username,
            profileImage: currentUser.profileImage,
            role: currentUser.role,
            isMuted: currentUser.isMuted
        });

        // Entrar na sala e solicitar lista de usuários
        socket.emit('join room', currentRoom);
        socket.emit('get users');
        
        // Atualizar lista a cada 3 segundos
        setInterval(() => {
            if (socket.connected) {
                socket.emit('get users');
            }
        }, 3000);
    }
});

socket.on('disconnect', () => {
    console.log('Desconectado do servidor Socket.io');
});

socket.on('reconnect', () => {
    console.log('Reconectado ao servidor Socket.io');
    
    // Reconectar à sala e atualizar dados
    if (currentUser) {
        socket.emit('user connected', {
            id: currentUser.id,
            username: currentUser.username,
            profileImage: currentUser.profileImage,
            role: currentUser.role,
            isMuted: currentUser.isMuted
        });
        socket.emit('join room', currentRoom);
        socket.emit('get users');
    }
});

socket.on('new message', (message) => {
    if (message.room === currentRoom) {
        const container = document.getElementById('messageContainer');
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
        scrollToBottom();
    }
});

socket.on('users online', (users) => {
    console.log('Usuários online recebidos:', users);
    updateOnlineUsers(users);
});

socket.on('message deleted', (messageId) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
});

// Socket.io event listeners para ações de admin
socket.on('user muted', (data) => {
    console.log(`Usuário ${data.username} foi mutado`);
    // Recarregar lista de usuários
    socket.emit('get users');
});

socket.on('user unmuted', (data) => {
    console.log(`Usuário ${data.username} foi desmutado`);
    // Recarregar lista de usuários
    socket.emit('get users');
});

// Eventos de usuário conectado/desconectado
socket.on('user joined', (user) => {
    console.log('Usuário entrou:', user);
    socket.emit('get users');
});

socket.on('user left', (user) => {
    console.log('Usuário saiu:', user);
    socket.emit('get users');
}); 