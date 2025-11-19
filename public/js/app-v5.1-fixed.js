// BizFlow App - FASE 5.1 PRODUÇÃO - VERSÃO 100% OTIMIZADA
console.log('✅ BizFlow App FASE 5.1 - SISTEMA DE PRODUÇÃO CARREGADO!');

class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = localStorage.getItem('bizflow_token');
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        this.socket = null;
        this.cache = new Map();
        this.metrics = {
            requests: 0,
            cacheHits: 0,
            errors: 0,
            responseTimes: []
        };
        
        // Configurações FASE 5.1
        this.configuracoes = {
            cacheAtivo: true,
            retryAuto: true,
            maxRetries: 3,
            timeout: 10000,
            tema: localStorage.getItem('bizflow_tema') || 'light'
        };
        
        console.log('🚀 BizFlow App FASE 5.1 - Sistema de Produção Inicializado');
    }

    async init() {
        try {
            console.log('🔧 Iniciando BizFlow App FASE 5.1...');
            
            this.aplicarConfiguracoes();
            this.configurarEventListeners();
            this.inicializarWebSocket();
            this.atualizarInterfaceUsuario();
            await this.carregarDadosIniciais();
            this.iniciarMonitoramento();
            
            console.log('✅ BizFlow App FASE 5.1 inicializado com sucesso!');
        } catch (error) {
            console.error('❌ Erro na inicialização FASE 5.1:', error);
            this.mostrarAlerta('Erro ao inicializar sistema', 'danger');
        }
    }

    aplicarConfiguracoes() {
        // Aplicar tema
        document.body.setAttribute('data-bs-theme', this.configuracoes.tema);
        
        // Atualizar switches na modal de configurações
        if (document.getElementById('config-cache')) {
            document.getElementById('config-cache').checked = this.configuracoes.cacheAtivo;
        }
        if (document.getElementById('config-retry')) {
            document.getElementById('config-retry').checked = this.configuracoes.retryAuto;
        }
        if (document.getElementById('config-tema')) {
            document.getElementById('config-tema').value = this.configuracoes.tema;
        }
    }

    salvarConfiguracoes() {
        localStorage.setItem('bizflow_config', JSON.stringify(this.configuracoes));
    }

    configurarEventListeners() {
        console.log('🔧 Configurando event listeners FASE 5.1...');
        
        // Forms principais
        const forms = ['venda-form', 'estoque-form', 'financeiro-form', 'empresa-form', 'filial-form'];
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                form.addEventListener('submit', (e) => this.handleFormSubmit(e, formId));
            }
        });

        // Event listeners para relatórios
        const reportButtons = document.querySelectorAll('[onclick*="carregarRelatorio"]');
        reportButtons.forEach(btn => {
            const originalOnClick = btn.getAttribute('onclick');
            btn.removeAttribute('onclick');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                eval(originalOnClick);
            });
        });
    }

    inicializarWebSocket() {
        try {
            this.socket = io(this.API_BASE_URL, {
                transports: ['websocket', 'polling'],
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('🔌 WebSocket conectado FASE 5.1');
                this.atualizarStatusWebSocket('connected');
                
                // Entrar na sala da empresa atual
                if (this.currentUser?.empresa_id) {
                    this.socket.emit('join-empresa', this.currentUser.empresa_id);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('🔌 WebSocket desconectado');
                this.atualizarStatusWebSocket('disconnected');
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Erro WebSocket:', error);
                this.atualizarStatusWebSocket('error');
            });

            this.socket.on('venda-atualizada', (data) => {
                this.mostrarAlerta('Nova venda registrada no sistema!', 'info');
                this.carregarDadosIniciais(); // Atualizar dados
            });

            this.socket.on('notificacao-nova', (notificacao) => {
                this.mostrarAlerta(`Nova notificação: ${notificacao.titulo}`, 'warning');
                this.carregarNotificacoes();
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar WebSocket:', error);
        }
    }

    atualizarStatusWebSocket(status) {
        const elemento = document.getElementById('status-websocket');
        if (!elemento) return;

        elemento.className = 'websocket-status';
        
        switch (status) {
            case 'connected':
                elemento.classList.add('websocket-connected');
                elemento.innerHTML = '<i class="fas fa-plug me-1"></i>WebSocket Conectado';
                break;
            case 'disconnected':
                elemento.classList.add('websocket-disconnected');
                elemento.innerHTML = '<i class="fas fa-plug me-1"></i>WebSocket Offline';
                break;
            case 'connecting':
                elemento.classList.add('websocket-connecting');
                elemento.innerHTML = '<i class="fas fa-plug me-1"></i>Conectando...';
                break;
            case 'error':
                elemento.classList.add('websocket-error');
                elemento.innerHTML = '<i class="fas fa-plug me-1"></i>Erro Conexão';
                break;
        }
    }

    async carregarDadosIniciais() {
        console.log('📊 Carregando dados iniciais FASE 5.1...');
        
        try {
            await Promise.allSettled([
                this.carregarDashboard(),
                this.carregarEmpresas(),
                this.carregarProdutos(),
                this.carregarNotificacoes(),
                this.carregarVendas()
            ]);
        } catch (error) {
            console.error('Erro ao carregar dados iniciais:', error);
        }
    }

    // ✅✅✅ FUNÇÃO testarConexao OTIMIZADA FASE 5.1 ✅✅✅
    async testarConexao() {
        console.log('🌐 TESTANDO CONEXÃO FASE 5.1 - SISTEMA DE PRODUÇÃO!');
        
        const startTime = Date.now();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('/health', {
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            clearTimeout(timeoutId);
            
            const data = await response.json();
            const responseTime = Date.now() - startTime;

            // Atualizar métricas
            this.metrics.requests++;
            this.metrics.responseTimes.push(responseTime);
            this.atualizarMetricasUI();

            return {
                success: true,
                responseTime,
                status: data.status,
                environment: data.environment,
                version: data.version
            };
        } catch (error) {
            this.metrics.errors++;
            this.atualizarMetricasUI();
            
            return { 
                success: false, 
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    async testarConexaoCompleta() {
        console.log('🔍 Teste completo de conexão FASE 5.1...');
        
        this.mostrarAlerta('Iniciando teste completo de conexão...', 'info');

        const resultados = await Promise.allSettled([
            this.testarConexao(),
            this.testarWebSocket(),
            this.testarBancoDados()
        ]);

        const conexaoAPI = resultados[0].status === 'fulfilled' ? resultados[0].value : { success: false };
        const websocket = resultados[1].status === 'fulfilled' ? resultados[1].value : { success: false };
        const bancoDados = resultados[2].status === 'fulfilled' ? resultados[2].value : { success: false };

        this.mostrarResultadoTeste({ conexaoAPI, websocket, bancoDados });
        return { conexaoAPI, websocket, bancoDados };
    }

    async testarWebSocket() {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({ success: false, error: 'WebSocket não inicializado' });
                return;
            }

            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'Timeout WebSocket' });
            }, 3000);

            if (this.socket.connected) {
                clearTimeout(timeout);
                resolve({ 
                    success: true, 
                    message: 'WebSocket conectado',
                    id: this.socket.id
                });
            } else {
                this.socket.once('connect', () => {
                    clearTimeout(timeout);
                    resolve({ 
                        success: true, 
                        message: 'WebSocket conectado',
                        id: this.socket.id
                    });
                });

                this.socket.once('connect_error', (error) => {
                    clearTimeout(timeout);
                    resolve({ success: false, error: error.message });
                });
            }
        });
    }

    async testarBancoDados() {
        try {
            const startTime = Date.now();
            const response = await fetch('/api/status');
            const data = await response.json();
            const responseTime = Date.now() - startTime;

            if (data.success) {
                return {
                    success: true,
                    responseTime,
                    connections: data.data.database.connections,
                    status: data.data.database.status
                };
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ✅ SISTEMA DE CACHE FASE 5.1
    async fetchComCache(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options)}`;
        
        // Verificar cache
        if (this.configuracoes.cacheAtivo && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 30000) { // 30 segundos
                this.metrics.cacheHits++;
                this.atualizarMetricasUI();
                console.log('📦 Cache hit:', url);
                return cached.data;
            }
        }

        // Fazer requisição
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.authToken}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Armazenar em cache
            if (this.configuracoes.cacheAtivo && data.success) {
                this.cache.set(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });
            }

            return data;
        } catch (error) {
            console.error('❌ Erro na requisição:', error);
            throw error;
        }
    }

    invalidarCache() {
        this.cache.clear();
        this.metrics.cacheHits = 0;
        this.atualizarMetricasUI();
        console.log('🧹 Cache invalidado');
    }

    // ✅ GERENCIAMENTO DE EMPRESAS
    async carregarEmpresas() {
        try {
            const data = await this.fetchComCache('/api/empresas');
            if (data.success) {
                this.renderizarEmpresas(data.data);
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
                        <span class="badge bg-success">Ativa</span>
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
                                Estoque: ${produto.stock_quantity} | R$ ${parseFloat(produto.price).toFixed(2)}
                            </small>
                        </div>
                        <span class="badge bg-${produto.stock_quantity > 10 ? 'success' : produto.stock_quantity > 0 ? 'warning' : 'danger'}">
                            ${produto.stock_quantity} un
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ✅ VENDAS
    async carregarVendas() {
        try {
            const data = await this.fetchComCache('/api/vendas');
            if (data.success) {
                this.renderizarVendas(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar vendas:', error);
        }
    }

    renderizarVendas(vendas) {
        const container = document.getElementById('lista-vendas');
        if (!container) return;
        
        if (!vendas || vendas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-receipt fa-3x mb-3"></i>
                    <p>Nenhuma venda registrada</p>
                </div>
            `;
            return;
        }

        container.innerHTML = vendas.map(venda => `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0">Venda #${venda.sale_code}</h6>
                            <small class="text-muted">
                                ${new Date(venda.sale_date).toLocaleDateString('pt-BR')} | 
                                R$ ${parseFloat(venda.total_amount).toFixed(2)}
                            </small>
                        </div>
                        <span class="badge bg-success">${venda.payment_method}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ✅ DASHBOARD
    async carregarDashboard() {
        try {
            const data = await this.fetchComCache('/api/dashboard');
            if (data.success) {
                this.renderizarDashboard(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        }
    }

    renderizarDashboard(dados) {
        // Atualizar métricas do dashboard
        const metrics = [
            { id: 'total-empresas', value: dados.total_empresas },
            { id: 'total-produtos', value: dados.total_produtos },
            { id: 'total-vendas', value: dados.total_vendas },
            { id: 'total-usuarios', value: dados.total_usuarios },
            { id: 'faturamento-total', value: dados.faturamento_total },
            { id: 'total-contas', value: dados.total_contas }
        ];

        metrics.forEach(metric => {
            const element = document.getElementById(metric.id);
            if (element) {
                if (metric.id === 'faturamento-total') {
                    element.textContent = `R$ ${parseFloat(metric.value).toFixed(2)}`;
                } else {
                    element.textContent = metric.value;
                }
            }
        });
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
                        <small>${new Date(notif.created_at).toLocaleTimeString('pt-BR')}</small>
                    </div>
                    <p class="mb-1 small">${notif.message}</p>
                    <small class="text-muted">${notif.type || 'Sistema'}</small>
                </a>
            </li>
        `).join('');
    }

    // ✅ MANIPULAÇÃO DE FORMULÁRIOS
    async handleFormSubmit(event, formId) {
        event.preventDefault();
        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        try {
            // Mostrar loading
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Processando...';

            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            const response = await fetch(`/api/${formId.replace('-form', '')}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.mostrarAlerta(result.message || 'Operação realizada com sucesso!', 'success');
                form.reset();
                this.invalidarCache(); // Invalidar cache para atualizar dados
                await this.carregarDadosIniciais();
                
                // Emitir evento WebSocket se for uma venda
                if (formId === 'venda-form' && this.socket) {
                    this.socket.emit('nova-venda', {
                        empresa_id: this.currentUser?.empresa_id,
                        ...data
                    });
                }
            } else {
                throw new Error(result.error || 'Erro na operação');
            }
        } catch (error) {
            console.error('❌ Erro no formulário:', error);
            this.mostrarAlerta(error.message, 'danger');
        } finally {
            // Restaurar botão
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    // ✅ SISTEMA DE ALERTAS MELHORADO
    mostrarAlerta(mensagem, tipo = 'info') {
        // Criar toast Bootstrap
        const toastContainer = document.querySelector('.toast-container') || this.criarToastContainer();
        
        const toastId = 'toast-' + Date.now();
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-bg-${tipo} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-${this.getAlertIcon(tipo)} me-2"></i>
                        ${mensagem}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });
        
        toast.show();
        
        // Remover elemento do DOM após esconder
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    criarToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        return container;
    }

    getAlertIcon(tipo) {
        const icons = {
            success: 'check-circle',
            danger: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icons[tipo] || 'info-circle';
    }

    mostrarResultadoTeste(resultados) {
        const mensagem = `
            <strong>📊 Resultado Teste FASE 5.1:</strong><br>
            ✅ API: ${resultados.conexaoAPI.success ? 'OK' : 'FALHA'}<br>
            🔌 WebSocket: ${resultados.websocket.success ? 'OK' : 'FALHA'}<br>
            🗄️ Banco: ${resultados.bancoDados.success ? 'OK' : 'FALHA'}<br>
            ⏱️ Tempo Resposta: ${resultados.conexaoAPI.responseTime}ms
        `;
        this.mostrarAlerta(mensagem, 'info');
    }

    // ✅ MONITORAMENTO E MÉTRICAS
    iniciarMonitoramento() {
        // Atualizar métricas a cada 30 segundos
        setInterval(() => {
            this.atualizarMetricasUI();
        }, 30000);

        // Teste automático de conexão a cada 2 minutos
        setInterval(async () => {
            await this.testarConexao();
        }, 120000);
    }

    atualizarMetricasUI() {
        const metrics = [
            { id: 'metric-requests', value: this.metrics.requests },
            { id: 'metric-cache', value: this.metrics.cacheHits },
            { id: 'metric-errors', value: this.metrics.errors },
            { id: 'metric-response', value: this.calcularMediaResponseTime() + 'ms' }
        ];

        metrics.forEach(metric => {
            const element = document.getElementById(metric.id);
            if (element) {
                element.textContent = metric.value;
            }
        });
    }

    calcularMediaResponseTime() {
        if (this.metrics.responseTimes.length === 0) return 0;
        const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.metrics.responseTimes.length);
    }

    atualizarInterfaceUsuario() {
        if (this.currentUser) {
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = this.currentUser.full_name || this.currentUser.username;
            }
        }

        // Atualizar status inicial
        this.atualizarStatusWebSocket('connecting');
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    marcarTodasNotificacoesComoLidas() {
        const badge = document.getElementById('notification-count');
        if (badge) {
            badge.classList.add('d-none');
            badge.textContent = '0';
        }
        
        // Marcar visualmente como lidas
        const notificacoes = document.querySelectorAll('#notifications-list .dropdown-item');
        notificacoes.forEach(notif => {
            notif.classList.remove('fw-bold');
        });
        
        this.mostrarAlerta('Todas as notificações marcadas como lidas', 'success');
    }
}

// ✅ INICIALIZAÇÃO GLOBAL FASE 5.1
document.addEventListener('DOMContentLoaded', function() {
    console.log('👤 DOM Carregado - Sistema FASE 5.1');
    
    const token = localStorage.getItem('bizflow_token');
    const user = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
    
    if (token && user) {
        console.log('✅ Usuário autenticado - inicializando BizFlow App FASE 5.1');
        window.bizFlowApp = new BizFlowApp();
        
        // Pequeno delay para garantir que tudo está carregado
        setTimeout(() => {
            window.bizFlowApp.init().catch(error => {
                console.error('❌ Falha na inicialização:', error);
            });
        }, 100);
    } else {
        console.log('🔐 Usuário não autenticado - mostrando tela de login');
    }
});

// ✅ FUNÇÕES GLOBAIS FASE 5.1
window.testarConexoes = function() {
    console.log('🔍 TESTAR CONEXÕES FASE 5.1 CHAMADO!');
    if (window.bizFlowApp && window.bizFlowApp.testarConexaoCompleta) {
        window.bizFlowApp.testarConexaoCompleta();
    } else {
        alert('Sistema BizFlow não inicializado. Faça login primeiro.');
    }
};

window.limparCache = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.invalidarCache();
        window.bizFlowApp.mostrarAlerta('Sistema de cache limpo com sucesso!', 'success');
    } else {
        alert('Sistema não inicializado');
    }
};

window.carregarDashboard = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.carregarDadosIniciais();
        window.bizFlowApp.mostrarAlerta('Dashboard atualizado!', 'info');
    } else {
        alert('Sistema não inicializado');
    }
};

window.marcarTodasComoLidas = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.marcarTodasNotificacoesComoLidas();
    } else {
        alert('Sistema não inicializado');
    }
};

window.aplicarConfiguracoes = function() {
    if (window.bizFlowApp) {
        const websocket = document.getElementById('config-websocket').checked;
        const cache = document.getElementById('config-cache').checked;
        const retry = document.getElementById('config-retry').checked;
        const tema = document.getElementById('config-tema').value;
        
        window.bizFlowApp.configuracoes.websocket = websocket;
        window.bizFlowApp.configuracoes.cacheAtivo = cache;
        window.bizFlowApp.configuracoes.retryAuto = retry;
        window.bizFlowApp.configuracoes.tema = tema;
        
        window.bizFlowApp.salvarConfiguracoes();
        window.bizFlowApp.aplicarConfiguracoes();
        
        // Fechar modal
        bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
        
        window.bizFlowApp.mostrarAlerta('Configurações FASE 5.1 aplicadas!', 'success');
    }
};

// ✅ VERIFICAÇÃO FINAL FASE 5.1
console.log('✅✅✅ ARQUIVO app-v5.1-fixed.js FASE 5.1 CARREGADO! ✅✅✅');
console.log('✅ Função testarConexao existe:', typeof window.BizFlowApp?.prototype.testarConexao === 'function');
console.log('✅ Sistema de cache implementado:', typeof window.BizFlowApp?.prototype.fetchComCache === 'function');
console.log('✅ WebSocket implementado:', typeof window.BizFlowApp?.prototype.inicializarWebSocket === 'function');
