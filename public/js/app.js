// BizFlow - Sistema Empresarial - FASE 5.1 COMPLETA
// JavaScript Application Controller com Sistema de Produção

class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = null;
        this.currentUser = null;
        this.empresaAtual = { id: 1, nome: 'Empresa Principal' };
        this.socket = null;
        this.isOnline = true;
        this.isWebSocketConnected = false;
        this.notifications = [];
        
        console.log('🚀 BizFlow App FASE 5.1 inicializado');
    }

    async init() {
        try {
            console.log('🔧 Inicializando BizFlow App FASE 5.1...');
            
            // Verificar autenticação
            if (!this.authToken) {
                console.log('👤 Usuário não autenticado - modo público');
                return;
            }
            
            // Testar conexão com a API
            await this.testarConexao();
            
            // Conectar WebSocket
            this.conectarWebSocket();
            
            // Carregar dados iniciais
            await this.carregarDadosIniciais();
            
            console.log('✅ BizFlow App FASE 5.1 inicializado com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar app FASE 5.1:', error);
        }
    }

    // ================= WEBSOCKET FASE 5.1 =================
    conectarWebSocket() {
        try {
            console.log('🔌 Conectando WebSocket...');
            
            this.socket = io(this.API_BASE_URL);

            this.socket.on('connect', () => {
                console.log('🔌 Conectado ao WebSocket');
                this.isWebSocketConnected = true;
                this.atualizarStatusWebSocket('connected', 'WebSocket Conectado');
                
                // Autenticar WebSocket
                if (this.authToken) {
                    this.socket.emit('authenticate', { token: this.authToken });
                }
            });

            this.socket.on('authenticated', (data) => {
                if (data.success) {
                    console.log('✅ Autenticado no WebSocket');
                }
            });

            this.socket.on('notification', (notification) => {
                console.log('🔔 Nova notificação:', notification);
                this.mostrarAlerta(`Nova notificação: ${notification.title}`, 'info');
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 Desconectado do WebSocket');
                this.isWebSocketConnected = false;
                this.atualizarStatusWebSocket('disconnected', 'WebSocket Desconectado');
            });

        } catch (error) {
            console.error('❌ Erro ao conectar WebSocket:', error);
        }
    }

    // ================= AUTENTICAÇÃO =================
    async fazerLogin(username, password) {
        try {
            console.log('🔐 Tentando login para:', username);
            
            const response = await fetch(`${this.API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // Salvar token e usuário
                this.authToken = data.data.session_token;
                this.currentUser = data.data.user;
                
                localStorage.setItem('bizflow_token', this.authToken);
                localStorage.setItem('bizflow_user', JSON.stringify(this.currentUser));
                
                console.log('✅ Login realizado com sucesso!');
                this.mostrarAlerta('Login realizado com sucesso!', 'success');
                
                // Recarregar a aplicação
                this.init();
                
                return true;
            } else {
                console.error('❌ Erro no login:', data.error);
                this.mostrarAlerta(data.error, 'danger');
                return false;
            }
            
        } catch (error) {
            console.error('💥 Erro crítico no login:', error);
            this.mostrarAlerta('Erro de conexão com o servidor', 'danger');
            return false;
        }
    }

    fazerLogout() {
        this.authToken = null;
        this.currentUser = null;
        this.isWebSocketConnected = false;
        
        localStorage.removeItem('bizflow_token');
        localStorage.removeItem('bizflow_user');
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        console.log('👋 Logout realizado');
        this.mostrarAlerta('Logout realizado com sucesso!', 'info');
        
        // Recarregar a página
        setTimeout(() => location.reload(), 1000);
    }

    // ================= CARREGAMENTO DE DADOS =================
    async carregarDadosIniciais() {
        try {
            console.log('📥 Carregando dados iniciais...');
            
            await Promise.allSettled([
                this.carregarEmpresas(),
                this.carregarProdutos(),
                this.carregarNotificacoes()
            ]);
            
            console.log('✅ Dados iniciais carregados');
        } catch (error) {
            console.warn('⚠️ Erro ao carregar dados iniciais:', error);
        }
    }

    async carregarEmpresas() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/empresas`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.empresas = data.data;
                    this.exibirEmpresas(this.empresas);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
        }
    }

    async carregarProdutos() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/produtos`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.exibirProdutos(data.data);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
        }
    }

    async carregarNotificacoes() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/notifications`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.exibirNotificacoes(data.data);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    // ================= EXIBIÇÃO DE DADOS =================
    exibirEmpresas(empresas) {
        const container = document.getElementById('lista-empresas');
        if (container && empresas) {
            const html = empresas.map(empresa => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${empresa.nome}</h6>
                            <small class="text-muted">${empresa.cnpj || 'Sem CNPJ'}</small>
                        </div>
                    </div>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }

    exibirProdutos(produtos) {
        const container = document.getElementById('lista-estoque');
        if (container && produtos) {
            const html = produtos.map(produto => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${produto.name}</h6>
                            <small class="text-muted">R$ ${produto.price} • Estoque: ${produto.stock_quantity}</small>
                        </div>
                    </div>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }

    exibirNotificacoes(notifications) {
        const container = document.getElementById('notifications-list');
        const badge = document.getElementById('notification-count');
        
        if (!notifications || notifications.length === 0) {
            if (container) container.innerHTML = '<li class="px-3 py-2 text-muted text-center">Nenhuma notificação</li>';
            if (badge) badge.textContent = '0';
            return;
        }

        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (badge) badge.textContent = unreadCount;

        if (container) {
            const html = notifications.map(notification => {
                const timeAgo = this.formatTimeAgo(new Date(notification.created_at));
                
                return `
                    <li>
                        <div class="notification-item">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <h6 class="mb-1">${notification.title}</h6>
                                    <p class="mb-1">${notification.message}</p>
                                    <small class="text-muted">${timeAgo}</small>
                                </div>
                            </div>
                        </div>
                    </li>
                `;
            }).join('');

            container.innerHTML = html;
        }
    }

    // ================= UTILITÁRIOS =================
    setAuthToken(token) {
        this.authToken = token;
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        return headers;
    }

    async testarConexao() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/health`);
            if (!response.ok) throw new Error('API não responde');
            console.log('✅ Conexão com API estabelecida');
            return true;
        } catch (error) {
            console.error('❌ Erro na conexão com API:', error);
            return false;
        }
    }

    testarWebSocket() {
        if (this.isWebSocketConnected) {
            this.mostrarAlerta('WebSocket conectado e funcionando! ✅', 'success');
        } else {
            this.mostrarAlerta('WebSocket desconectado', 'warning');
        }
    }

    testarConexaoCompleta() {
        this.mostrarAlerta('Testando conexões...', 'info');
        this.testarConexao();
        this.testarWebSocket();
    }

    atualizarStatusWebSocket(status, mensagem) {
        const elemento = document.getElementById('status-websocket');
        if (elemento) {
            elemento.className = `websocket-status websocket-${status}`;
            elemento.innerHTML = `<i class="fas fa-${status === 'connected' ? 'check' : 'exclamation-triangle'} me-1"></i>${mensagem}`;
        }
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);

        if (diffMins < 1) return 'Agora mesmo';
        if (diffMins < 60) return `${diffMins} min atrás`;
        if (diffHours < 24) return `${diffHours} h atrás`;
        
        return date.toLocaleDateString('pt-BR');
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        alert(`[${tipo.toUpperCase()}] ${mensagem}`);
    }
}

// ================= FUNÇÕES GLOBAIS =================
function fazerLogin() {
    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;
    
    if (!username || !password) {
        alert('Por favor, preencha username e password');
        return;
    }
    
    if (window.bizFlowApp) {
        window.bizFlowApp.fazerLogin(username, password);
    }
}

function fazerLogout() {
    if (window.bizFlowApp) {
        window.bizFlowApp.fazerLogout();
    }
}

function testarConexoes() {
    if (window.bizFlowApp) {
        window.bizFlowApp.testarConexaoCompleta();
    }
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    window.bizFlowApp = new BizFlowApp();
    
    // Verificar se há token de autenticação
    const token = localStorage.getItem('bizflow_token');
    const user = localStorage.getItem('bizflow_user');
    
    if (token && user) {
        window.bizFlowApp.setAuthToken(token);
        window.bizFlowApp.init();
    }
});
