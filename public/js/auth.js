// Configuração da API
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://web-production-fa86.up.railway.app/api';

// Função para verificar se o token é válido
const verifyToken = async (token) => {
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
        return { valid: true, user: data.user };
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        return { valid: false };
    }
};

// Função para verificar autenticação
const checkAuthentication = async () => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
        try {
            // Verificar se o token é válido
            const { valid, user } = await verifyToken(token);
            
            if (valid) {
                // Atualizar dados do usuário se necessário
                const currentUser = JSON.parse(savedUser);
                if (user && JSON.stringify(user) !== JSON.stringify(currentUser)) {
                    localStorage.setItem('user', JSON.stringify(user));
                }

                // Se estiver na página de login ou index, redirecionar para o chat
                const path = window.location.pathname;
                if (path === '/' || path === '/index.html' || path.includes('login')) {
                    window.location.href = '/chat.html';
                    return true;
                }
                return true;
            } else {
                // Se o token não for válido, limpar dados e redirecionar
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                sessionStorage.clear();
                if (window.location.pathname.includes('chat.html')) {
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            if (window.location.pathname.includes('chat.html')) {
                window.location.href = '/';
            }
        }
    } else if (window.location.pathname.includes('chat.html')) {
        // Se não tiver token e estiver na página do chat, redirecionar para login
        window.location.href = '/';
    }
    return false;
};

// Função para salvar o token no localStorage
const setToken = (token) => {
    localStorage.setItem('token', token);
};

// Função para obter o token do localStorage
const getToken = () => {
    return localStorage.getItem('token');
};

// Função para fazer login
const login = async (email, password) => {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao fazer login');
        }

        setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Limpar qualquer cache antigo
        sessionStorage.clear();
        
        window.location.href = '/chat.html';
    } catch (error) {
        console.error('Erro no login:', error);
        alert(error.message);
    }
};

// Função para registrar
const register = async (username, email, password) => {
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao registrar');
        }

        setToken(data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Limpar qualquer cache antigo
        sessionStorage.clear();
        
        window.location.href = '/chat.html';
    } catch (error) {
        console.error('Erro no registro:', error);
        alert(error.message);
    }
};

// Função para fazer logout
const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.href = '/';
};

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verificar autenticação primeiro
        await checkAuthentication();

        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        // Formulário de Login
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                await login(email, password);
            });
        }

        // Formulário de Registro
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const confirmPassword = document.getElementById('confirmPassword').value;

                if (password !== confirmPassword) {
                    alert('As senhas não coincidem');
                    return;
                }

                await register(username, email, password);
            });
        }
    } catch (error) {
        console.error('Erro na inicialização:', error);
    }
}); 