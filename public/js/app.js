// BizFlow - Sistema Empresarial - FASE 4 COMPLETA
// JavaScript Application Controller com Todos os Módulos Empresariais

class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = null;
        this.currentUser = null;
        this.empresaAtual = { id: 1, nome: 'Empresa Principal' };
        this.socket = null;
        this.isOnline = false;
        this.isWebSocketConnected = false;
        this.notifications = [];
        this.configuracoes = {
            tema: 'light',
            notificacoes: true,
            websocket: true,
            atualizacaoAuto: true
        };
        
        // Dados FASE 4
        this.empresas = [];
        this.filiais = [];
        this.apiKeys = [];
        this.userGroups = [];
    }

    async init() {
        try {
            console.log('🚀 Inicializando BizFlow App FASE 4 EMPRESARIAL...');
            
            // Verificar autenticação
            if (!this.authToken) {
                console.warn('⚠️ Usuário não autenticado');
                return;
            }
            
            // Testar conexão com a API
            await this.testarConexao();
            
            // Conectar WebSocket
            if (this.configuracoes.websocket) {
                this.conectarWebSocket();
            }
            
            // Carregar dados iniciais FASE 4
            await this.carregarDadosIniciaisFase4();
            
            // Configurar event listeners FASE 4
            this.configurarEventListenersFase4();
            
            // Aplicar configurações
            this.aplicarConfiguracoes();
            
            // Iniciar atualizações automáticas
            this.iniciarAtualizacoesAutomaticas();
            
            console.log('✅ BizFlow App FASE 4 EMPRESARIAL inicializado com sucesso!');
            this.mostrarAlerta('Sistema FASE 4 EMPRESARIAL carregado! 🏢', 'success');
        } catch (error) {
            console.error('❌ Erro ao inicializar app FASE 4:', error);
            this.mostrarAlerta('Modo offline ativado. Dados locais carregados.', 'warning');
        }
    }

    setAuthToken(token) {
        this.authToken = token;
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        this.carregarConfiguracoes();
    }

    setEmpresaAtual(empresa) {
        this.empresaAtual = empresa;
    }

    // ================= WEBSOCKET FASE 4 =================

    conectarWebSocket() {
        try {
            this.socket = io(this.API_BASE_URL, {
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                console.log('🔌 Conectado ao WebSocket FASE 4');
                this.isWebSocketConnected = true;
                this.atualizarStatusWebSocket('connected', 'WebSocket Conectado');
                
                // Autenticar WebSocket
                this.socket.emit('authenticate', { token: this.authToken });
            });

            this.socket.on('authenticated', (data) => {
                if (data.success) {
                    console.log('✅ Autenticado no WebSocket FASE 4');
                } else {
                    console.error('❌ Falha na autenticação WebSocket:', data.error);
                }
            });

            this.socket.on('notification', (notification) => {
                console.log('🔔 Nova notificação via WebSocket:', notification);
                this.adicionarNotificacao(notification);
                this.mostrarAlerta(`Nova notificação: ${notification.title}`, 'info');
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

            this.socket.on('disconnect', () => {
                console.log('🔌 Desconectado do WebSocket');
                this.isWebSocketConnected = false;
                this.atualizarStatusWebSocket('disconnected', 'WebSocket Desconectado');
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Erro de conexão WebSocket:', error);
                this.isWebSocketConnected = false;
                this.atualizarStatusWebSocket('error', 'Erro WebSocket');
            });

        } catch (error) {
            console.error('❌ Erro ao conectar WebSocket:', error);
        }
    }

    desconectarWebSocket() {
        if (this.socket) {
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

    // ================= MULTI-EMPRESA FASE 4 =================

    async carregarDadosIniciaisFase4() {
        try {
            console.log('📥 Carregando dados FASE 4...');
            
            await Promise.all([
                this.carregarEmpresas(),
                this.carregarFiliais(),
                this.carregarApiKeys(),
                this.carregarUserGroups(),
                this.carregarNotificacoes()
            ]);
            
            console.log('✅ Dados FASE 4 carregados com sucesso');
        } catch (error) {
            console.warn('⚠️ Erro ao carregar dados FASE 4:', error);
        }
    }

    async carregarEmpresas() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/empresas`, {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            if (data.success) {
                this.empresas = data.data;
                this.exibirEmpresas(this.empresas);
                this.atualizarMetricasEmpresariais();
            }
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
        }
    }

    async carregarFiliais() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/filiais`, {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
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
            // Implementar carregamento de API Keys
            // Por enquanto, vamos simular
            this.apiKeys = [];
            this.exibirApiKeys(this.apiKeys);
        } catch (error) {
            console.error('Erro ao carregar API Keys:', error);
        }
    }

    async carregarUserGroups() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/grupos`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.userGroups = data.data;
                }
            }
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
        }
    }

    exibirEmpresas(empresas) {
        const container = document.getElementById('lista-empresas');
        const modalContainer = document.getElementById('modal-lista-empresas');
        
        if (!empresas || empresas.length === 0) {
            const emptyHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-building fa-3x mb-3"></i>
                    <p>Nenhuma empresa cadastrada</p>
                </div>
            `;
            
            if (container) container.innerHTML = emptyHTML;
            if (modalContainer) modalContainer.innerHTML = emptyHTML;
            return;
        }

        const html = empresas.map(empresa => {
            const isCurrent = empresa.id === this.empresaAtual.id;
            
            return `
                <div class="list-group-item empresa-list-item ${isCurrent ? 'active' : ''}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-building me-2"></i>
                                ${empresa.nome}
                                ${isCurrent ? '<span class="badge bg-success ms-2">Atual</span>' : ''}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-id-card me-1"></i>${empresa.cnpj || 'Sem CNPJ'}
                                <i class="fas fa-phone ms-2 me-1"></i>${empresa.telefone || 'Sem telefone'}
                            </small>
                        </div>
                        <div class="btn-group">
                            ${!isCurrent ? `
                                <button class="btn btn-outline-primary btn-sm" onclick="trocarEmpresa(${empresa.id}, '${empresa.nome}')">
                                    <i class="fas fa-exchange-alt me-1"></i>Selecionar
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (container) container.innerHTML = html;
        if (modalContainer) modalContainer.innerHTML = html;
    }

    exibirFiliais(filiais) {
        const container = document.getElementById('lista-filiais');
        
        if (!filiais || filiais.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-store fa-3x mb-3"></i>
                    <p>Nenhuma filial cadastrada</p>
                </div>
            `;
            return;
        }

        const html = filiais.map(filial => {
            const isCurrent = filial.id === this.currentUser.filial_id;
            
            return `
                <div class="list-group-item filial-list-item ${isCurrent ? 'active' : ''}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-store me-2"></i>
                                ${filial.nome}
                                ${isCurrent ? '<span class="badge bg-success ms-2">Atual</span>' : ''}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-code me-1"></i>${filial.codigo}
                                <i class="fas fa-user ms-2 me-1"></i>${filial.responsavel || 'Sem responsável'}
                                <i class="fas fa-phone ms-2 me-1"></i>${filial.telefone || 'Sem telefone'}
                            </small>
                        </div>
                        <div>
                            <span class="badge ${filial.is_active ? 'bg-success' : 'bg-secondary'}">
                                ${filial.is_active ? 'Ativa' : 'Inativa'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    exibirApiKeys(apiKeys) {
        const container = document.getElementById('lista-api-keys');
        const modalContainer = document.getElementById('modal-lista-api-keys');
        
        if (!apiKeys || apiKeys.length === 0) {
            const emptyHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-key fa-3x mb-3"></i>
                    <p>Nenhuma API Key gerada</p>
                </div>
            `;
            
            if (container) container.innerHTML = emptyHTML;
            if (modalContainer) modalContainer.innerHTML = emptyHTML;
            return;
        }

        const html = apiKeys.map(apiKey => {
            const isExpired = apiKey.expires_at && new Date(apiKey.expires_at) < new Date();
            const isActive = apiKey.is_active && !isExpired;
            
            return `
                <div class="api-key-item">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">
                                <i class="fas fa-key me-2"></i>
                                ${apiKey.name}
                                <span class="badge ${isActive ? 'bg-success' : 'bg-danger'}">
                                    ${isActive ? 'Ativa' : isExpired ? 'Expirada' : 'Inativa'}
                                </span>
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>
                                Criada em: ${new Date(apiKey.created_at).toLocaleDateString('pt-BR')}
                                ${apiKey.expires_at ? ` | Expira em: ${new Date(apiKey.expires_at).toLocaleDateString('pt-BR')}` : ''}
                            </small>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-outline-danger btn-sm" onclick="bizFlowApp.revogarApiKey(${apiKey.id})">
                                <i class="fas fa-ban me-1"></i>Revogar
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-2">
                        <strong>API Key:</strong>
                        <div class="api-key-secret mt-1">${apiKey.api_key}</div>
                    </div>
                    
                    ${apiKey.secret_key ? `
                    <div class="mb-2">
                        <strong>Secret Key:</strong>
                        <div class="api-key-secret mt-1">${apiKey.secret_key}</div>
                        <small class="text-warning">
                            <i class="fas fa-exclamation-triangle me-1"></i>
                            Guarde esta chave com segurança! Ela só será mostrada uma vez.
                        </small>
                    </div>
                    ` : ''}
                    
                    <div>
                        <strong>Permissões:</strong>
                        <div class="mt-1">
                            ${apiKey.permissions && apiKey.permissions.length > 0 ? 
                                apiKey.permissions.map(perm => 
                                    `<span class="badge bg-primary me-1">${perm}</span>`
                                ).join('') : 
                                '<span class="badge bg-secondary">Nenhuma permissão</span>'
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (container) container.innerHTML = html;
        if (modalContainer) modalContainer.innerHTML = html;
    }

    // ================= NOTIFICAÇÕES FASE 4 =================

    async carregarNotificacoes() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/notifications?unread_only=true`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.notifications = data.data;
                    this.exibirNotificacoes(this.notifications);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    exibirNotificacoes(notifications) {
        const container = document.getElementById('notifications-list');
        const badge = document.getElementById('notification-count');
        
        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<li class="px-3 py-2 text-muted text-center">Nenhuma notificação</li>';
            if (badge) badge.textContent = '0';
            return;
        }

        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (badge) badge.textContent = unreadCount;

        const html = notifications.slice(0, 5).map(notification => {
            const typeClass = `notification-${notification.type || 'info'} ${notification.is_read ? '' : 'notification-unread'}`;
            const timeAgo = this.formatTimeAgo(new Date(notification.created_at));
            
            return `
                <li>
                    <div class="notification-item ${typeClass}">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <h6 class="mb-1">${notification.title}</h6>
                                <p class="mb-1">${notification.message}</p>
                                <small class="text-muted">${timeAgo}</small>
                            </div>
                            ${!notification.is_read ? `
                                <button class="btn btn-sm btn-outline-primary" onclick="bizFlowApp.marcarNotificacaoComoLida(${notification.id})">
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
                // Atualizar localmente
                const notification = this.notifications.find(n => n.id === notificationId);
                if (notification) {
                    notification.is_read = true;
                }
                this.exibirNotificacoes(this.notifications);
            }
        } catch (error) {
            console.error('Erro ao marcar notificação como lida:', error);
        }
    }

    async marcarTodasNotificacoesComoLidas() {
        try {
            for (const notification of this.notifications.filter(n => !n.is_read)) {
                await this.marcarNotificacaoComoLida(notification.id);
            }
            this.mostrarAlerta('Todas as notificações marcadas como lidas', 'success');
        } catch (error) {
            console.error('Erro ao marcar notificações como lidas:', error);
        }
    }

    // ================= CONFIGURAÇÕES FASE 4 =================

    configurarEventListenersFase4() {
        // Formulário Nova Empresa
        const empresaForm = document.getElementById('empresa-form');
        if (empresaForm) {
            empresaForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleNovaEmpresa();
            });
        }

        // Formulário Nova Filial
        const filialForm = document.getElementById('filial-form');
        if (filialForm) {
            filialForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleNovaFilial();
            });
        }

        // Formulário Nova API Key
        const apiKeyForm = document.getElementById('api-key-form');
        if (apiKeyForm) {
            apiKeyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleNovaApiKey();
            });
        }

        // Configurações WebSocket
        const websocketSwitch = document.getElementById('config-websocket');
        if (websocketSwitch) {
            websocketSwitch.checked = this.configuracoes.websocket;
        }
    }

    async handleNovaEmpresa() {
        const form = document.getElementById('empresa-form');
        const nome = document.getElementById('empresa-nome').value;
        const cnpj = document.getElementById('empresa-cnpj').value;
        const email = document.getElementById('empresa-email').value;
        const telefone = document.getElementById('empresa-telefone').value;

        if (!nome) {
            this.mostrarAlerta('Nome da empresa é obrigatório!', 'warning');
            return;
        }

        this.mostrarLoading(form, 'Cadastrando...');

        try {
            const empresaData = {
                nome,
                cnpj,
                email,
                telefone
            };

            const response = await fetch(`${this.API_BASE_URL}/api/empresas`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(empresaData)
            });

            const data = await response.json();

            if (data.success) {
                form.reset();
                this.mostrarAlerta('Empresa cadastrada com sucesso!', 'success');
                this.carregarEmpresas();
            } else {
                throw new Error(data.error || 'Erro ao cadastrar empresa');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        } finally {
            this.esconderLoading(form, 'Cadastrar Empresa');
        }
    }

    async handleNovaFilial() {
        const form = document.getElementById('filial-form');
        const nome = document.getElementById('filial-nome').value;
        const codigo = document.getElementById('filial-codigo').value;
        const responsavel = document.getElementById('filial-responsavel').value;
        const telefone = document.getElementById('filial-telefone').value;

        if (!nome || !codigo) {
            this.mostrarAlerta('Nome e código são obrigatórios!', 'warning');
            return;
        }

        this.mostrarLoading(form, 'Cadastrando...');

        try {
            const filialData = {
                nome,
                codigo,
                responsavel,
                telefone
            };

            const response = await fetch(`${this.API_BASE_URL}/api/filiais`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(filialData)
            });

            const data = await response.json();

            if (data.success) {
                form.reset();
                this.mostrarAlerta('Filial cadastrada com sucesso!', 'success');
                this.carregarFiliais();
            } else {
                throw new Error(data.error || 'Erro ao cadastrar filial');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        } finally {
            this.esconderLoading(form, 'Cadastrar Filial');
        }
    }

    async handleNovaApiKey() {
        const form = document.getElementById('api-key-form');
        const name = document.getElementById('api-key-name').value;
        const expires = document.getElementById('api-key-expires').value;
        
        const permissionsSelect = document.getElementById('api-key-permissions');
        const permissions = Array.from(permissionsSelect.selectedOptions).map(option => option.value);

        if (!name) {
            this.mostrarAlerta('Nome da API Key é obrigatório!', 'warning');
            return;
        }

        this.mostrarLoading(form, 'Gerando...');

        try {
            const apiKeyData = {
                name,
                permissions,
                expires_in_days: expires ? parseInt(expires) : null
            };

            const response = await fetch(`${this.API_BASE_URL}/api/api-keys/generate`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(apiKeyData)
            });

            const data = await response.json();

            if (data.success) {
                form.reset();
                this.mostrarAlerta('API Key gerada com sucesso!', 'success');
                this.apiKeys.unshift(data.data);
                this.exibirApiKeys(this.apiKeys);
                
                // Mostrar modal com a nova API Key
                this.mostrarModalApiKey(data.data);
            } else {
                throw new Error(data.error || 'Erro ao gerar API Key');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        } finally {
            this.esconderLoading(form, 'Gerar API Key');
        }
    }

    // ================= UTILITÁRIOS FASE 4 =================

    atualizarMetricasEmpresariais() {
        this.atualizarElemento('total-empresas', this.empresas.length.toString());
        this.atualizarElemento('total-empresas-card', this.empresas.length.toString());
        this.atualizarElemento('total-filiais', this.filiais.length.toString());
        this.atualizarElemento('total-usuarios', '1'); // Implementar contagem de usuários
        this.atualizarElemento('total-api-keys', this.apiKeys.length.toString());
    }

    atualizarStatusWebSocket(status, mensagem) {
        const elemento = document.getElementById('status-websocket');
        if (elemento) {
            const statusClasses = {
                connected: 'websocket-connected',
                disconnected: 'websocket-disconnected',
                connecting: 'websocket-connecting',
                error: 'websocket-disconnected'
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

    mostrarModalApiKey(apiKeyData) {
        const modalHTML = `
            <div class="modal fade" id="apiKeyModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-success text-white">
                            <h5 class="modal-title"><i class="fas fa-key me-2"></i>API Key Gerada</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Guarde estas informações com segurança!</strong>
                                A secret key só será mostrada esta vez.
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label"><strong>API Key:</strong></label>
                                <div class="api-key-secret">${apiKeyData.api_key}</div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label"><strong>Secret Key:</strong></label>
                                <div class="api-key-secret">${apiKeyData.secret_key}</div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label"><strong>Expira em:</strong></label>
                                <div>${apiKeyData.expires_at ? new Date(apiKeyData.expires_at).toLocaleDateString('pt-BR') : 'Não expira'}</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-success" data-bs-dismiss="modal">
                                <i class="fas fa-check me-1"></i>Entendi
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Adicionar modal ao DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);

        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
        modal.show();

        // Remover modal do DOM após fechar
        document.getElementById('apiKeyModal').addEventListener('hidden.bs.modal', function () {
            modalContainer.remove();
        });
    }

    // ================= MÉTODOS HERDADOS (atualizados) =================

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'X-Empresa-ID': this.empresaAtual.id
        };
        
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        return headers;
    }

    carregarDadosEmpresa() {
        // Recarregar todos os dados específicos da empresa
        this.carregarDashboardAvancado();
        this.carregarVendas();
        this.carregarEstoque();
        this.carregarContasFinanceiras();
        this.carregarFiliais();
    }

    // ... (manter todos os outros métodos da FASE 3, atualizados com multi-empresa)
}

// ================= INICIALIZAÇÃO E FUNÇÕES GLOBAIS =================

// Funções globais FASE 4
function trocarEmpresa(empresaId, empresaNome) {
    if (window.bizFlowApp) {
        window.bizFlowApp.setEmpresaAtual({ id: empresaId, nome: empresaNome });
        window.bizFlowApp.carregarDadosEmpresa();
        window.bizFlowApp.mostrarAlerta(`Empresa alterada para: ${empresaNome}`, 'info');
    }
}

function marcarTodasComoLidas() {
    if (window.bizFlowApp) {
        window.bizFlowApp.marcarTodasNotificacoesComoLidas();
    }
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    window.bizFlowApp = new BizFlowApp();
});
