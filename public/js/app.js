// BizFlow App - FASE 5.1 SIMPLIFICADO
class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = localStorage.getItem('bizflow_token');
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        
        console.log('🚀 BizFlow App inicializado');
        this.init();
    }

    async init() {
        if (this.authToken && this.currentUser) {
            console.log('✅ Usuário autenticado:', this.currentUser.username);
            this.showApp();
        } else {
            console.log('👤 Usuário não autenticado');
            this.showLogin();
        }
    }

    async fazerLogin(username, password) {
        try {
            console.log('🔐 Tentando login...');
            
            const response = await fetch(`${this.API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.authToken = data.data.session_token;
                this.currentUser = data.data.user;
                
                localStorage.setItem('bizflow_token', this.authToken);
                localStorage.setItem('bizflow_user', JSON.stringify(this.currentUser));
                
                this.mostrarAlerta('Login realizado com sucesso!', 'success');
                location.reload();
                return true;
            } else {
                this.mostrarAlerta(data.error, 'danger');
                return false;
            }
        } catch (error) {
            this.mostrarAlerta('Erro de conexão', 'danger');
            return false;
        }
    }

    fazerLogout() {
        localStorage.removeItem('bizflow_token');
        localStorage.removeItem('bizflow_user');
        this.mostrarAlerta('Logout realizado', 'info');
        location.reload();
    }

    showApp() {
        document.querySelector('.auth-container').style.display = 'none';
        document.querySelector('.app-container').style.display = 'block';
        if (this.currentUser) {
            document.getElementById('user-name').textContent = this.currentUser.full_name;
        }
    }

    showLogin() {
        document.querySelector('.auth-container').style.display = 'flex';
        document.querySelector('.app-container').style.display = 'none';
    }

    mostrarAlerta(mensagem, tipo) {
        alert(`[${tipo}] ${mensagem}`);
    }
}

// Funções globais
function fazerLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        alert('Preencha usuário e senha');
        return;
    }
    
    window.bizFlowApp.fazerLogin(username, password);
}

function fazerLogout() {
    window.bizFlowApp.fazerLogout();
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    window.bizFlowApp = new BizFlowApp();
});
