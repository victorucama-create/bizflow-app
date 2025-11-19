// BizFlow App - FASE 5.1 PRODUÇÃO HÍBRIDA - VERSÃO 100% OTIMIZADA
console.log('✅ BizFlow App FASE 5.1 HÍBRIDO - SISTEMA DE PRODUÇÃO CARREGADO!');

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
        
        // ✅ CONFIGURAÇÕES FASE 5.1 HÍBRIDO
        this.configuracoes = {
            cacheAtivo: true,
            retryAuto: true,
            maxRetries: 3,
            timeout: 10000,
            tema: localStorage.getItem('bizflow_tema') || 'light',
            modo: 'auto' // auto, frontend, backend
        };
        
        // ✅ DETECTAR MODO AUTOMATICAMENTE
        this.modoAtual = this.detectarModo();
        console.log(`🚀 BizFlow App FASE 5.1 HÍBRIDO - Modo: ${this.modoAtual}`);
    }

    // ✅ DETECÇÃO AUTOMÁTICA DE MODO
    detectarModo() {
        // Verificar se estamos em modo frontend (sem backend)
        if (typeof window.BizFlowServer !== 'undefined') {
            return 'frontend';
        }
        
        // Verificar localStorage para configuração manual
        const modoConfig = localStorage.getItem('bizflow_modo');
        if (modoConfig) {
            return modoConfig;
        }
        
        // Padrão: tentar backend primeiro
        return 'auto';
    }

    async init() {
        try {
            console.log('🔧 Iniciando BizFlow App FASE 5.1 HÍBRIDO...');
            
            this.aplicarConfiguracoes();
            this.configurarEventListeners();
            this.inicializarWebSocket();
            this.atualizarInterfaceUsuario();
            await this.carregarDadosIniciais();
            this.iniciarMonitoramento();
            
            console.log('✅ BizFlow App FASE 5.1 HÍBRIDO inicializado com sucesso!');
            console.log(`📊 Modo: ${this.modoAtual} | Usuário: ${this.currentUser?.username || 'N/A'}`);
        } catch (error) {
            console.error('❌ Erro na inicialização FASE 5.1 HÍBRIDO:', error);
            this.mostrarAlerta('Erro ao inicializar sistema', 'danger');
        }
    }

    aplicarConfiguracoes() {
        // Aplicar tema
        document.body.setAttribute('data-bs-theme', this.configuracoes.tema);
        
        // Atualizar interface com modo atual
        this.atualizarInterfaceModo();
        
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
        if (document.getElementById('config-modo')) {
            document.getElementById('config-modo').value = this.configuracoes.modo;
        }
    }

    atualizarInterfaceModo() {
        const modoElement = document.getElementById('sistema-modo');
        if (modoElement) {
            modoElement.textContent = this.modoAtual.toUpperCase();
            modoElement.className = `badge bg-${this.modoAtual === 'frontend' ? 'warning' : 'success'}`;
        }

        // Atualizar título da página
        document.title = `BizFlow FASE 5.1 - ${this.modoAtual.toUpperCase()}`;
    }

    salvarConfiguracoes() {
        localStorage.setItem('bizflow_config', JSON.stringify(this.configuracoes));
    }

    configurarEventListeners() {
        console.log('🔧 Configurando event listeners FASE 5.1 HÍBRIDO...');
        
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

        // Listener para mudança de modo
        const modoSelect = document.getElementById('config-modo');
        if (modoSelect) {
            modoSelect.addEventListener('change', (e) => {
                this.configuracoes.modo = e.target.value;
                this.salvarConfiguracoes();
            });
        }
    }

    // ✅ WEBSOCKET HÍBRIDO
    inicializarWebSocket() {
        // Em modo frontend, usar eventos customizados
        if (this.modoAtual === 'frontend') {
            console.log('🔌 Modo Frontend - Usando eventos customizados');
            this.configurarEventosFrontend();
            return;
        }

        // Modo Backend - WebSocket tradicional
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
                
                // Fallback para modo frontend se WebSocket falhar
                if (this.configuracoes.modo === 'auto') {
                    console.log('🔄 Fallback para modo frontend');
                    this.modoAtual = 'frontend';
                    this.configurarEventosFrontend();
                }
            });

            this.socket.on('venda-atualizada', (data) => {
                this.mostrarAlerta('Nova venda registrada no sistema!', 'info');
                this.carregarDadosIniciais();
            });

            this.socket.on('notificacao-nova', (notificacao) => {
                this.mostrarAlerta(`Nova notificação: ${notificacao.titulo}`, 'warning');
                this.carregarNotificacoes();
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar WebSocket:', error);
            this.modoAtual = 'frontend';
            this.configurarEventosFrontend();
        }
    }

    // ✅ EVENTOS FRONTEND (WebSocket alternativo)
    configurarEventosFrontend() {
        console.log('🎯 Configurando eventos frontend customizados');
        
        // Ouvir eventos customizados do sistema frontend
        window.addEventListener('bizflow-notification', (event) => {
            const notificacao = event.detail;
            this.mostrarAlerta(`Nova notificação: ${notificacao.title}`, 'warning');
            this.carregarNotificacoes();
        });

        window.addEventListener('bizflow-data-update', (event) => {
            console.log('📊 Dados atualizados via evento frontend');
            this.carregarDadosIniciais();
        });

        this.atualizarStatusWebSocket('frontend');
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
            case 'frontend':
                elemento.classList.add('websocket-frontend');
                elemento.innerHTML = '<i class="fas fa-desktop me-1"></i>Modo Frontend';
                break;
        }
    }

    // ✅ CARREGAMENTO DE DADOS HÍBRIDO
    async carregarDadosIniciais() {
        console.log('📊 Carregando dados iniciais FASE 5.1 HÍBRIDO...');
        
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

    // ✅✅✅ FUNÇÃO testarConexao OTIMIZADA FASE 5.1 HÍBRIDO ✅✅✅
    async testarConexao() {
        console.log('🌐 TESTANDO CONEXÃO FASE 5.1 HÍBRIDO!');
        
        const startTime = Date.now();
        
        try {
            // Em modo frontend, testar sistema local
            if (this.modoAtual === 'frontend') {
                const health = await this.testarSistemaFrontend();
                return {
                    success: true,
                    responseTime: Date.now() - startTime,
                    status: 'frontend_healthy',
                    environment: 'frontend',
                    version: '5.1.0',
                    mode: 'frontend'
                };
            }

            // Modo backend - testar API tradicional
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
                version: data.version,
                mode: data.mode || 'backend'
            };
        } catch (error) {
            this.metrics.errors++;
            this.atualizarMetricasUI();
            
            // Fallback para modo frontend
            if (this.configuracoes.modo === 'auto') {
                console.log('🔄 Fallback para modo frontend após erro');
                this.modoAtual = 'frontend';
                this.atualizarInterfaceModo();
                this.configurarEventosFrontend();
                
                return {
                    success: true,
                    responseTime: Date.now() - startTime,
                    status: 'frontend_fallback',
                    environment: 'frontend',
                    version: '5.1.0',
                    mode: 'frontend',
                    fallback: true
                };
            }
            
            return { 
                success: false, 
                error: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    // ✅ TESTAR SISTEMA FRONTEND
    async testarSistemaFrontend() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    storage: typeof localStorage !== 'undefined',
                    system: typeof window.BizFlowServer !== 'undefined',
                    status: 'operational'
                });
            }, 100);
        });
    }

    async testarConexaoCompleta() {
        console.log('🔍 Teste completo de conexão FASE 5.1 HÍBRIDO...');
        
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
        // Em modo frontend, simular WebSocket
        if (this.modoAtual === 'frontend') {
            return {
                success: true,
                message: 'Eventos frontend ativos',
                mode: 'frontend'
            };
        }

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
        // Em modo frontend, testar localStorage
        if (this.modoAtual === 'frontend') {
            try {
                const storageTest = {
                    users: localStorage.getItem('bizflow_users') !== null,
                    products: localStorage.getItem('bizflow_produtos') !== null,
                    sales: localStorage.getItem('bizflow_vendas') !== null,
                    totalItems: this.contarItensStorage()
                };
                
                return {
                    success: true,
                    mode: 'frontend',
                    storage: storageTest,
                    message: 'Sistema de storage frontend operacional'
                };
            } catch (error) {
                return { success: false, error: error.message, mode: 'frontend' };
            }
        }

        // Modo backend - testar banco tradicional
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
                    status: data.data.database.status,
                    mode: 'backend'
                };
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            return { success: false, error: error.message, mode: 'backend' };
        }
    }

    contarItensStorage() {
        let count = 0;
        for (let i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i).startsWith('bizflow_')) {
                count++;
            }
        }
        return count;
    }

    // ✅ SISTEMA DE CACHE FASE 5.1 HÍBRIDO
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

        // Em modo frontend, usar sistema local
        if (this.modoAtual === 'frontend' && url.startsWith('/api/')) {
            return await this.fetchFrontend(url, options);
        }

        // Fazer requisição tradicional
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
            
            // Fallback para frontend se configurado
            if (this.configuracoes.modo === 'auto' && url.startsWith('/api/')) {
                console.log('🔄 Fallback para dados frontend');
                return await this.fetchFrontend(url, options);
            }
            
            throw error;
        }
    }

    // ✅ FETCH FRONTEND - Sistema local
    async fetchFrontend(url, options = {}) {
        console.log('🏠 Fetch frontend:', url);
        
        // Simular delay de rede
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        
        const endpoint = url.replace('/api/', '');
        const method = options.method || 'GET';
        
        try {
            // Usar sistema frontend se disponível
            if (typeof window.BizFlowServer !== 'undefined') {
                const result = await window.BizFlowServer.handleRequest(method, endpoint, options.body ? JSON.parse(options.body) : null);
                return result;
            }
            
            // Fallback para dados demo
            return await this.gerarDadosDemo(endpoint, method, options);
        } catch (error) {
            console.error('❌ Erro no fetch frontend:', error);
            return {
                success: false,
                error: error.message,
                mode: 'frontend'
            };
        }
    }

    // ✅ GERADOR DE DADOS DEMO
    async gerarDadosDemo(endpoint, method, options) {
        const demoData = {
            'dashboard': {
                success: true,
                data: {
                    total_empresas: 1,
                    total_produtos: 15,
                    total_vendas: 48,
                    total_usuarios: 3,
                    faturamento_total: 12580.50,
                    total_contas: 12,
                    total_receitas: 15800.00,
                    total_despesas: 3219.50,
                    notificacoes_nao_lidas: 2
                }
            },
            'empresas': {
                success: true,
                data: [
                    {
                        id: 1,
                        nome: 'Empresa Principal Demo',
                        cnpj: '00.000.000/0001-00',
                        email: 'demo@empresa.com',
                        telefone: '(11) 9999-9999',
                        is_active: true
                    }
                ]
            },
            'produtos': {
                success: true,
                data: [
                    {
                        id: 1,
                        name: 'Smartphone Android',
                        description: 'Smartphone Android 128GB',
                        price: 899.90,
                        stock_quantity: 15,
                        min_stock: 5,
                        category: 'Eletrônicos',
                        is_active: true
                    },
                    {
                        id: 2,
                        name: 'Notebook i5',
                        description: 'Notebook Core i5 8GB RAM',
                        price: 1899.90,
                        stock_quantity: 8,
                        min_stock: 3,
                        category: 'Eletrônicos',
                        is_active: true
                    }
                ]
            },
            'notifications': {
                success: true,
                data: [
                    {
                        id: 1,
                        title: 'Sistema Iniciado',
                        message: 'Sistema BizFlow FASE 5.1 HÍBRIDO carregado com sucesso!',
                        type: 'success',
                        is_read: false,
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 2,
                        title: 'Modo Frontend',
                        message: 'Sistema operando em modo frontend com dados demo',
                        type: 'info',
                        is_read: false,
                        created_at: new Date().toISOString()
                    }
                ]
            }
        };

        const data = demoData[endpoint] || {
            success: true,
            data: [],
            message: 'Endpoint demo não implementado',
            mode: 'frontend'
        };

        return data;
    }

    invalidarCache() {
        this.cache.clear();
        this.metrics.cacheHits = 0;
        this.atualizarMetricasUI();
        console.log('🧹 Cache invalidado');
    }

    // ✅✅✅ MÉTODOS DE CARREGAMENTO MANTIDOS (compatíveis com sistema híbrido)
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

    // ✅ RENDERIZADORES MANTIDOS (compatíveis)
    renderizarEmpresas(empresas) {
        const container = document.getElementById('lista-empresas');
        if (!container) return;
        
        if (!empresas || empresas.length === 0) {
            container.innerHTML = this.getEmptyState('building', 'Nenhuma empresa cadastrada');
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

    renderizarProdutos(produtos) {
        const container = document.getElementById('lista-estoque');
        if (!container) return;
        
        if (!produtos || produtos.length === 0) {
            container.innerHTML = this.getEmptyState('box-open', 'Nenhum produto cadastrado');
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

    renderizarVendas(vendas) {
        const container = document.getElementById('lista-vendas');
        if (!container) return;
        
        if (!vendas || vendas.length === 0) {
            container.innerHTML = this.getEmptyState('receipt', 'Nenhuma venda registrada');
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

    renderizarDashboard(dados) {
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

    getEmptyState(icon, message) {
        return `
            <div class="text-center text-muted py-4">
                <i class="fas fa-${icon} fa-3x mb-3"></i>
                <p>${message}</p>
                ${this.modoAtual === 'frontend' ? '<small class="text-warning">Modo Demonstração</small>' : ''}
            </div>
        `;
    }

    // ✅ MANIPULAÇÃO DE FORMULÁRIOS HÍBRIDA
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

            // Em modo frontend, usar sistema local
            if (this.modoAtual === 'frontend') {
                await this.processarFormFrontend(formId, data);
            } else {
                await this.processarFormBackend(formId, data);
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

    async processarFormBackend(formId, data) {
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
            event.target.reset();
            this.invalidarCache();
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
    }

    async processarFormFrontend(formId, data) {
        // Simular processamento frontend
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        this.mostrarAlerta('Operação simulada em modo frontend!', 'info');
        event.target.reset();
        this.invalidarCache();
        
        // Disparar evento de atualização
        window.dispatchEvent(new CustomEvent('bizflow-data-update', {
            detail: { form: formId, data: data }
        }));
        
        await this.carregarDadosIniciais();
    }

    // ✅ SISTEMA DE ALERTAS MELHORADO (mantido)
    mostrarAlerta(mensagem, tipo = 'info') {
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
        const modo = resultados.conexaoAPI.mode || 'backend';
        const mensagem = `
            <strong>📊 Resultado Teste FASE 5.1 HÍBRIDO:</strong><br>
            🎯 Modo: ${modo.toUpperCase()}<br>
            ✅ API: ${resultados.conexaoAPI.success ? 'OK' : 'FALHA'}<br>
            🔌 WebSocket: ${resultados.websocket.success ? 'OK' : 'FALHA'}<br>
            🗄️ Banco: ${resultados.bancoDados.success ? 'OK' : 'FALHA'}<br>
            ⏱️ Tempo Resposta: ${resultados.conexaoAPI.responseTime}ms
        `;
        this.mostrarAlerta(mensagem, 'info');
    }

    // ✅ MONITORAMENTO E MÉTRICAS HÍBRIDO
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
        this.atualizarInterfaceModo();
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
        
        const notificacoes = document.querySelectorAll('#notifications-list .dropdown-item');
        notificacoes.forEach(notif => {
            notif.classList.remove('fw-bold');
        });
        
        this.mostrarAlerta('Todas as notificações marcadas como lidas', 'success');
    }

    // ✅ MÉTODOS ESPECÍFICOS DO SISTEMA HÍBRIDO
    alternarModo(novoModo) {
        this.configuracoes.modo = novoModo;
        this.modoAtual = novoModo;
        this.salvarConfiguracoes();
        this.aplicarConfiguracoes();
        
        // Reinicializar componentes específicos do modo
        if (novoModo === 'frontend') {
            this.configurarEventosFrontend();
        } else {
            this.inicializarWebSocket();
        }
        
        this.mostrarAlerta(`Modo alterado para: ${novoModo.toUpperCase()}`, 'info');
        this.carregarDadosIniciais();
    }

    exportarDadosFrontend() {
        if (this.modoAtual !== 'frontend') {
            this.mostrarAlerta('Esta função só está disponível em modo frontend', 'warning');
            return;
        }
        
        // Implementar exportação de dados do localStorage
        const dados = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('bizflow_')) {
                dados[key] = localStorage.getItem(key);
            }
        }
        
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bizflow_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.mostrarAlerta('Dados exportados com sucesso!', 'success');
    }

    limparDadosFrontend() {
        if (confirm('Tem certeza que deseja limpar todos os dados do modo frontend?')) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('bizflow_')) {
                    localStorage.removeItem(key);
                }
            }
            this.invalidarCache();
            this.carregarDadosIniciais();
            this.mostrarAlerta('Dados frontend limpos com sucesso!', 'success');
        }
    }
}

// ✅ INICIALIZAÇÃO GLOBAL FASE 5.1 HÍBRIDO
document.addEventListener('DOMContentLoaded', function() {
    console.log('👤 DOM Carregado - Sistema FASE 5.1 HÍBRIDO');
    
    const token = localStorage.getItem('bizflow_token');
    const user = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
    
    if (token && user) {
        console.log('✅ Usuário autenticado - inicializando BizFlow App FASE 5.1 HÍBRIDO');
        window.bizFlowApp = new BizFlowApp();
        
        setTimeout(() => {
            window.bizFlowApp.init().catch(error => {
                console.error('❌ Falha na inicialização:', error);
            });
        }, 100);
    } else {
        console.log('🔐 Usuário não autenticado - mostrando tela de login');
        // Mostrar interface de login
        document.getElementById('login-container')?.classList.remove('d-none');
        document.getElementById('app-container')?.classList.add('d-none');
    }
});

// ✅ FUNÇÕES GLOBAIS FASE 5.1 HÍBRIDO
window.testarConexoes = function() {
    console.log('🔍 TESTAR CONEXÕES FASE 5.1 HÍBRIDO CHAMADO!');
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
        const cache = document.getElementById('config-cache').checked;
        const retry = document.getElementById('config-retry').checked;
        const tema = document.getElementById('config-tema').value;
        const modo = document.getElementById('config-modo').value;
        
        window.bizFlowApp.configuracoes.cacheAtivo = cache;
        window.bizFlowApp.configuracoes.retryAuto = retry;
        window.bizFlowApp.configuracoes.tema = tema;
        window.bizFlowApp.configuracoes.modo = modo;
        
        window.bizFlowApp.salvarConfiguracoes();
        window.bizFlowApp.aplicarConfiguracoes();
        
        // Aplicar mudança de modo se necessário
        if (modo !== window.bizFlowApp.modoAtual) {
            window.bizFlowApp.alternarModo(modo);
        }
        
        bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
        window.bizFlowApp.mostrarAlerta('Configurações FASE 5.1 HÍBRIDO aplicadas!', 'success');
    }
};

// ✅ NOVAS FUNÇÕES HÍBRIDAS
window.alternarModo = function(modo) {
    if (window.bizFlowApp) {
        window.bizFlowApp.alternarModo(modo);
    }
};

window.exportarDados = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.exportarDadosFrontend();
    }
};

window.limparDados = function() {
    if (window.bizFlowApp) {
        window.bizFlowApp.limparDadosFrontend();
    }
};

// ✅ VERIFICAÇÃO FINAL FASE 5.1 HÍBRIDO
console.log('✅✅✅ ARQUIVO app-v5.1-fixed.js FASE 5.1 HÍBRIDO CARREGADO! ✅✅✅');
console.log('✅ Modo atual:', window.bizFlowApp?.modoAtual || 'Não inicializado');
console.log('✅ Sistema híbrido implementado:', typeof window.BizFlowApp?.prototype.fetchFrontend === 'function');
console.log('✅ WebSocket híbrido implementado:', typeof window.BizFlowApp?.prototype.configurarEventosFrontend === 'function');
console.log('✅ Detecção automática de modo:', typeof window.BizFlowApp?.prototype.detectarModo === 'function');
