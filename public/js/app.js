// BizFlow App - FASE 5.1 PRODUÇÃO - CORREÇÃO DEFINITIVA
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
        
        this.configuracoes = {
            websocket: true,
            cache: true,
            retryAuto: true,
            tema: 'light'
        };

        this.carregarConfiguracoes();
        console.log('🚀 BizFlow App FASE 5.1 inicializado - SISTEMA DE PRODUÇÃO');
    }

    async init() {
        try {
            console.log('🔧 Inicializando componentes FASE 5.1...');
            
            // ✅ INICIALIZAÇÃO SEGURA
            await this.inicializarComponentes();
            await this.carregarDadosIniciaisFase5();
            this.inicializarWebSocket();
            this.iniciarMonitoramento();
            
            console.log('✅ BizFlow App FASE 5.1 inicializado com sucesso!');
        } catch (error) {
            console.error('❌ Erro ao inicializar app FASE 5.1:', error);
            this.mostrarAlerta('Sistema inicializado com limitações', 'warning');
        }
    }

    async inicializarComponentes() {
        // ✅ INICIALIZAÇÃO SEGURA SEM DEPENDÊNCIAS EXTERNAS
        this.setupEventListeners();
        this.atualizarInterfaceUsuario();
    }

    setupEventListeners() {
        console.log('🔧 Configurando event listeners...');
        
        // Forms principais
        const forms = ['venda-form', 'estoque-form', 'financeiro-form', 'empresa-form'];
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                form.addEventListener('submit', (e) => this.handleFormSubmit(e, formId));
            }
        });

        // Navegação
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                this.scrollToSection(targetId);
            });
        });
    }

    async carregarDadosIniciaisFase5() {
        console.log('📊 Carregando dados FASE 5.1...');
        
        try {
            await Promise.all([
                this.carregarEmpresas(),
                this.carregarProdutos(),
                this.carregarNotificacoes(),
                this.atualizarMetricasDashboard()
            ]);
            
            this.mostrarAlerta('Sistema FASE 5.1 carregado!', 'success');
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    }

    // ✅ FUNÇÕES DE CONEXÃO CORRIGIDAS
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
        console.log('🔍 Teste completo de conexão FASE 5.1...');
        
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

            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'Timeout WebSocket' });
            }, 5000);

            this.socket.emit('ping', { timestamp: Date.now() }, (response) => {
                clearTimeout(timeout);
                resolve({ success: true, latency: Date.now() - response.timestamp });
            });
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

    // ✅ WEBSOCKET CORRIGIDO
    inicializarWebSocket() {
        if (!this.configuracoes.websocket) {
            console.log('🔌 WebSocket desativado nas configurações');
            return;
        }

        try {
            this.socket = io(this.API_BASE_URL, {
                auth: {
                    token: this.authToken
                }
            });

            this.socket.on('connect', () => {
                console.log('🔌 WebSocket conectado FASE 5.1');
                this.atualizarStatusWebSocket('connected');
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 WebSocket desconectado');
                this.atualizarStatusWebSocket('disconnected');
            });

            this.socket.on('authenticated', (data) => {
                if (data.success) {
                    console.log('✅ WebSocket autenticado');
                } else {
                    console.error('❌ Falha na autenticação WebSocket');
                }
            });

            this.socket.on('notification', (data) => {
                this.processarNovaNotificacao(data);
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar WebSocket:', error);
        }
    }

    // ✅ SISTEMA DE CACHE FASE 5.1
    async fetchComCache(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options)}`;
        
        if (this.configuracoes.cache && this.cache.has(cacheKey)) {
            this.metricas.cacheHits++;
            return this.cache.get(cacheKey);
        }

        try {
            this.metricas.requests++;
            const response = await fetch(url, options);
            const data = await response.json();

            if (this.configuracoes.cache && data.success) {
                this.cache.set(cacheKey, data);
                // Cache por 1 minuto
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
        console.log('🗑️ Cache limpo FASE 5.1');
    }

    // ✅ MÉTRICAS E MONITORAMENTO
    iniciarMonitoramento() {
        // Atualizar métricas a cada 30 segundos
        setInterval(() => this.atualizarMetricasDashboard(), 30000);
        
        // Teste de conexão a cada minuto
        setInterval(() => this.testarConexao(), 60000);
    }

    atualizarMetricasDashboard() {
        document.getElementById('metric-requests').textContent = this.metricas.requests;
        document.getElementById('metric-cache').textContent = this.metricas.cacheHits;
        document.getElementById('metric-errors').textContent = this.metricas.errors;
        document.getElementById('metric-response').textContent = `${this.metricas.responseTime}ms`;
    }

    // ✅ GERENCIAMENTO DE EMPRESAS
    async carregarEmpresas() {
        try {
            const data = await this.fetchComCache('/api/empresas');
            
            if (data.success) {
                this.renderizarEmpresas(data.data);
                document.getElementById('total-empresas').textContent = data.data.length;
                document.getElementById('total-empresas-card').textContent = data.data.length;
            }
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
        }
    }

    renderizarEmpresas(empresas) {
        const container = document.getElementById('lista-empresas');
        
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
        
        const naoLidas = notificacoes.filter(n => !n.is_read);
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
                    <small class="text-${notif.type === 'error' ? 'danger' : notif.type === 'warning' ? 'warning' : 'success'}">
                        ${notif.type}
                    </small>
                </a>
            </li>
        `).join('');
    }

    processarNovaNotificacao(notificacao) {
        this.mostrarAlerta(`Nova notificação: ${notificacao.title}`, 'info');
        this.carregarNotificacoes(); // Recarregar lista
    }

    marcarTodasNotificacoesComoLidas() {
        // Implementação simplificada
        const badge = document.getElementById('notification-count');
        badge.classList.add('d-none');
        this.mostrarAlerta('Notificações marcadas como lidas', 'success');
    }

    // ✅ CONFIGURAÇÕES
    carregarConfiguracoes() {
        const saved = localStorage.getItem('bizflow_config');
        if (saved) {
            this.configuracoes = { ...this.configuracoes, ...JSON.parse(saved) };
        }
        this.aplicarConfiguracoes();
    }

    salvarConfiguracoes() {
        localStorage.setItem('bizflow_config', JSON.stringify(this.configuracoes));
    }

    aplicarConfiguracoes() {
        // Aplicar tema
        document.body.setAttribute('data-bs-theme', this.configuracoes.tema);
        
        // Aplicar outras configurações
        if (!this.configuracoes.websocket && this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
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
        const textos = {
            connected: '<i class="fas fa-plug me-1"></i>WebSocket',
            disconnected: '<i class="fas fa-plug me-1"></i>WebSocket',
            connecting: '<i class="fas fa-plug me-1"></i>Conectando',
            error: '<i class="fas fa-plug me-1"></i>Erro'
        };
        elemento.innerHTML = textos[status] || textos.disconnected;
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
                this.invalidarCache(); // Forçar atualização
                this.carregarDadosIniciaisFase5();
            } else {
                throw new Error(data.error || 'Erro na operação');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        }
    }

    scrollToSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        // Implementação simples - pode ser substituída por um sistema de toasts
        const alerta = document.createElement('div');
        alerta.className = `alert alert-${tipo} alert-dismissible fade show`;
        alerta.innerHTML = `
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        const container = document.querySelector('.container');
        container.insertBefore(alerta, container.firstChild);
        
        setTimeout(() => {
            if (alerta.parentNode) {
                alerta.remove();
            }
        }, 5000);
    }

    mostrarResultadoTeste(resultados) {
        const mensagem = `
            📊 Resultado Teste FASE 5.1:
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
}

// ✅ INICIALIZAÇÃO GLOBAL
document.addEventListener('DOMContentLoaded', function() {
    console.log('👤 Verificando autenticação...');
    
    // Verificar se há token de autenticação
    const token = localStorage.getItem('bizflow_token');
    const user = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
    
    if (token && user) {
        console.log('✅ Usuário autenticado - inicializando app FASE 5.1');
        window.bizFlowApp = new BizFlowApp();
        window.bizFlowApp.init().catch(error => {
            console.error('❌ Falha na inicialização do app:', error);
        });
    } else {
        console.log('👤 Usuário não autenticado - carregando interface pública');
    }
});

// ✅ FUNÇÕES GLOBAIS PARA HTML
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
        window.bizFlowApp.carregarDadosIniciaisFase5();
    }
};
