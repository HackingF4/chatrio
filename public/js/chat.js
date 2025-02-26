// Configuração do Socket.io e API
const socket = io(window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://web-production-fa86.up.railway.app', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : '/api'; // Usa o proxy do Netlify

// Variáveis globais
let currentUser = null;
let currentRoom = 'Bate-papo 1';
let darkMode = localStorage.getItem('darkMode') === 'true';

// Função para obter o token
const getToken = () => localStorage.getItem('token');

// Função para formatar data
const formatDate = (date) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Função para carregar mensagens
const loadMessages = async (room = currentRoom) => {
    try {
        const response = await fetch(`${API_URL}/chat/messages?room=${room}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) throw new Error('Erro ao carregar mensagens');

        const messages = await response.json();
        displayMessages(messages);
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar mensagens');
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
const sendMessage = async (content) => {
    try {
        // Verificar se o usuário está mutado
        const currentUser = JSON.parse(localStorage.getItem('user'));
        if (currentUser.isMuted) {
            alert('Você está mutado e não pode enviar mensagens.');
            return;
        }

        const response = await fetch(`${API_URL}/chat/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ content, room: currentRoom })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Erro ao enviar mensagem');
        }

        // Limpar o input e manter o foco
        const messageInput = document.getElementById('messageInput');
        messageInput.value = '';
        messageInput.focus();

    } catch (error) {
        console.error('Erro:', error);
        alert(error.message);
    }
};

// Função para atualizar lista de usuários online
const updateOnlineUsers = (users) => {
    const userList = document.getElementById('userList');
    const adminPanel = document.getElementById('adminPanel');
    const userListAdmin = adminPanel.querySelector('.user-list-admin');
    
    userList.innerHTML = '';
    userListAdmin.innerHTML = '';

    // Verificar se o usuário atual é admin
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const isAdmin = currentUser.role === 'admin';

    // Mostrar/ocultar painel de admin
    adminPanel.style.display = isAdmin ? 'block' : 'none';

    users.forEach(user => {
        // Lista normal de usuários
        const li = document.createElement('li');
        li.innerHTML = `
            <img src="${user.profileImage}" alt="Avatar" class="avatar" style="width: 24px; height: 24px;">
            ${user.username}
        `;
        userList.appendChild(li);

        // Lista de usuários no painel de admin
        if (isAdmin && user.username !== currentUser.username) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item-admin';
            userItem.innerHTML = `
                <div class="user-info">
                    <img src="${user.profileImage}" alt="Avatar" class="avatar" style="width: 24px; height: 24px;">
                    <span>${user.username}</span>
                    ${user.isMuted ? '<span class="user-status status-muted">Mutado</span>' : ''}
                    ${user.role === 'admin' ? '<span class="user-status status-admin">Admin</span>' : ''}
                </div>
                <div class="user-actions">
                    ${user.role !== 'admin' ? `
                        <button class="admin-button ${user.isMuted ? 'unmute-button' : 'mute-button'}" 
                                onclick="window.${user.isMuted ? 'unmuteUser' : 'muteUser'}('${user._id}')">
                            ${user.isMuted ? 'Desmutar' : 'Mutar'}
                        </button>
                    ` : ''}
                </div>
            `;
            userListAdmin.appendChild(userItem);
        }
    });
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

// Função para fazer logout
const logout = () => {
    // Desconectar do Socket.io
    socket.disconnect();
    
    // Limpar dados do localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirecionar para a página de login
    window.location.href = '/';
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

// Socket event para chat limpo
socket.on('chat cleared', ({ room }) => {
    if (room === currentRoom) {
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.innerHTML = '';
        
        // Adicionar mensagem do sistema
        const systemMessage = document.createElement('div');
        systemMessage.className = 'message system-message';
        systemMessage.innerHTML = `
            <div class="message-content">
                <div class="message-text">
                    <i class="fas fa-info-circle"></i> O chat foi limpo por um administrador
                </div>
            </div>
        `;
        messageContainer.appendChild(systemMessage);
    }
});

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Carregar usuário atual
    currentUser = JSON.parse(localStorage.getItem('user'));
    if (!currentUser) {
        window.location.href = '/';
        return;
    }

    // Configurar botão e painel de administração
    const adminPanelButton = document.getElementById('adminPanelButton');
    const adminPanel = document.getElementById('adminPanel');

    if (currentUser.role === 'admin') {
        adminPanelButton.style.display = 'flex';
        
        adminPanelButton.addEventListener('click', () => {
            if (adminPanel.style.display === 'none' || !adminPanel.style.display) {
                adminPanel.style.display = 'block';
                adminPanelButton.style.backgroundColor = '#5b6eae';
            } else {
                adminPanel.style.display = 'none';
                adminPanelButton.style.backgroundColor = '#7289da';
            }
        });
    }

    // Event listener para logout
    document.getElementById('logoutButton').addEventListener('click', () => {
        const confirmLogout = confirm('Tem certeza que deseja sair?');
        if (confirmLogout) {
            logout();
        }
    });

    // Conectar ao Socket.io e enviar dados do usuário
    socket.emit('user connected', {
        id: currentUser.id,
        username: currentUser.username,
        profileImage: currentUser.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
        role: currentUser.role,
        isMuted: currentUser.isMuted
    });

    // Atualizar informações do usuário
    document.getElementById('username').textContent = currentUser.username;
    document.getElementById('userAvatar').src = currentUser.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

    // Carregar mensagens iniciais
    loadMessages();

    // Configurar tema
    document.body.classList.toggle('light-theme', !darkMode);
    const themeIcon = document.querySelector('#themeToggle i');
    themeIcon.className = darkMode ? 'fas fa-sun' : 'fas fa-moon';

    // Configurar emoji picker
    const emojiButton = document.getElementById('emojiButton');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('messageInput');

    // Mostrar/ocultar emoji picker
    emojiButton.addEventListener('click', () => {
        emojiPicker.classList.toggle('visible');
        // Atualizar tema do emoji picker
        emojiPicker.classList.toggle('light', !darkMode);
    });

    // Fechar emoji picker ao clicar fora
    document.addEventListener('click', (e) => {
        if (!emojiButton.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.classList.remove('visible');
        }
    });

    // Inserir emoji selecionado
    emojiPicker.addEventListener('emoji-click', event => {
        const cursor = messageInput.selectionStart;
        const text = messageInput.value;
        const newText = text.slice(0, cursor) + event.detail.unicode + text.slice(cursor);
        messageInput.value = newText;
        messageInput.focus();
        messageInput.selectionStart = cursor + event.detail.unicode.length;
        messageInput.selectionEnd = cursor + event.detail.unicode.length;
    });

    // Event listener para envio de mensagem
    document.getElementById('messageForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const content = messageInput.value.trim();
        
        if (content) {
            sendMessage(content);
        }
    });

    // Event listener para alternar tema
    document.getElementById('themeToggle').addEventListener('click', () => {
        toggleTheme();
        // Atualizar tema do emoji picker
        emojiPicker.classList.toggle('light', !darkMode);
    });

    // Event listener para seleção de canal
    document.getElementById('channelList').addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const newRoom = e.target.textContent.replace('#', '').trim();
            
            // Atualizar canal ativo
            document.querySelectorAll('#channelList li').forEach(li => {
                li.classList.remove('active');
            });
            e.target.classList.add('active');

            // Mudar de sala
            currentRoom = newRoom;
            document.getElementById('currentChannel').textContent = newRoom;
            socket.emit('join room', newRoom);
            loadMessages(newRoom);
        }
    });

    // Configurar upload de foto
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('imagePreview');
    const saveButton = document.getElementById('saveProfilePhoto');

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Verificar tipo de arquivo
                if (!file.type.startsWith('image/')) {
                    alert('Por favor, selecione apenas arquivos de imagem');
                    fileInput.value = '';
                    return;
                }

                if (file.size > 10 * 1024 * 1024) { // 10MB
                    alert('A imagem deve ter no máximo 10MB');
                    fileInput.value = '';
                    return;
                }

                // Comprimir imagem
                const compressedImage = await compressImage(file);
                imagePreview.src = compressedImage;
                imagePreview.style.display = 'block';
            } catch (error) {
                console.error('Erro ao processar imagem:', error);
                alert('Erro ao processar imagem');
            }
        }
    });

    saveButton.addEventListener('click', () => {
        const photoData = imagePreview.src;
        if (photoData && photoData !== '') {
            updateProfilePhoto(photoData);
        }
    });

    // Fechar modal ao clicar fora
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('profileModal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Socket.io event listeners
socket.on('connect', () => {
    console.log('Conectado ao servidor Socket.io');
    socket.emit('join room', currentRoom);
});

socket.on('new message', (message) => {
    if (message.room === currentRoom) {
        // Verificar se a mensagem já existe
        const existingMessage = document.querySelector(`[data-message-id="${message._id}"]`);
        if (!existingMessage) {
            const container = document.getElementById('messageContainer');
            const messageElement = createMessageElement(message);
            container.appendChild(messageElement);
            scrollToBottom();
        }
    }
});

socket.on('users online', (users) => {
    const userList = document.getElementById('userList');
    const currentUser = JSON.parse(localStorage.getItem('user'));
    
    userList.innerHTML = users.map(user => {
        const isAdmin = user.role === 'admin';
        const isMuted = user.isMuted;
        const muteButton = !isAdmin && currentUser.role === 'admin' ? 
          `<button onclick="${isMuted ? 'unmuteUser' : 'muteUser'}('${user._id}')" class="mute-button">
            ${isMuted ? 'Desmutar' : 'Mutar'}
          </button>` : '';
        
        return `
          <div class="user-item ${isMuted ? 'muted' : ''} ${isAdmin ? 'admin' : ''}">
            <img src="${user.profileImage || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" alt="${user.username}" class="user-avatar">
            <span class="username">${user.username}</span>
            ${isAdmin ? '<span class="admin-tag">Admin</span>' : ''}
            ${isMuted ? '<span class="muted-tag">Mutado</span>' : ''}
            ${muteButton}
          </div>
        `;
    }).join('');
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