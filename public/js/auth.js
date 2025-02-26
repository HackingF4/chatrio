// Configuração da API
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : '/api'; // Usa o proxy do Netlify

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

        return response.ok;
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        return false;
    }
};

// Função para verificar autenticação
const checkAuthentication = async () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
        try {
            // Verificar se o token é válido
            const isValid = await verifyToken(token);
            
            if (isValid) {
                // Se estiver na página de login, redirecionar para o chat
                if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                    window.location.href = '/chat.html';
                    return true;
                }
            } else {
                // Se o token não for válido, limpar dados
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
        }
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
        window.location.href = '/chat.html';
    } catch (error) {
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
        window.location.href = '/chat.html';
    } catch (error) {
        alert(error.message);
    }
};

// Função para fazer logout
const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear(); // Limpar cache de mensagens
    window.location.href = '/';
};

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação primeiro
    await checkAuthentication();

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Formulário de Login
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            login(email, password);
        });
    }

    // Formulário de Registro
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                alert('As senhas não coincidem');
                return;
            }

            register(username, email, password);
        });
    }
}); 