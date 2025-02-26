// Configuração da API
const API_URL = 'http://localhost:3000/api';

// Função para salvar o token no localStorage
const setToken = (token) => {
    localStorage.setItem('token', token);
};

// Função para obter o token do localStorage
const getToken = () => {
    return localStorage.getItem('token');
};

// Função para verificar se o usuário está logado
const isAuthenticated = () => {
    const token = getToken();
    if (!token) {
        window.location.href = '/';
        return false;
    }
    return true;
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
        
        window.location.href = '/batepapo.html';
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
        
        window.location.href = '/batepapo.html';
    } catch (error) {
        console.error('Erro no registro:', error);
        alert(error.message);
    }
};

// Função para fazer logout
const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
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

    // Verificar autenticação na página de batepapo
    if (window.location.pathname.includes('batepapo.html')) {
        isAuthenticated();
    }
}); 