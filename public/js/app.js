// BizFlow App - FASE 5.1 PRODUÇÃO - VERSÃO CORRIGIDA
class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = localStorage.getItem('bizflow_token');
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        this.socket = null;
        this.cache = new Map();
        this.metricas = {
            requests: 0,
            cacheHits: 0,
            errors: 0,
            responseTime: 0
        };
        
        console.log('🚀 BizFlow App FASE 5.1 - CONSTRUÍDO COM SUCESSO');
    }

    async init() {
        try {
            console.log('🔧 Iniciando BizFlow App...');
            
            // ✅ INICIALIZAÇÃO SEGURA - SEM CHAMAR testarConexao()
            await this.inicializarComponentesBasicos();
            await this.carregarDadosIniciais();
            
            console.log('✅ BizFlow App inicializado com sucesso!');
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
        }
    }

    async inicializarComponentesBasicos() {
        console.log('🔧 Configurando componentes básicos...');
        
        this.configurarEventListeners();
        this.atualizarInterfaceUsuario();
        this.inicializarWebSocket();
    }

    configurarEventListeners() {
        console.log('🔧 Configurando event listeners...');
        
        // Forms principais
        const forms = ['venda-form', 'estoque-form', 'financeiro-form', 'empresa-form'];
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                form.addEventListener('submit', (e) => this.handleFormSubmit(e, formId));
            }
        });
    }

    async carregarDadosIniciais() {
        console.log('📊 Carregando dados iniciais...');
        
        try {
            await Promise.allSettled([
                this.carregarEmpresas(),
                this.carregarProdutos(),
                this.carregarNotificacoes()
            ]);
            
            console.log('✅ Dados iniciais carregados');
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    }

    // ✅ FUNÇÃO testarConexao IMPLEMENTADA
    async testarConexao() {
        console.log('🌐 Testando conexão com API...');
        
        try {
            const startTime = Date.now();
            const response = await fetch('/health');
            const data = await response.json();
            const responseTime = Date.now() - startTime;

            this.metricas.responseTime = responseTime;
            this.atualizarStatusConexao('online', responseTime);
            
            return {
                success: true,
                responseTime,
                status: data.status
            };
        } catch (error) {
            this.metricas.errors++;
            this.atualizarStatusConexao('offline');
            return { success: false, error: error.message };
        }
    }

    async testarConexaoCompleta() {
        console.log('🔍 Teste completo de conexão...');
        
        const resultados = await Promise.allSettled([
            this.testarConexao(),
            this.testarWebSocket(),
            this.testarBancoDados()
        ]);

        const conexaoAPI = resultados[0].status === 'fulfilled' ? resultados[0].value : { success: false };
        const websocket = resultados[1].status === 'fulfilled' ? resultados[1].value : { success: false };
        const banco = resultados[2].status === 'fulfilled' ? resultados[2].value : { success: false };

        this.mostrarResultadoTeste({ conexaoAPI, websocket, banco });
        return { conexaoAPI, websocket, banco };
    }

    async testarWebSocket() {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'WebSocket não conectado' });
                return;
            }

            resolve({ success: true, message: 'WebSocket conectado' });
        });
    }

    async testarBancoDados() {
        try {
            const response = await fetch('/api/test');
            const data = await response.json();
            return { success: data.success, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ✅ WEBSOCKET
    inicializarWebSocket() {
        try {
            this.socket = io(this.API_BASE_URL, {
                auth: {
                    token: this.authToken
                }
            });

            this.socket.on('connect', () => {
                console.log('🔌 WebSocket conectado');
                this.atualizarStatusWebSocket('connected');
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 WebSocket desconectado');
                this.atualizarStatusWebSocket('disconnected');
            });

        } catch (error) {
            console.error('❌ Erro WebSocket:', error);
        }
    }

    // ✅ SISTEMA DE CACHE
    async fetchComCache(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options)}`;
        
        if (this.cache.has(cacheKey)) {
            this.metricas.cacheHits++;
            return this.cache.get(cacheKey);
        }

        try {
            this.metricas.requests++;
            const response = await fetch(url, options);
            const data = await response.json();

            if (data.success) {
                this.cache.set(cacheKey, data);
                setTimeout(() => this.cache.delete(cacheKey), 60000);
            }

            return data;
        } catch (error) {
            this.metricas.errors++;
            throw error;
        }
    }

    invalidarCache() {
        this.cache.clear();
        this.metricas.cacheHits = 0;
        console.log('🗑️ Cache limpo');
    }

    // ✅ GERENCIAMENTO DE EMPRESAS
    async carregarEmpresas() {
        try {
            const data = await this.fetchComCache('/api/empresas');
            
            if (data.success) {
                this.renderizarEmpresas(data.data);
                this.atualizarContadorEmpresas(data.data.length);
            }
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
        }
    }

    renderizarEmpresas(empresas) {
        const container = document.getElementById('lista-empresas');
        if (!container) return;
        
        if (!empresas || empresas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-building fa-3x mb-3"></i>
                    <p>Nenhuma empresa cadastrada</p>
                </div>
            `;
            return;
        }

        container.innerHTML = empresas.map(empresa => `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0">${empresa.nome}</h6>
                            <small class="text-muted">${empresa.cnpj || 'CNPJ não informado'}</small>
                        </div>
                        <span class="badge ${empresa.is_active ? 'bg-success' : 'bg-secondary'}">
                            ${empresa.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    atualizarContadorEmpresas(total) {
        const elementos = ['total-empresas', 'total-empresas-card'];
        
        elementos.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.textContent = total;
            }
        });
    }

    // ✅ GERENCIAMENTO DE PRODUTOS
    async carregarProdutos() {
        try {
            const data = await this.fetchComCache('/api/produtos');
            if (data.success) {
                this.renderizarProdutos(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
        }
    }

    renderizarProdutos(produtos) {
        const container = document.getElementById('lista-estoque');
        if (!container) return;
        
        if (!produtos || produtos.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-box-open fa-3x mb-3"></i>
                    <p>Nenhum produto cadastrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = produtos.map(produto => `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0">${produto.name}</h6>
                            <small class="text-muted">
                                Estoque: ${produto.stock_quantity} | 
                                R$ ${parseFloat(produto.price).toFixed(2)}
                            </small>
                        </div>
                        <span class="badge ${produto.stock_quantity > 0 ? 'bg-success' : 'bg-danger'}">
                            ${produto.stock_quantity > 0 ? 'Disponível' : 'Sem estoque'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ✅ NOTIFICAÇÕES
    async carregarNotificacoes() {
        try {
            const data = await this.fetchComCache('/api/notifications');
            if (data.success) {
                this.renderizarNotificacoes(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    renderizarNotificacoes(notificacoes) {
        const container = document.getElementById('notifications-list');
        const badge = document.getElementById('notification-count');
        
        if (!container || !badge) return;

        const naoLidas = notificacoes ? notificacoes.filter(n => !n.is_read) : [];
        badge.textContent = naoLidas.length;
        badge.classList.toggle('d-none', naoLidas.length === 0);

        if (!notificacoes || notificacoes.length === 0) {
            container.innerHTML = '<li class="px-3 py-2 text-muted text-center">Nenhuma notificação</li>';
            return;
        }

        container.innerHTML = notificacoes.map(notif => `
            <li>
                <a class="dropdown-item ${notif.is_read ? '' : 'fw-bold'}" href="#">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${notif.title}</h6>
                        <small>${new Date(notif.created_at).toLocaleTimeString()}</small>
                    </div>
                    <p class="mb-1 small">${notif.message}</p>
                </a>
            </li>
        `).join('');
    }

    // ✅ UTILITÁRIOS
    atualizarStatusConexao(status, responseTime = 0) {
        const elemento = document.getElementById('status-conexao');
        if (!elemento) return;

        elemento.className = `connection-status status-${status}`;
        elemento.innerHTML = status === 'online' 
            ? `<i class="fas fa-wifi me-1"></i>Online (${responseTime}ms)`
            : `<i class="fas fa-wifi-slash me-1"></i>Offline`;
    }

    atualizarStatusWebSocket(status) {
        const elemento = document.getElementById('status-websocket');
        if (!elemento) return;

        elemento.className = `websocket-status websocket-${status}`;
        elemento.innerHTML = `<i class="fas fa-plug me-1"></i>WebSocket`;
    }

    async handleFormSubmit(event, formId) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        try {
            const response = await fetch(`/api/${formId.replace('-form', '')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(formData))
            });

            const data = await response.json();

            if (data.success) {
                this.mostrarAlerta('Operação realizada com sucesso!', 'success');
                form.reset();
                this.invalidarCache();
                this.carregarDadosIniciais();
            } else {
                throw new Error(data.error || 'Erro na operação');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        }
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        alert(`[${tipo.toUpperCase()}] ${mensagem}`);
    }

    mostrarResultadoTeste(resultados) {
        const mensagem = `
            📊 Resultado Teste:
            ✅ API: ${resultados.conexaoAPI.success ? 'OK' : 'FALHA'}
            🔌 WebSocket: ${resultados.websocket.success ? 'OK' : 'FALHA'}
            🗄️ Banco: ${resultados.banco.success ? 'OK' : 'FALHA'}
        `;
        this.mostrarAlerta(mensagem, 'info');
    }

    atualizarInterfaceUsuario() {
        if (this.currentUser) {
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = this.currentUser.full_name;
            }
        }
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    marcarTodasNotificacoesComoLidas() {
        const badge = document.getElementById('notification-count');
        if (badge) {
            badge.classList.add('d-none');
        }
        this.mostrarAlerta('Notificações marcadas como lidas', 'success');
    }
}

// ✅ INICIALIZAÇÃO GLOBAL SIMPLIFICADA
document.addEventListener('DOMContentLoaded', function() {
    console.log('👤 DOM Carregado - Verificando autenticação...');
    
    const token = localStorage.getItem('bizflow_token');
    const user = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
    
    if (token && user) {
        console.log('✅ Usuário autenticado - inicializando app');
        window.bizFlowApp = new BizFlowApp();
        
        // Inicialização segura
        setTimeout(() => {
            window.bizFlowApp.init();
        }, 100);
    }
});

// ✅ FUNÇÕES GLOBAIS
window.testarConexoes = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.testarConexaoCompleta();
    }
};

window.limparCache = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.invalidarCache();
        window.bizFlowApp.mostrarAlerta('Cache limpo com sucesso!', 'success');
    }
};

window.carregarDashboard = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.carregarDadosIniciais();
    }
};

window.marcarTodasComoLidas = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.marcarTodasNotificacoesComoLidas();
    }
};
