// BizFlow - Sistema de Gestão Integrada - FASE 3
// JavaScript Application Controller com Módulos Avançados

class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.authToken = null;
        this.currentUser = null;
        this.vendas = [];
        this.estoque = [];
        this.produtos = [];
        this.dashboardData = {};
        this.isOnline = false;
        this.relatoriosData = {};
        this.financeiroData = {};
    }

    async init() {
        try {
            console.log('🚀 Inicializando BizFlow App FASE 3...');
            
            // Verificar autenticação
            if (!this.authToken) {
                console.warn('⚠️ Usuário não autenticado');
                return;
            }
            
            // Testar conexão com a API
            await this.testarConexao();
            
            // Carregar dados iniciais
            await this.carregarDadosIniciais();
            
            // Configurar event listeners
            this.configurarEventListeners();
            
            // Iniciar atualizações automáticas
            this.iniciarAtualizacoesAutomaticas();
            
            console.log('✅ BizFlow App FASE 3 inicializado com sucesso!');
            this.mostrarAlerta('Sistema FASE 3 carregado! 🎉', 'success');
        } catch (error) {
            console.error('❌ Erro ao inicializar app:', error);
            this.mostrarAlerta('Modo offline ativado. Dados locais carregados.', 'warning');
            this.carregarDadosLocais();
        }
    }

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
            console.log('🔍 Testando conexão com a API...');
            
            const response = await fetch(`${this.API_BASE_URL}/health`, {
                method: 'GET',
                headers: this.getAuthHeaders(),
                timeout: 5000
            });
            
            if (!response.ok) {
                throw new Error(`Health check falhou: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'OK') {
                this.isOnline = true;
                this.atualizarStatusConexao('online', 'Conectado');
                console.log('✅ Conexão estabelecida com sucesso - FASE 3');
                return true;
            } else {
                throw new Error('Health check retornou status inválido');
            }
        } catch (error) {
            console.warn('⚠️ Health check falhou, tentando rota alternativa...');
            
            this.isOnline = false;
            this.atualizarStatusConexao('offline', 'Modo Offline');
            throw new Error('Servidor indisponível');
        }
    }

    async carregarDadosIniciais() {
        try {
            console.log('📥 Carregando dados iniciais FASE 3...');
            
            await Promise.all([
                this.carregarVendas(),
                this.carregarEstoque(),
                this.carregarDashboardAvancado(),
                this.carregarContasFinanceiras()
            ]);
            
            console.log('✅ Dados iniciais FASE 3 carregados com sucesso');
        } catch (error) {
            console.warn('⚠️ Erro ao carregar dados da API, usando modo offline');
            throw error;
        }
    }

    configurarEventListeners() {
        // Formulário de Vendas
        document.getElementById('venda-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarVenda();
        });

        // Formulário de Estoque
        document.getElementById('estoque-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.adicionarItemEstoque();
        });

        // Formulário Financeiro
        const financeiroForm = document.getElementById('financeiro-form');
        if (financeiroForm) {
            financeiroForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.registrarContaFinanceira();
            });
        }

        // Filtros de Relatórios
        const filtroRelatorio = document.getElementById('filtro-relatorio');
        if (filtroRelatorio) {
            filtroRelatorio.addEventListener('change', (e) => {
                this.carregarRelatorios(e.target.value);
            });
        }

        // Atalhos de teclado
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                const produto = document.getElementById('produto');
                if (produto === document.activeElement) {
                    document.getElementById('valor').focus();
                } else {
                    this.registrarVenda();
                }
            }
            
            if (e.key === 'Escape') {
                document.getElementById('venda-form').reset();
                document.getElementById('estoque-form').reset();
            }
        });

        // Online/Offline detection
        window.addEventListener('online', () => {
            this.verificarConexao();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.atualizarStatusConexao('offline', 'Sem Internet');
            this.mostrarAlerta('Conexão com internet perdida', 'warning');
        });
    }

    async verificarConexao() {
        try {
            await this.testarConexao();
            if (this.isOnline) {
                await this.carregarDadosIniciais();
                this.mostrarAlerta('Conexão restaurada! ✅', 'success');
            }
        } catch (error) {
            // Silencioso em caso de falha
        }
    }

    iniciarAtualizacoesAutomaticas() {
        // Atualizar dashboard a cada 30 segundos (apenas se online)
        setInterval(() => {
            if (this.isOnline && !document.hidden) {
                this.carregarDashboardAvancado();
            }
        }, 30000);

        // Verificar alertas a cada minuto
        setInterval(() => {
            this.verificarAlertasEstoque();
            this.verificarContasVencidas();
        }, 60000);
    }

    // ================= DASHBOARD AVANÇADO =================

    async carregarDashboardAvancado() {
        if (!this.isOnline) {
            this.atualizarDashboardLocal();
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/dashboard/avancado?periodo=30`, {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.dashboardData = data.data;
                this.atualizarDashboardAvancado(this.dashboardData);
                return true;
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard avançado:', error);
            this.atualizarDashboardLocal();
        }
    }

    atualizarDashboardAvancado(data) {
        if (!data.metricas) return;

        const metricas = data.metricas;
        
        // Atualizar métricas principais
        this.atualizarElemento('total-receita', `R$ ${metricas.receitaTotal.toFixed(2)}`);
        this.atualizarElemento('total-vendas', metricas.totalVendas.toString());
        this.atualizarElemento('total-produtos', metricas.totalProdutos.toString());
        
        // Novas métricas FASE 3
        this.atualizarElemento('ticket-medio', `R$ ${metricas.ticketMedio.toFixed(2)}`);
        this.atualizarElemento('lucro-total', `R$ ${metricas.lucro.toFixed(2)}`);
        this.atualizarElemento('contas-pendentes', metricas.contasPendentes.toString());
        this.atualizarElemento('alertas-estoque', metricas.alertasEstoque.toString());

        // Atualizar cards financeiros
        this.atualizarElemento('receitas-card', `R$ ${metricas.receitas.toFixed(2)}`);
        this.atualizarElemento('despesas-card', `R$ ${metricas.despesas.toFixed(2)}`);
        this.atualizarElemento('lucro-card', `R$ ${metricas.lucro.toFixed(2)}`);

        // Atualizar gráficos
        this.atualizarGraficoVendas(data.vendasPorDia);
        this.atualizarTopProdutos(data.topProdutos);
        
        this.animarAtualizacaoDashboard();
    }

    atualizarGraficoVendas(vendasPorDia) {
        const container = document.getElementById('grafico-vendas');
        if (!container || !vendasPorDia || vendasPorDia.length === 0) return;

        const labels = vendasPorDia.map(item => {
            const data = new Date(item.data);
            return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        
        const dadosVendas = vendasPorDia.map(item => item.quantidade_vendas);
        const dadosReceita = vendasPorDia.map(item => parseFloat(item.receita_dia));

        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0"><i class="fas fa-chart-line me-2"></i>Vendas dos Últimos 7 Dias</h6>
                </div>
                <div class="card-body">
                    <div style="height: 200px; position: relative;">
                        <canvas id="vendasChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        // Inicializar gráfico quando o DOM estiver pronto
        setTimeout(() => {
            this.inicializarGraficoVendas(labels, dadosVendas, dadosReceita);
        }, 100);
    }

    inicializarGraficoVendas(labels, dadosVendas, dadosReceita) {
        const ctx = document.getElementById('vendasChart');
        if (!ctx) return;

        // Simulação do Chart.js - em produção usar biblioteca real
        ctx.innerHTML = `
            <div class="text-center p-4">
                <div class="row">
                    <div class="col-6">
                        <small class="text-muted">Vendas por Dia</small>
                        <div class="mt-2">
                            ${dadosVendas.map((vendas, i) => `
                                <div class="d-flex align-items-center mb-1">
                                    <small class="me-2" style="width: 40px">${labels[i]}</small>
                                    <div class="progress flex-grow-1" style="height: 8px">
                                        <div class="progress-bar bg-primary" style="width: ${(vendas / Math.max(...dadosVendas)) * 100}%"></div>
                                    </div>
                                    <small class="ms-2">${vendas}</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="col-6">
                        <small class="text-muted">Receita por Dia (R$)</small>
                        <div class="mt-2">
                            ${dadosReceita.map((receita, i) => `
                                <div class="d-flex align-items-center mb-1">
                                    <small class="me-2" style="width: 40px">${labels[i]}</small>
                                    <div class="progress flex-grow-1" style="height: 8px">
                                        <div class="progress-bar bg-success" style="width: ${(receita / Math.max(...dadosReceita)) * 100}%"></div>
                                    </div>
                                    <small class="ms-2">${receita.toFixed(0)}</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    atualizarTopProdutos(topProdutos) {
        const container = document.getElementById('top-produtos');
        if (!container) return;

        if (!topProdutos || topProdutos.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Nenhum dado disponível</p>';
            return;
        }

        const html = topProdutos.slice(0, 5).map((produto, index) => `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center">
                        <span class="badge bg-primary me-2">${index + 1}</span>
                        <div>
                            <small class="fw-bold">${produto.product_name}</small>
                            <br>
                            <small class="text-muted">${produto.categoria || 'Geral'}</small>
                        </div>
                    </div>
                </div>
                <div class="text-end">
                    <small class="text-success fw-bold">${produto.total_vendido} un</small>
                    <br>
                    <small class="text-muted">R$ ${parseFloat(produto.receita_produto).toFixed(2)}</small>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // ================= RELATÓRIOS AVANÇADOS =================

    async carregarRelatorios(tipo = 'vendas') {
        if (!this.isOnline) {
            this.mostrarAlerta('Relatórios disponíveis apenas online', 'warning');
            return;
        }

        try {
            let url = '';
            switch(tipo) {
                case 'vendas':
                    url = '/api/relatorios/vendas';
                    break;
                case 'produtos':
                    url = '/api/relatorios/produtos';
                    break;
                case 'financeiro':
                    url = '/api/financeiro/fluxo-caixa';
                    break;
                default:
                    return;
            }

            const response = await fetch(`${this.API_BASE_URL}${url}`, {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            if (data.success) {
                this.relatoriosData[tipo] = data.data;
                this.exibirRelatorio(tipo, data.data);
            }
        } catch (error) {
            console.error(`Erro ao carregar relatório ${tipo}:`, error);
            this.mostrarAlerta(`Erro ao carregar relatório: ${error.message}`, 'danger');
        }
    }

    exibirRelatorio(tipo, dados) {
        const container = document.getElementById('relatorio-container');
        if (!container) return;

        let html = '';

        switch(tipo) {
            case 'vendas':
                html = this.gerarRelatorioVendas(dados);
                break;
            case 'produtos':
                html = this.gerarRelatorioProdutos(dados);
                break;
            case 'financeiro':
                html = this.gerarRelatorioFinanceiro(dados);
                break;
        }

        container.innerHTML = html;
    }

    gerarRelatorioVendas(dados) {
        return `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Relatório de Vendas</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th>Vendas</th>
                                    <th>Receita</th>
                                    <th>Ticket Médio</th>
                                    <th>Itens Vendidos</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${dados.resumo.map(item => `
                                    <tr>
                                        <td>${item.periodo}</td>
                                        <td>${item.total_vendas}</td>
                                        <td>R$ ${parseFloat(item.receita_total).toFixed(2)}</td>
                                        <td>R$ ${parseFloat(item.ticket_medio).toFixed(2)}</td>
                                        <td>${item.total_itens_vendidos}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // ================= MÓDULO FINANCEIRO =================

    async carregarContasFinanceiras() {
        if (!this.isOnline) return;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/financeiro/contas`, {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            if (data.success) {
                this.financeiroData.contas = data.data;
                this.exibirContasFinanceiras(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar contas financeiras:', error);
        }
    }

    async registrarContaFinanceira() {
        const form = document.getElementById('financeiro-form');
        if (!form) return;

        const nome = document.getElementById('conta-nome').value;
        const tipo = document.getElementById('conta-tipo').value;
        const categoria = document.getElementById('conta-categoria').value;
        const valor = parseFloat(document.getElementById('conta-valor').value);
        const dataVencimento = document.getElementById('conta-vencimento').value;

        if (!nome || !valor || !dataVencimento) {
            this.mostrarAlerta('Preencha todos os campos obrigatórios!', 'warning');
            return;
        }

        this.mostrarLoading(form, 'Registrando...');

        try {
            const contaData = {
                name: nome,
                type: tipo,
                category: categoria,
                amount: valor,
                due_date: dataVencimento,
                status: 'pendente'
            };

            const response = await fetch(`${this.API_BASE_URL}/api/financeiro/contas`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(contaData)
            });

            const data = await response.json();

            if (data.success) {
                form.reset();
                this.mostrarAlerta('Conta registrada com sucesso!', 'success');
                this.carregarContasFinanceiras();
                this.carregarDashboardAvancado();
            } else {
                throw new Error(data.error || 'Erro ao registrar conta');
            }
        } catch (error) {
            this.mostrarAlerta(error.message, 'danger');
        } finally {
            this.esconderLoading(form, 'Registrar Conta');
        }
    }

    exibirContasFinanceiras(contas) {
        const container = document.getElementById('lista-contas');
        if (!container) return;

        if (!contas || contas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-file-invoice-dollar fa-3x mb-3"></i>
                    <p>Nenhuma conta registrada</p>
                </div>
            `;
            return;
        }

        const html = contas.map(conta => {
            const badgeClass = conta.status === 'pago' || conta.status === 'recebido' ? 'bg-success' : 
                             conta.status === 'atrasado' ? 'bg-danger' : 'bg-warning';
            const tipoIcon = conta.type === 'receita' ? 'arrow-down' : 'arrow-up';
            const tipoClass = conta.type === 'receita' ? 'text-success' : 'text-danger';
            
            return `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-${tipoIcon} ${tipoClass} me-2"></i>
                                ${conta.name}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-tag me-1"></i>${conta.category || 'Outros'}
                                <i class="fas fa-calendar ms-2 me-1"></i>
                                ${new Date(conta.due_date).toLocaleDateString('pt-BR')}
                            </small>
                        </div>
                        <div class="text-end">
                            <span class="badge ${badgeClass} mb-1">${conta.status}</span>
                            <div>
                                <strong class="${tipoClass}">R$ ${conta.amount.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    verificarContasVencidas() {
        if (!this.financeiroData.contas) return;

        const hoje = new Date();
        const contasVencidas = this.financeiroData.contas.filter(conta => {
            const vencimento = new Date(conta.due_date);
            return vencimento < hoje && (conta.status === 'pendente');
        });

        if (contasVencidas.length > 0 && document.visibilityState === 'visible') {
            this.mostrarAlerta(
                `${contasVencidas.length} conta(s) vencida(s)! Verifique o módulo financeiro. ⚠️`,
                'warning'
            );
        }
    }

    // ================= VENDAS (mantido para compatibilidade) =================

    async carregarVendas() {
        if (!this.isOnline) {
            throw new Error('Offline mode');
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/vendas`, {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.mostrarAlerta('Sessão expirada. Faça login novamente.', 'warning');
                    window.authManager.handleLogout();
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.vendas = data.data;
                this.exibirVendas(this.vendas);
                return true;
            } else {
                throw new Error('Resposta da API inválida');
            }
        } catch (error) {
            console.error('Erro ao carregar vendas:', error);
            throw error;
        }
    }

    async registrarVenda() {
        const form = document.getElementById('venda-form');
        const produtoInput = document.getElementById('produto');
        const valorInput = document.getElementById('valor');
        const quantidadeInput = document.getElementById('quantidade-venda');
        
        const produto = produtoInput.value.trim();
        const valor = parseFloat(valorInput.value);
        const quantidade = parseInt(quantidadeInput.value) || 1;

        // Validação
        if (!produto) {
            this.mostrarAlerta('Informe o nome do produto!', 'warning');
            produtoInput.focus();
            return;
        }

        if (!valor || valor <= 0) {
            this.mostrarAlerta('Informe um valor válido!', 'warning');
            valorInput.focus();
            return;
        }

        if (quantidade < 1) {
            this.mostrarAlerta('Quantidade deve ser pelo menos 1!', 'warning');
            quantidadeInput.focus();
            return;
        }

        // Feedback visual
        this.mostrarLoading(form, 'Registrando...');

        try {
            let resultado;
            
            if (this.isOnline) {
                const vendaData = {
                    items: [{
                        id: Date.now(),
                        name: produto,
                        price: valor,
                        quantity: quantidade,
                        total: valor * quantidade
                    }],
                    total_amount: valor * quantidade,
                    total_items: quantidade,
                    payment_method: 'dinheiro',
                    notes: ''
                };

                const response = await fetch(`${this.API_BASE_URL}/api/vendas`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(vendaData)
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        this.mostrarAlerta('Sessão expirada. Faça login novamente.', 'warning');
                        window.authManager.handleLogout();
                        return;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                resultado = await response.json();

                if (!resultado.success) {
                    throw new Error(resultado.error || 'Erro ao registrar venda');
                }
            } else {
                // Modo offline - simular resposta
                resultado = {
                    success: true,
                    data: {
                        id: Date.now(),
                        produto,
                        valor,
                        quantidade,
                        data: new Date().toISOString().split('T')[0],
                        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: new Date().toISOString()
                    },
                    message: "Venda registrada (modo offline) 💰"
                };
                
                this.vendas.unshift(resultado.data);
            }

            // Limpar formulário
            form.reset();
            quantidadeInput.value = 1;
            produtoInput.focus();

            // Recarregar dados
            if (this.isOnline) {
                await this.carregarVendas();
                await this.carregarDashboardAvancado();
            } else {
                this.exibirVendas(this.vendas);
                this.atualizarDashboardLocal();
            }
            
            this.mostrarAlerta(resultado.message, 'success');
            this.animarRegistroSucesso();

        } catch (error) {
            console.error('Erro ao registrar venda:', error);
            this.mostrarAlerta(
                this.isOnline ? error.message : 'Venda salva localmente (sem sincronização)',
                this.isOnline ? 'danger' : 'warning'
            );
        } finally {
            this.esconderLoading(form, 'Registrar Venda');
        }
    }

    exibirVendas(vendas) {
        const container = document.getElementById('lista-vendas');
        
        if (!vendas || vendas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-receipt fa-3x mb-3"></i>
                    <p>Nenhuma venda registrada</p>
                    <small class="text-warning">
                        <i class="fas fa-${this.isOnline ? 'cloud' : 'wifi'} me-1"></i>
                        ${this.isOnline ? 'Online' : 'Offline'}
                    </small>
                </div>
            `;
            return;
        }

        const html = vendas.slice(0, 10).map(venda => {
            const produto = venda.produto || (venda.items && venda.items[0]?.product_name) || 'Produto não informado';
            const valor = venda.valor || venda.total_amount || 0;
            const quantidade = venda.quantidade || venda.total_items || 1;
            const data = venda.data || (venda.sale_date ? new Date(venda.sale_date).toISOString().split('T')[0] : 'N/D');
            const hora = venda.hora || (venda.sale_date ? new Date(venda.sale_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/D');
            
            return `
                <div class="list-group-item fade-in">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${produto}</h6>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>${data} 
                                <i class="fas fa-clock ms-2 me-1"></i>${hora}
                                ${!this.isOnline ? '<span class="badge bg-warning ms-2">Local</span>' : ''}
                            </small>
                        </div>
                        <div class="text-end">
                            <strong class="text-success">R$ ${valor.toFixed(2)}</strong>
                            <br>
                            <small class="text-muted">Qtd: ${quantidade}</small>
                        </div>
                    </div>
                    <div class="mt-2">
                        <small class="text-primary">
                            Total: <strong>R$ ${(valor * quantidade).toFixed(2)}</strong>
                        </small>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    // ================= ESTOQUE (mantido para compatibilidade) =================

    async carregarEstoque() {
        if (!this.isOnline) {
            throw new Error('Offline mode');
        }

        try {
            let response = await fetch(`${this.API_BASE_URL}/api/produtos`, {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.mostrarAlerta('Sessão expirada. Faça login novamente.', 'warning');
                    window.authManager.handleLogout();
                    return;
                }
                
                response = await fetch(`${this.API_BASE_URL}/api/estoque`, {
                    headers: this.getAuthHeaders()
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
            }
            
            const data = await response.json();
            
            if (data.success) {
                if (response.url.includes('/api/produtos')) {
                    this.estoque = data.data.map(item => ({
                        id: item.id,
                        produto: item.name,
                        quantidade: item.stock_quantity,
                        minimo: 5,
                        categoria: item.categoria || 'Geral',
                        preco: item.price || 0,
                        custo: item.cost || 0
                    }));
                } else {
                    this.estoque = data.data;
                }
                
                this.produtos = data.data;
                this.exibirEstoque(this.estoque);
                return true;
            } else {
                throw new Error('Resposta da API inválida');
            }
        } catch (error) {
            console.error('Erro ao carregar estoque:', error);
            throw error;
        }
    }

    async adicionarItemEstoque() {
        const form = document.getElementById('estoque-form');
        const produtoInput = document.getElementById('produto-estoque');
        const precoInput = document.getElementById('preco');
        const quantidadeInput = document.getElementById('quantidade');
        
        const produto = produtoInput.value.trim();
        const preco = parseFloat(precoInput.value);
        const quantidade = parseInt(quantidadeInput.value);

        // Validação
        if (!produto) {
            this.mostrarAlerta('Informe o nome do produto!', 'warning');
            produtoInput.focus();
            return;
        }

        if (!preco || preco <= 0) {
            this.mostrarAlerta('Informe um preço válido!', 'warning');
            precoInput.focus();
            return;
        }

        if (quantidade < 0) {
            this.mostrarAlerta('Quantidade não pode ser negativa!', 'warning');
            quantidadeInput.focus();
            return;
        }

        this.mostrarLoading(form, 'Adicionando...');

        try {
            let resultado;
            
            if (this.isOnline) {
                const produtoData = {
                    name: produto,
                    price: preco,
                    cost: preco * 0.7,
                    stock_quantity: quantidade,
                    category_id: 1,
                    sku: 'SKU' + Date.now()
                };

                const response = await fetch(`${this.API_BASE_URL}/api/produtos`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(produtoData)
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        this.mostrarAlerta('Sessão expirada. Faça login novamente.', 'warning');
                        window.authManager.handleLogout();
                        return;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                resultado = await response.json();

                if (!resultado.success) {
                    throw new Error(resultado.error || 'Erro ao adicionar produto');
                }
            } else {
                resultado = {
                    success: true,
                    data: {
                        id: Date.now(),
                        produto,
                        preco,
                        quantidade,
                        categoria: "Geral",
                        ultimaAtualizacao: new Date().toISOString()
                    },
                    message: "Produto adicionado (modo offline) 📦"
                };
                
                this.estoque.unshift(resultado.data);
            }

            form.reset();
            produtoInput.focus();

            if (this.isOnline) {
                await this.carregarEstoque();
                await this.carregarDashboardAvancado();
            } else {
                this.exibirEstoque(this.estoque);
                this.atualizarDashboardLocal();
            }
            
            this.mostrarAlerta(resultado.message, 'success');

        } catch (error) {
            console.error('Erro ao adicionar produto:', error);
            this.mostrarAlerta(
                this.isOnline ? error.message : 'Produto salvo localmente (sem sincronização)',
                this.isOnline ? 'danger' : 'warning'
            );
        } finally {
            this.esconderLoading(form, 'Adicionar Produto');
        }
    }

    exibirEstoque(estoque) {
        const container = document.getElementById('lista-estoque');
        
        if (!estoque || estoque.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-box-open fa-3x mb-3"></i>
                    <p>Nenhum produto cadastrado</p>
                    <small class="text-warning">
                        <i class="fas fa-${this.isOnline ? 'cloud' : 'wifi'} me-1"></i>
                        ${this.isOnline ? 'Online' : 'Offline'}
                    </small>
                </div>
            `;
            return;
        }

        const html = estoque.map(item => {
            const alerta = item.quantidade <= (item.minimo || 5);
            const badgeClass = alerta ? 'bg-danger' : 'bg-success';
            const badgeText = alerta ? 'Baixo' : 'OK';
            const icon = alerta ? 'exclamation-triangle' : 'check';
            
            return `
                <div class="list-group-item fade-in ${alerta ? 'border-warning' : ''}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${item.produto}</h6>
                            <small class="text-muted">
                                <i class="fas fa-tag me-1"></i>${item.categoria || 'Geral'}
                                ${item.preco ? `<br><i class="fas fa-dollar-sign me-1"></i>R$ ${parseFloat(item.preco || 0).toFixed(2)}` : ''}
                                ${!this.isOnline ? '<span class="badge bg-warning ms-2">Local</span>' : ''}
                            </small>
                        </div>
                        <div class="text-end">
                            <span class="badge ${badgeClass}">
                                <i class="fas fa-${icon} me-1"></i>${badgeText}
                            </span>
                            <div class="mt-1">
                                <small class="text-muted">
                                    ${item.quantidade} unidades
                                </small>
                            </div>
                        </div>
                    </div>
                    ${alerta ? `
                        <div class="alert alert-warning mt-2 py-1 mb-0">
                            <small>
                                <i class="fas fa-exclamation-triangle me-1"></i>
                                <strong>Alerta:</strong> Estoque baixo!
                            </small>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    // ================= UTILITÁRIOS =================

    animarAtualizacaoDashboard() {
        const cards = document.querySelectorAll('#dashboard-cards .card');
        cards.forEach((card, index) => {
            card.style.animation = 'none';
            setTimeout(() => {
                card.style.animation = 'pulse 0.6s ease-in-out';
            }, index * 100);
        });
    }

    atualizarElemento(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = valor;
        }
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        const alerta = document.createElement('div');
        alerta.className = `alert alert-${tipo} alert-flutuante alert-dismissible fade show`;
        alerta.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            max-width: 500px;
            box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15);
            border-radius: 0.75rem;
            border-left: 4px solid var(--${tipo}-color);
        `;
        
        alerta.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-${this.obterIconeAlerta(tipo)} me-2"></i>
                <div class="flex-grow-1">${mensagem}</div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
            </div>
        `;

        document.body.appendChild(alerta);

        const timeout = tipo === 'warning' ? 10000 : 5000;
        setTimeout(() => {
            if (alerta.parentNode) {
                try {
                    alerta.remove();
                } catch (e) {}
            }
        }, timeout);
    }

    obterIconeAlerta(tipo) {
        const icones = {
            success: 'check-circle',
            danger: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icones[tipo] || 'info-circle';
    }

    mostrarLoading(elemento, texto = 'Carregando...') {
        elemento.classList.add('loading');
        const botoes = elemento.querySelectorAll('button[type="submit"]');
        botoes.forEach(botao => {
            botao.disabled = true;
            const iconeOriginal = botao.innerHTML.match(/fa-([^\s"]+)/)?.[1] || 'save';
            botao.setAttribute('data-original-icon', iconeOriginal);
            botao.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>${texto}`;
        });
    }

    esconderLoading(elemento, textoOriginal = 'Salvar') {
        elemento.classList.remove('loading');
        const botoes = elemento.querySelectorAll('button[type="submit"]');
        botoes.forEach(botao => {
            botao.disabled = false;
            const iconeOriginal = botao.getAttribute('data-original-icon') || 
                                (botao.className.includes('btn-success') ? 'check' : 'save');
            botao.innerHTML = `<i class="fas fa-${iconeOriginal} me-1"></i> ${textoOriginal}`;
        });
    }

    animarRegistroSucesso() {
        const form = document.getElementById('venda-form');
        form.style.transform = 'scale(0.98)';
        setTimeout(() => {
            form.style.transform = 'scale(1)';
            form.style.transition = 'transform 0.3s ease';
        }, 150);
    }

    atualizarStatusConexao(status, mensagem) {
        const elemento = document.getElementById('status-conexao');
        if (elemento) {
            const isOnline = status === 'online';
            elemento.className = `badge bg-${isOnline ? 'success' : 'warning'}`;
            elemento.innerHTML = `<i class="fas fa-${isOnline ? 'wifi' : 'exclamation-triangle'} me-1"></i>${mensagem}`;
        }
    }

    verificarAlertasEstoque() {
        const alertas = this.estoque.filter(item => item.quantidade <= (item.minimo || 5));
        
        if (alertas.length > 0 && document.visibilityState === 'visible') {
            const ultimoAlerta = localStorage.getItem('ultimoAlertaEstoque');
            const agora = new Date().getTime();
            
            if (!ultimoAlerta || (agora - parseInt(ultimoAlerta)) > 300000) {
                this.mostrarAlerta(
                    `${alertas.length} produto(s) com estoque baixo! Verifique o módulo de estoque. ⚠️`,
                    'warning'
                );
                localStorage.setItem('ultimoAlertaEstoque', agora.toString());
            }
        }
    }

    atualizarDashboardLocal() {
        const receitaTotal = this.vendas.reduce((sum, v) => {
            const valor = v.valor || v.total_amount || 0;
            const quantidade = v.quantidade || v.total_items || 1;
            return sum + (valor * quantidade);
        }, 0);
        
        const totalVendas = this.vendas.length;
        const totalProdutos = this.estoque.length;
        const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;

        const dataLocal = {
            metricas: {
                receitaTotal,
                totalVendas,
                totalProdutos,
                ticketMedio,
                lucro: receitaTotal * 0.3, // Estimativa
                contasPendentes: 0,
                alertasEstoque: this.estoque.filter(item => item.quantidade <= 5).length
            }
        };

        this.atualizarDashboardAvancado(dataLocal);
    }

    carregarDadosLocais() {
        console.log('📂 Carregando dados locais FASE 3...');
        
        this.vendas = [
            { id: 1, produto: "Café Expresso", valor: 5.00, quantidade: 1, data: "2024-01-15", hora: "10:30" },
            { id: 2, produto: "Pão de Queijo", valor: 4.50, quantidade: 2, data: "2024-01-15", hora: "11:15" }
        ];

        this.estoque = [
            { id: 1, produto: "Café em Grãos", quantidade: 50, preco: 24.90, categoria: "Matéria-prima" },
            { id: 2, produto: "Leite", quantidade: 25, preco: 6.50, categoria: "Laticínios" }
        ];

        this.atualizarDashboardLocal();
        this.exibirVendas(this.vendas);
        this.exibirEstoque(this.estoque);
        
        console.log('✅ Dados locais FASE 3 carregados');
    }
}

// ================= INICIALIZAÇÃO DA APLICAÇÃO =================

// Funções globais
function exportarRelatorio() {
    if (window.bizFlowApp) {
        window.bizFlowApp.mostrarAlerta('Exportação de relatórios em desenvolvimento!', 'info');
    }
}

function gerarRelatorio(tipo) {
    if (window.bizFlowApp) {
        window.bizFlowApp.carregarRelatorios(tipo);
    }
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    window.bizFlowApp = new BizFlowApp();
    
    document.getElementById('ano-atual').textContent = new Date().getFullYear();
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'all 0.6s ease-out';
        observer.observe(section);
    });
});

// Prevenir envio de formulários com Enter (exceto textareas)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.classList.contains('btn')) {
        e.preventDefault();
    }
});
