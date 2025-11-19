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
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Configurações FASE 5.1
        this.configuracoes = {
            tema: 'light',
            notificacoes: true,
            websocket: true,
            atualizacaoAuto: true,
            cache: true,
            retryAuto: true
        };
        
        // Dados FASE 5.1
        this.empresas = [];
        this.filiais = [];
        this.apiKeys = [];
        this.userGroups = [];
        this.cache = new Map();
        
        // Métricas de performance
        this.metrics = {
            requests: 0,
            errors: 0,
            cacheHits: 0,
            avgResponseTime: 0
        };
    }

    async init() {
        try {
            console.log('🚀 Inicializando BizFlow App FASE 5.1 - SISTEMA DE PRODUÇÃO...');
            
            // Verificar autenticação
            if (!this.authToken) {
                console.warn('⚠️ Usuário não autenticado - modo público ativado');
                this.mostrarAlerta('Sistema BizFlow FASE 5.1 carregado. Faça login para acessar todas as funcionalidades.', 'info');
                return;
            }
            
            // Testar conexão com a API
            await this.testarConexao();
            
            // Conectar WebSocket FASE 5.1
            if (this.configuracoes.websocket) {
                this.conectarWebSocket();
            }
            
            // Carregar dados iniciais FASE 5.1
            await this.carregarDadosIniciaisFase5();
            
            // Configurar event listeners FASE 5.1
            this.configurarEventListenersFase5();
            
            // Aplicar configurações
            this.aplicarConfiguracoes();
            
            // Iniciar monitoramento de performance
            this.iniciarMonitoramento();
            
            console.log('✅ BizFlow App FASE 5.1 inicializado com sucesso!');
            this.mostrarAlerta('Sistema FASE 5.1 - PRODUÇÃO carregado! 🚀', 'success');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar app FASE 5.1:', error);
            this.mostrarAlerta('Sistema em modo resiliente. Funcionalidades limitadas.', 'warning');
            this.ativarModoResiliente();
        }
    }

    // ================= WEBSOCKET FASE 5.1 - CORRIGIDO =================

    conectarWebSocket() {
        try {
            console.log('🔌 Conectando WebSocket FASE 5.1...');
            
            this.socket = io(this.API_BASE_URL, {
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            this.socket.on('connect', () => {
                console.log('🔌 Conectado ao WebSocket FASE 5.1');
                this.isWebSocketConnected = true;
                this.retryCount = 0;
                this.atualizarStatusWebSocket('connected', 'WebSocket Conectado');
                
                // Autenticar WebSocket
                this.socket.emit('authenticate', { token: this.authToken });
                
                // Iniciar heartbeat
                this.iniciarHeartbeat();
            });

            this.socket.on('authenticated', (data) => {
                if (data.success) {
                    console.log('✅ Autenticado no WebSocket FASE 5.1', data.user);
                } else {
                    console.error('❌ Falha na autenticação WebSocket:', data.error);
                    this.mostrarAlerta('Falha na conexão em tempo real', 'warning');
                }
            });

            this.socket.on('notification', (notification) => {
                console.log('🔔 Nova notificação via WebSocket:', notification);
                this.adicionarNotificacao(notification);
                this.mostrarToastNotificacao(notification);
            });

            this.socket.on('heartbeat', (data) => {
                console.debug('💓 Heartbeat WebSocket recebido', data);
            });

            this.socket.on('venda_registrada', (data) => {
                console.log('💰 Nova venda registrada via WebSocket:', data);
                this.mostrarAlerta(`Nova venda: ${data.sale_code} - R$ ${data.total_amount}`, 'success');
                this.carregarDashboardAvancado();
            });

            this.socket.on('estoque_alterado', (data) => {
                console.log('📦 Estoque alterado via WebSocket:', data);
                this.mostrarAlerta(`Estoque atualizado: ${data.product_name}`, 'warning');
                this.carregarEstoque();
            });

            this.socket.on('disconnect', (reason) => {
                console.log('🔌 Desconectado do WebSocket:', reason);
                this.isWebSocketConnected = false;
                this.atualizarStatusWebSocket('disconnected', `WebSocket Desconectado: ${reason}`);
                
                if (this.configuracoes.retryAuto) {
                    this.tentarReconexaoWebSocket();
                }
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Erro de conexão WebSocket:', error);
                this.isWebSocketConnected = false;
                this.atualizarStatusWebSocket('error', 'Erro WebSocket');
                
                this.retryCount++;
                if (this.retryCount <= this.maxRetries && this.configuracoes.retryAuto) {
                    setTimeout(() => this.conectarWebSocket(), 2000 * this.retryCount);
                }
            });

            this.socket.on('reconnect_attempt', (attempt) => {
                console.log(`🔄 Tentativa de reconexão WebSocket: ${attempt}`);
                this.atualizarStatusWebSocket('connecting', `Reconectando... (${attempt}/${this.maxRetries})`);
            });

        } catch (error) {
            console.error('❌ Erro ao conectar WebSocket FASE 5.1:', error);
            this.isWebSocketConnected = false;
            this.atualizarStatusWebSocket('error', 'Erro na conexão');
        }
    }

    iniciarHeartbeat() {
        // Enviar heartbeat a cada 30 segundos
        this.heartbeatInterval = setInterval(() => {
            if (this.isWebSocketConnected && this.socket) {
                this.socket.emit('heartbeat', { timestamp: Date.now() });
            }
        }, 30000);
    }

    tentarReconexaoWebSocket() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`🔄 Tentativa de reconexão ${this.retryCount}/${this.maxRetries}`);
            
            setTimeout(() => {
                if (!this.isWebSocketConnected) {
                    this.conectarWebSocket();
                }
            }, 2000 * this.retryCount);
        } else {
            console.warn('⚠️ Número máximo de tentativas de reconexão atingido');
            this.mostrarAlerta('Conexão em tempo real perdida. Recarregue a página para tentar novamente.', 'warning');
        }
    }

    desconectarWebSocket() {
        if (this.socket) {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }
            this.socket.disconnect();
            this.socket = null;
            this.isWebSocketConnected = false;
            this.atualizarStatusWebSocket('disconnected', 'WebSocket Desativado');
        }
    }

    testarWebSocket() {
        if (this.isWebSocketConnected) {
            this.mostrarAlerta('WebSocket conectado e funcionando! ✅', 'success');
        } else {
            this.mostrarAlerta('WebSocket desconectado. Tentando reconectar...', 'warning');
            this.conectarWebSocket();
        }
    }

    // ================= SISTEMA DE CACHE FASE 5.1 =================

    async fetchComCache(url, options = {}, cacheKey = null, ttl = 300000) {
        const chave = cacheKey || url;
        const agora = Date.now();
        
        // Verificar cache
        if (this.configuracoes.cache && this.cache.has(chave)) {
            const cached = this.cache.get(chave);
            if (agora - cached.timestamp < ttl) {
                this.metrics.cacheHits++;
                console.log(`📦 Cache hit: ${chave}`);
                return cached.data;
            } else {
                // Cache expirado
                this.cache.delete(chave);
            }
        }
        
        // Fazer requisição
        try {
            const inicio = performance.now();
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    ...this.getAuthHeaders()
                }
            });
            
            const tempoResposta = performance.now() - inicio;
            this.metrics.avgResponseTime = (this.metrics.avgResponseTime * this.metrics.requests + tempoResposta) / (this.metrics.requests + 1);
            this.metrics.requests++;
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Armazenar em cache se bem-sucedido
            if (this.configuracoes.cache && data.success) {
                this.cache.set(chave, {
                    data: data,
                    timestamp: agora
                });
            }
            
            return data;
            
        } catch (error) {
            this.metrics.errors++;
            console.error(`❌ Erro na requisição ${url}:`, error);
            throw error;
        }
    }

    invalidarCache(pattern = null) {
        if (pattern) {
            for (const [key] of this.cache) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
        console.log('🗑️ Cache invalidado:', pattern || 'completo');
    }

    // ================= MULTI-EMPRESA FASE 5.1 =================

    async carregarDadosIniciaisFase5() {
        try {
            console.log('📥 Carregando dados FASE 5.1...');
            
            await Promise.allSettled([
                this.carregarEmpresas(),
                this.carregarFiliais(),
                this.carregarApiKeys(),
                this.carregarUserGroups(),
                this.carregarNotificacoes(),
                this.carregarMetricasSistema()
            ]);
            
            console.log('✅ Dados FASE 5.1 carregados com sucesso');
        } catch (error) {
            console.warn('⚠️ Erro ao carregar dados FASE 5.1:', error);
        }
    }

    async carregarEmpresas() {
        try {
            const data = await this.fetchComCache(
                `${this.API_BASE_URL}/api/empresas`,
                {},
                'empresas',
                600000
            );
            
            if (data.success) {
                this.empresas = data.data;
                this.exibirEmpresas(this.empresas);
                this.atualizarMetricasEmpresariais();
            }
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
            this.mostrarAlerta('Erro ao carregar empresas', 'warning');
        }
    }

    async carregarFiliais() {
        try {
            const data = await this.fetchComCache(
                `${this.API_BASE_URL}/api/filiais`,
                {},
                `filiais_${this.empresaAtual.id}`,
                300000
            );
            
            if (data.success) {
                this.filiais = data.data;
                this.exibirFiliais(this.filiais);
                this.atualizarMetricasEmpresariais();
            }
        } catch (error) {
            console.error('Erro ao carregar filiais:', error);
        }
    }

    async carregarApiKeys() {
        try {
            this.apiKeys = [];
            this.exibirApiKeys(this.apiKeys);
        } catch (error) {
            console.error('Erro ao carregar API Keys:', error);
        }
    }

    async carregarUserGroups() {
        try {
            const data = await this.fetchComCache(
                `${this.API_BASE_URL}/api/grupos`,
                {},
                `grupos_${this.empresaAtual.id}`,
                600000
            );
            
            if (data.success) {
                this.userGroups = data.data;
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
        }
    }

    async carregarMetricasSistema() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/health/detailed`);
            if (response.ok) {
                const data = await response.json();
                this.atualizarMetricasSistema(data.metrics);
            }
        } catch (error) {
            console.error('Erro ao carregar métricas do sistema:', error);
        }
    }

    // ================= NOTIFICAÇÕES FASE 5.1 =================

    async carregarNotificacoes() {
        try {
            const data = await this.fetchComCache(
                `${this.API_BASE_URL}/api/notifications?unread_only=true&limit=10`,
                {},
                `notifications_${this.currentUser?.id}`,
                120000
            );
            
            if (data.success) {
                this.notifications = data.data;
                this.exibirNotificacoes(this.notifications);
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    exibirNotificacoes(notifications) {
        const container = document.getElementById('notifications-list');
        const badge = document.getElementById('notification-count');
        
        if (!notifications || notifications.length === 0) {
            if (container) {
                container.innerHTML = '<li class="px-3 py-2 text-muted text-center">Nenhuma notificação</li>';
            }
            if (badge) {
                badge.textContent = '0';
                badge.classList.add('d-none');
            }
            return;
        }

        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (badge) {
            badge.textContent = unreadCount;
            badge.classList.toggle('d-none', unreadCount === 0);
        }

        if (container) {
            const html = notifications.slice(0, 8).map(notification => {
                const typeClass = `notification-${notification.type || 'info'} ${notification.is_read ? '' : 'notification-unread'}`;
                const timeAgo = this.formatTimeAgo(new Date(notification.created_at));
                const icon = this.getNotificationIcon(notification.type);
                
                return `
                    <li>
                        <div class="notification-item ${typeClass}">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="flex-grow-1">
                                    <div class="d-flex align-items-center mb-1">
                                        <i class="${icon} me-2"></i>
                                        <h6 class="mb-0">${notification.title}</h6>
                                    </div>
                                    <p class="mb-1 small">${notification.message}</p>
                                    <small class="text-muted">${timeAgo}</small>
                                </div>
                                ${!notification.is_read ? `
                                    <button class="btn btn-sm btn-outline-primary ms-2" 
                                            onclick="bizFlowApp.marcarNotificacaoComoLida(${notification.id})"
                                            title="Marcar como lida">
                                        <i class="fas fa-check"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </li>
                `;
            }).join('');

            container.innerHTML = html;
        }
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fas fa-check-circle text-success',
            error: 'fas fa-exclamation-circle text-danger',
            warning: 'fas fa-exclamation-triangle text-warning',
            info: 'fas fa-info-circle text-info'
        };
        return icons[type] || icons.info;
    }

    mostrarToastNotificacao(notification) {
        const toast = document.createElement('div');
        toast.className = `notification-toast toast show align-items-center text-white bg-${notification.type || 'info'} border-0`;
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="${this.getNotificationIcon(notification.type)} me-2"></i>
                    <strong>${notification.title}</strong><br>
                    ${notification.message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        const container = document.getElementById('notification-toast-container') || this.criarToastContainer();
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    }

    criarToastContainer() {
        const container = document.createElement('div');
        container.id = 'notification-toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1060';
        document.body.appendChild(container);
        return container;
    }

    adicionarNotificacao(notification) {
        this.notifications.unshift(notification);
        this.exibirNotificacoes(this.notifications);
    }

    async marcarNotificacaoComoLida(notificationId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/notifications/${notificationId}/read`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const notification = this.notifications.find(n => n.id === notificationId);
                if (notification) {
                    notification.is_read = true;
                }
                this.exibirNotificacoes(this.notifications);
                this.invalidarCache('notifications');
            }
        } catch (error) {
            console.error('Erro ao marcar notificação como lida:', error);
        }
    }

    async marcarTodasNotificacoesComoLidas() {
        try {
            const promises = this.notifications
                .filter(n => !n.is_read)
                .map(n => this.marcarNotificacaoComoLida(n.id));
            
            await Promise.all(promises);
            this.mostrarAlerta('Todas as notificações marcadas como lidas', 'success');
        } catch (error) {
            console.error('Erro ao marcar notificações como lidas:', error);
        }
    }

    // ================= CONFIGURAÇÕES FASE 5.1 =================

    configurarEventListenersFase5() {
        const websocketSwitch = document.getElementById('config-websocket');
        if (websocketSwitch) {
            websocketSwitch.checked = this.configuracoes.websocket;
            websocketSwitch.addEventListener('change', (e) => {
                this.configuracoes.websocket = e.target.checked;
                if (e.target.checked) {
                    this.conectarWebSocket();
                } else {
                    this.desconectarWebSocket();
                }
                this.salvarConfiguracoes();
            });
        }

        const cacheSwitch = document.getElementById('config-cache');
        if (cacheSwitch) {
            cacheSwitch.checked = this.configuracoes.cache;
            cacheSwitch.addEventListener('change', (e) => {
                this.configuracoes.cache = e.target.checked;
                if (!e.target.checked) {
                    this.invalidarCache();
                }
                this.salvarConfiguracoes();
            });
        }

        const retrySwitch = document.getElementById('config-retry');
        if (retrySwitch) {
            retrySwitch.checked = this.configuracoes.retryAuto;
            retrySwitch.addEventListener('change', (e) => {
                this.configuracoes.retryAuto = e.target.checked;
                this.salvarConfiguracoes();
            });
        }

        const clearCacheBtn = document.getElementById('btn-clear-cache');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.invalidarCache();
                this.mostrarAlerta('Cache limpo com sucesso!', 'success');
            });
        }

        const testConnectionBtn = document.getElementById('btn-test-connection');
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => {
                this.testarConexaoCompleta();
            });
        }
    }

    async testarConexaoCompleta() {
        this.mostrarAlerta('Testando conexões...', 'info');
        
        try {
            const [apiTest, wsTest, dbTest] = await Promise.allSettled([
                this.testarConexaoAPI(),
                this.testarWebSocket(),
                this.testarBancoDados()
            ]);
            
            let mensagem = 'Testes completados: ';
            const resultados = [];
            
            if (apiTest.status === 'fulfilled') resultados.push('✅ API');
            else resultados.push('❌ API');
            
            if (wsTest.status === 'fulfilled') resultados.push('✅ WebSocket');
            else resultados.push('❌ WebSocket');
            
            if (dbTest.status === 'fulfilled') resultados.push('✅ Banco');
            else resultados.push('❌ Banco');
            
            this.mostrarAlerta(mensagem + resultados.join(' | '), 
                resultados.every(r => r.includes('✅')) ? 'success' : 'warning');
                
        } catch (error) {
            this.mostrarAlerta('Erro durante os testes de conexão', 'danger');
        }
    }

    async testarConexaoAPI() {
        const response = await fetch(`${this.API_BASE_URL}/health`);
        if (!response.ok) throw new Error('API não responde');
        return await response.json();
    }

    async testarBancoDados() {
        const response = await fetch(`${this.API_BASE_URL}/health/detailed`);
        if (!response.ok) throw new Error('Banco não responde');
        const data = await response.json();
        if (data.database !== 'connected') throw new Error('Banco desconectado');
        return data;
    }

    // ================= MÉTRICAS E MONITORAMENTO FASE 5.1 =================

    iniciarMonitoramento() {
        this.performanceMonitor = setInterval(() => {
            this.registrarMetricasPerformance();
        }, 60000);
        
        this.connectionMonitor = setInterval(() => {
            this.verificarConexao();
        }, 30000);
    }

    registrarMetricasPerformance() {
        const metrics = {
            timestamp: new Date().toISOString(),
            requests: this.metrics.requests,
            errors: this.metrics.errors,
            cacheHits: this.metrics.cacheHits,
            avgResponseTime: this.metrics.avgResponseTime,
            websocketConnected: this.isWebSocketConnected
        };
        
        console.log('📊 Métricas de performance:', metrics);
        
        if (this.metrics.requests > 0) {
            this.enviarMetricasParaServidor(metrics);
        }
        
        this.metrics.requests = 0;
        this.metrics.errors = 0;
        this.metrics.cacheHits = 0;
    }

    async enviarMetricasParaServidor(metrics) {
        try {
            await fetch(`${this.API_BASE_URL}/api/metrics`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(metrics)
            });
        } catch (error) {
            console.debug('❌ Erro ao enviar métricas:', error);
        }
    }

    verificarConexao() {
        if (!navigator.onLine) {
            this.isOnline = false;
            this.atualizarStatusConexao('offline', 'Sem conexão com internet');
            return;
        }
        
        this.isOnline = true;
        
        fetch(`${this.API_BASE_URL}/health`, { 
            method: 'HEAD',
            cache: 'no-cache'
        })
        .then(() => {
            this.atualizarStatusConexao('online', 'Conectado');
        })
        .catch(() => {
            this.atualizarStatusConexao('degraded', 'Conexão instável');
        });
    }

    atualizarStatusConexao(status, mensagem) {
        const elemento = document.getElementById('status-conexao');
        if (elemento) {
            const statusClasses = {
                online: 'status-online',
                offline: 'status-offline',
                degraded: 'status-degraded'
            };
            
            elemento.className = `connection-status ${statusClasses[status] || 'status-offline'}`;
            elemento.innerHTML = `<i class="fas fa-${status === 'online' ? 'wifi' : 'wifi-slash'} me-1"></i>${mensagem}`;
        }
    }

    // ================= UTILITÁRIOS FASE 5.1 =================

    setAuthToken(token) {
        this.authToken = token;
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        this.carregarConfiguracoes();
    }

    setEmpresaAtual(empresa) {
        this.empresaAtual = empresa;
        this.invalidarCache();
        this.carregarDadosEmpresa();
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'X-Empresa-ID': this.empresaAtual.id.toString()
        };
        
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        return headers;
    }

    carregarConfiguracoes() {
        const saved = localStorage.getItem('bizflow_config');
        if (saved) {
            this.configuracoes = { ...this.configuracoes, ...JSON.parse(saved) };
        }
    }

    salvarConfiguracoes() {
        localStorage.setItem('bizflow_config', JSON.stringify(this.configuracoes));
    }

    aplicarConfiguracoes() {
        document.documentElement.setAttribute('data-bs-theme', this.configuracoes.tema);
        
        if (!this.configuracoes.websocket) {
            this.desconectarWebSocket();
        }
    }

    atualizarMetricasEmpresariais() {
        this.atualizarElemento('total-empresas', this.empresas.length.toString());
        this.atualizarElemento('total-filiais', this.filiais.length.toString());
        this.atualizarElemento('total-api-keys', this.apiKeys.length.toString());
    }

    atualizarMetricasSistema(metrics) {
        if (metrics) {
            this.atualizarElemento('metric-users', metrics.active_users?.toString() || '0');
            this.atualizarElemento('metric-products', metrics.active_products?.toString() || '0');
            this.atualizarElemento('metric-sales', metrics.completed_sales?.toString() || '0');
            this.atualizarElemento('metric-websocket', metrics.websocket_connections?.toString() || '0');
        }
    }

    atualizarStatusWebSocket(status, mensagem) {
        const elemento = document.getElementById('status-websocket');
        if (elemento) {
            const statusClasses = {
                connected: 'websocket-connected',
                disconnected: 'websocket-disconnected',
                connecting: 'websocket-connecting',
                error: 'websocket-error'
            };
            
            elemento.className = `websocket-status ${statusClasses[status] || 'websocket-disconnected'}`;
            elemento.innerHTML = `<i class="fas fa-${status === 'connected' ? 'check' : 'exclamation-triangle'} me-1"></i>${mensagem}`;
        }
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Agora mesmo';
        if (diffMins < 60) return `${diffMins} min atrás`;
        if (diffHours < 24) return `${diffHours} h atrás`;
        if (diffDays < 7) return `${diffDays} dias atrás`;
        
        return date.toLocaleDateString('pt-BR');
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${tipo} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${mensagem}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        const container = document.getElementById('alert-container') || this.criarContainerAlertas();
        container.appendChild(alertDiv);
        
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    criarContainerAlertas() {
        const container = document.createElement('div');
        container.id = 'alert-container';
        container.className = 'position-fixed top-0 start-50 translate-middle-x mt-3';
        container.style.zIndex = '1060';
        document.body.appendChild(container);
        return container;
    }

    atualizarElemento(id, conteudo) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = conteudo;
        }
    }

    ativarModoResiliente() {
        console.warn('🛡️ Ativando modo resiliente...');
        this.configuracoes.websocket = false;
        this.configuracoes.retryAuto = false;
        this.desconectarWebSocket();
        
        this.mostrarAlerta('Modo resiliente ativado. Algumas funcionalidades podem estar limitadas.', 'warning');
    }

    // Métodos de compatibilidade com FASE 4
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
                        <button class="btn btn-outline-primary btn-sm" onclick="trocarEmpresa(${empresa.id}, '${empresa.nome}')">
                            Selecionar
                        </button>
                    </div>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }

    exibirFiliais(filiais) {
        const container = document.getElementById('lista-filiais');
        if (container && filiais) {
            const html = filiais.map(filial => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${filial.nome}</h6>
                            <small class="text-muted">${filial.codigo} - ${filial.responsavel || 'Sem responsável'}</small>
                        </div>
                        <span class="badge ${filial.is_active ? 'bg-success' : 'bg-secondary'}">
                            ${filial.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }

    exibirApiKeys(apiKeys) {
        const container = document.getElementById('lista-api-keys');
        if (container) {
            if (!apiKeys || apiKeys.length === 0) {
                container.innerHTML = '<div class="text-center text-muted py-4">Nenhuma API Key gerada</div>';
                return;
            }
            
            const html = apiKeys.map(apiKey => `
                <div class="api-key-item border-bottom pb-3 mb-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="mb-1">${apiKey.name}</h6>
                            <small class="text-muted">Criada em: ${new Date(apiKey.created_at).toLocaleDateString('pt-BR')}</small>
                        </div>
                        <span class="badge ${apiKey.is_active ? 'bg-success' : 'bg-danger'}">
                            ${apiKey.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }

    carregarDadosEmpresa() {
        this.carregarEmpresas();
        this.carregarFiliais();
    }
}

// ================= INICIALIZAÇÃO E FUNÇÕES GLOBAIS FASE 5.1 =================

function trocarEmpresa(empresaId, empresaNome) {
    if (window.bizFlowApp) {
        window.bizFlowApp.setEmpresaAtual({ id: empresaId, nome: empresaNome });
        window.bizFlowApp.mostrarAlerta(`Empresa alterada para: ${empresaNome}`, 'info');
    }
}

function marcarTodasComoLidas() {
    if (window.bizFlowApp) {
        window.bizFlowApp.marcarTodasNotificacoesComoLidas();
    }
}

function testarConexoes() {
    if (window.bizFlowApp) {
        window.bizFlowApp.testarConexaoCompleta();
    }
}

function limparCache() {
    if (window.bizFlowApp) {
        window.bizFlowApp.invalidarCache();
        window.bizFlowApp.mostrarAlerta('Cache limpo com sucesso!', 'success');
    }
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    window.bizFlowApp = new BizFlowApp();
    
    const token = localStorage.getItem('bizflow_token');
    const user = localStorage.getItem('bizflow_user');
    
    if (token && user) {
        window.bizFlowApp.setAuthToken(token);
        window.bizFlowApp.init();
    } else {
        console.log('👤 Usuário não autenticado - carregando interface pública');
    }
});
