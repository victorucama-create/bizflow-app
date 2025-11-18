// BizFlow - Sistema de Gestão Integrada - FASE 3 COMPLETA
// JavaScript Application Controller com Todos os Módulos Avançados

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
        this.backupData = {};
        this.configuracoes = {
            tema: 'claro',
            notificacoes: true,
            atualizacaoAuto: true
        };
    }

    async init() {
        try {
            console.log('🚀 Inicializando BizFlow App FASE 3 COMPLETA...');
            
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
            
            // Aplicar configurações
            this.aplicarConfiguracoes();
            
            // Iniciar atualizações automáticas
            this.iniciarAtualizacoesAutomaticas();
            
            console.log('✅ BizFlow App FASE 3 COMPLETA inicializado com sucesso!');
            this.mostrarAlerta('Sistema FASE 3 COMPLETA carregado! 🎉', 'success');
        } catch (error) {
            console.error('❌ Erro ao inicializar app:', error);
            this.mostrarAlerta('Modo offline ativado. Dados locais carregados.', 'warning');
            this.carregarDadosLocais();
        }
    }

    setAuthToken(token) {
        this.authToken = token;
        this.currentUser = JSON.parse(localStorage.getItem('bizflow_user') || 'null');
        this.carregarConfiguracoes();
    }

    carregarConfiguracoes() {
        const configSalvas = localStorage.getItem(`bizflow_config_${this.currentUser?.id}`);
        if (configSalvas) {
            this.configuracoes = { ...this.configuracoes, ...JSON.parse(configSalvas) };
        }
    }

    salvarConfiguracoes() {
        if (this.currentUser) {
            localStorage.setItem(`bizflow_config_${this.currentUser.id}`, JSON.stringify(this.configuracoes));
        }
    }

    aplicarConfiguracoes() {
        // Aplicar tema
        document.body.setAttribute('data-bs-theme', this.configuracoes.tema);
        
        // Configurar notificações
        if (!this.configuracoes.notificacoes) {
            this.desativarNotificacoes();
        }
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
                this.atualizarStatusConexao('online', 'Conectado - FASE 3');
                console.log('✅ Conexão estabelecida com sucesso - FASE 3 COMPLETA');
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
            console.log('📥 Carregando dados iniciais FASE 3 COMPLETA...');
            
            await Promise.all([
                this.carregarVendas(),
                this.carregarEstoque(),
                this.carregarDashboardAvancado(),
                this.carregarContasFinanceiras(),
                this.carregarBackups(),
                this.carregarCategorias()
            ]);
            
            console.log('✅ Dados iniciais FASE 3 COMPLETA carregados com sucesso');
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

        // Filtros de Data
        const dataInicio = document.getElementById('data-inicio');
        const dataFim = document.getElementById('data-fim');
        if (dataInicio && dataFim) {
            // Definir datas padrão (últimos 30 dias)
            const hoje = new Date();
            const trintaDiasAtras = new Date(hoje.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            dataInicio.value = trintaDiasAtras.toISOString().split('T')[0];
            dataFim.value = hoje.toISOString().split('T')[0];
        }

        // Configurações
        const temaSelect = document.getElementById('config-tema');
        if (temaSelect) {
            temaSelect.value = this.configuracoes.tema;
            temaSelect.addEventListener('change', (e) => {
                this.configuracoes.tema = e.target.value;
                this.aplicarConfiguracoes();
                this.salvarConfiguracoes();
            });
        }

        const notificacoesSwitch = document.getElementById('config-notificacoes');
        if (notificacoesSwitch) {
            notificacoesSwitch.checked = this.configuracoes.notificacoes;
            notificacoesSwitch.addEventListener('change', (e) => {
                this.configuracoes.notificacoes = e.target.checked;
                this.salvarConfiguracoes();
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

            // Atalhos para navegação
            if (e.ctrlKey) {
                switch(e.key) {
                    case '1':
                        e.preventDefault();
                        scrollToSection('dashboard');
                        break;
                    case '2':
                        e.preventDefault();
                        scrollToSection('vendas');
                        break;
                    case '3':
                        e.preventDefault();
                        scrollToSection('estoque');
                        break;
                    case '4':
                        e.preventDefault();
                        scrollToSection('financeiro');
                        break;
                    case '5':
                        e.preventDefault();
                        scrollToSection('relatorios');
                        break;
                    case '6':
                        e.preventDefault();
                        scrollToSection('backup');
                        break;
                }
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

        // Visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.carregarDashboardAvancado();
            }
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
        if (!this.configuracoes.atualizacaoAuto) return;

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

        // Backup automático a cada 6 horas (apenas se online e admin)
        setInterval(() => {
            if (this.isOnline && !document.hidden && this.currentUser?.role === 'admin') {
                this.backupAutomatico();
            }
        }, 6 * 60 * 60 * 1000);
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
        this.atualizarElemento('vendas-hoje', metricas.vendasHoje.toString());
        this.atualizarElemento('receita-hoje', `R$ ${metricas.receitaHoje.toFixed(2)}`);

        // Atualizar cards financeiros
        this.atualizarElemento('receitas-card', `R$ ${metricas.receitas.toFixed(2)}`);
        this.atualizarElemento('despesas-card', `R$ ${metricas.despesas.toFixed(2)}`);
        this.atualizarElemento('lucro-card', `R$ ${metricas.lucro.toFixed(2)}`);

        // Atualizar gráficos
        this.atualizarGraficoVendas(data.vendasPorDia);
        this.atualizarTopProdutos(data.topProdutos);
        this.atualizarMetodosPagamento(data.metodosPagamento);
        
        this.animarAtualizacaoDashboard();
    }

    atualizarGraficoVendas(vendasPorDia) {
        const container = document.getElementById('grafico-vendas');
        if (!container || !vendasPorDia || vendasPorDia.length === 0) {
            container.innerHTML = this.criarPlaceholderGrafico('Vendas dos Últimos 7 Dias');
            return;
        }

        const labels = vendasPorDia.map(item => {
            const data = new Date(item.data);
            return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        
        const dadosVendas = vendasPorDia.map(item => item.quantidade_vendas);
        const dadosReceita = vendasPorDia.map(item => parseFloat(item.receita_dia));

        container.innerHTML = this.criarEstruturaGrafico('Vendas dos Últimos 7 Dias');

        // Inicializar gráfico quando o DOM estiver pronto
        setTimeout(() => {
            this.inicializarGraficoVendas(labels, dadosVendas, dadosReceita);
        }, 100);
    }

    criarEstruturaGrafico(titulo) {
        return `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0"><i class="fas fa-chart-line me-2"></i>${titulo}</h6>
                    <button class="btn btn-sm btn-outline-primary" onclick="bizFlowApp.exportarGrafico()">
                        <i class="fas fa-download me-1"></i>Exportar
                    </button>
                </div>
                <div class="card-body">
                    <div style="height: 300px; position: relative;">
                        <canvas id="vendasChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    criarPlaceholderGrafico(mensagem) {
        return `
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0"><i class="fas fa-chart-line me-2"></i>${mensagem}</h6>
                </div>
                <div class="card-body">
                    <div class="text-center text-muted py-5">
                        <i class="fas fa-chart-bar fa-3x mb-3"></i>
                        <p>Dados insuficientes para exibir o gráfico</p>
                    </div>
                </div>
            </div>
        `;
    }

    inicializarGraficoVendas(labels, dadosVendas, dadosReceita) {
        const ctx = document.getElementById('vendasChart');
        if (!ctx) return;

        // Simulação do Chart.js - em produção usar biblioteca real
        const maxVendas = Math.max(...dadosVendas);
        const maxReceita = Math.max(...dadosReceita);

        ctx.innerHTML = `
            <div class="container-fluid">
                <div class="row">
                    <div class="col-md-6">
                        <h6 class="text-center mb-3">Quantidade de Vendas</h6>
                        ${dadosVendas.map((vendas, i) => `
                            <div class="d-flex align-items-center mb-2">
                                <small class="me-2 text-muted" style="width: 50px">${labels[i]}</small>
                                <div class="progress flex-grow-1" style="height: 20px">
                                    <div class="progress-bar bg-primary" style="width: ${(vendas / maxVendas) * 100}%">
                                        <small class="fw-bold">${vendas}</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-center mb-3">Receita (R$)</h6>
                        ${dadosReceita.map((receita, i) => `
                            <div class="d-flex align-items-center mb-2">
                                <small class="me-2 text-muted" style="width: 50px">${labels[i]}</small>
                                <div class="progress flex-grow-1" style="height: 20px">
                                    <div class="progress-bar bg-success" style="width: ${(receita / maxReceita) * 100}%">
                                        <small class="fw-bold">R$ ${receita.toFixed(0)}</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
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
                            <small class="fw-bold">${this.curtarTexto(produto.product_name, 20)}</small>
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

    atualizarMetodosPagamento(metodosPagamento) {
        const container = document.getElementById('metodos-pagamento');
        if (!container) return;

        if (!metodosPagamento || metodosPagamento.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Nenhum dado disponível</p>';
            return;
        }

        const total = metodosPagamento.reduce((sum, metodo) => sum + parseFloat(metodo.valor_total), 0);

        const html = metodosPagamento.map(metodo => {
            const percentual = total > 0 ? (parseFloat(metodo.valor_total) / total) * 100 : 0;
            return `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <small class="text-muted">${metodo.payment_method}</small>
                    <div class="d-flex align-items-center">
                        <small class="me-2">R$ ${parseFloat(metodo.valor_total).toFixed(2)}</small>
                        <span class="badge bg-info">${percentual.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }).join('');

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
            const params = new URLSearchParams();

            // Adicionar filtros de data
            const dataInicio = document.getElementById('data-inicio')?.value;
            const dataFim = document.getElementById('data-fim')?.value;

            if (dataInicio) params.append('data_inicio', dataInicio);
            if (dataFim) params.append('data_fim', dataFim);

            switch(tipo) {
                case 'vendas':
                    url = '/api/relatorios/vendas';
                    const agrupamento = document.getElementById('agrupamento-relatorio')?.value;
                    if (agrupamento) params.append('agrupamento', agrupamento);
                    break;
                case 'produtos':
                    url = '/api/relatorios/produtos';
                    const categoria = document.getElementById('categoria-relatorio')?.value;
                    if (categoria) params.append('categoria', categoria);
                    break;
                case 'financeiro':
                    url = '/api/financeiro/fluxo-caixa';
                    const meses = document.getElementById('meses-relatorio')?.value;
                    if (meses) params.append('meses', meses);
                    break;
                default:
                    return;
            }

            const response = await fetch(`${this.API_BASE_URL}${url}?${params.toString()}`, {
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
        const { resumo, metodosPagamento, vendasVendedor, periodo } = dados;

        return `
            <div class="card">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="fas fa-chart-bar me-2"></i>Relatório de Vendas</h5>
                    <div>
                        <button class="btn btn-sm btn-light me-2" onclick="bizFlowApp.exportarPDF('vendas')">
                            <i class="fas fa-file-pdf me-1"></i>PDF
                        </button>
                        <button class="btn btn-sm btn-light" onclick="bizFlowApp.exportarExcel('vendas')">
                            <i class="fas fa-file-excel me-1"></i>Excel
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <h6>Resumo por Período</h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped">
                                    <thead>
                                        <tr>
                                            <th>Período</th>
                                            <th>Vendas</th>
                                            <th>Receita</th>
                                            <th>Ticket Médio</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${resumo.map(item => `
                                            <tr>
                                                <td>${item.periodo}</td>
                                                <td>${item.total_vendas}</td>
                                                <td>R$ ${parseFloat(item.receita_total).toFixed(2)}</td>
                                                <td>R$ ${parseFloat(item.ticket_medio).toFixed(2)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6>Métodos de Pagamento</h6>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped">
                                    <thead>
                                        <tr>
                                            <th>Método</th>
                                            <th>Quantidade</th>
                                            <th>Valor Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${metodosPagamento.map(item => `
                                            <tr>
                                                <td>${item.payment_method}</td>
                                                <td>${item.quantidade}</td>
                                                <td>R$ ${parseFloat(item.valor_total).toFixed(2)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    ${vendasVendedor && vendasVendedor.length > 0 ? `
                    <h6>Desempenho por Vendedor</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead>
                                <tr>
                                    <th>Vendedor</th>
                                    <th>Vendas</th>
                                    <th>Receita</th>
                                    <th>Ticket Médio</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vendasVendedor.map(item => `
                                    <tr>
                                        <td>${item.vendedor}</td>
                                        <td>${item.total_vendas}</td>
                                        <td>R$ ${parseFloat(item.receita_total).toFixed(2)}</td>
                                        <td>R$ ${parseFloat(item.ticket_medio).toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ================= EXPORTAÇÃO DE DADOS =================

    async exportarPDF(tipo) {
        if (!this.isOnline) {
            this.mostrarAlerta('Exportação disponível apenas online', 'warning');
            return;
        }

        try {
            const dataInicio = document.getElementById('data-inicio')?.value;
            const dataFim = document.getElementById('data-fim')?.value;

            let url = `${this.API_BASE_URL}/api/exportar/pdf/${tipo}`;
            const params = new URLSearchParams();
            
            if (dataInicio) params.append('data_inicio', dataInicio);
            if (dataFim) params.append('data_fim', dataFim);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            // Abrir em nova aba para download
            window.open(url, '_blank');

            this.mostrarAlerta('Gerando PDF...', 'info');
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            this.mostrarAlerta('Erro ao gerar PDF', 'danger');
        }
    }

    async exportarExcel(tipo) {
        if (!this.isOnline) {
            this.mostrarAlerta('Exportação disponível apenas online', 'warning');
            return;
        }

        try {
            const dataInicio = document.getElementById('data-inicio')?.value;
            const dataFim = document.getElementById('data-fim')?.value;

            let url = `${this.API_BASE_URL}/api/exportar/excel/${tipo}`;
            const params = new URLSearchParams();
            
            if (dataInicio) params.append('data_inicio', dataInicio);
            if (dataFim) params.append('data_fim', dataFim);

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            // Abrir em nova aba para download
            window.open(url, '_blank');

            this.mostrarAlerta('Gerando Excel...', 'info');
        } catch (error) {
            console.error('Erro ao exportar Excel:', error);
            this.mostrarAlerta('Erro ao gerar Excel', 'danger');
        }
    }

    exportarGrafico() {
        this.mostrarAlerta('Funcionalidade de exportação de gráfico em desenvolvimento', 'info');
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
                this.financeiroData.contas = data.data.contas;
                this.financeiroData.resumo = data.data.resumo;
                this.exibirContasFinanceiras(data.data.contas);
                this.atualizarResumoFinanceiro(data.data.resumo);
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
            const vencimento = new Date(conta.due_date);
            const hoje = new Date();
            const estaAtrasada = vencimento < hoje && conta.status === 'pendente';
            
            return `
                <div class="list-group-item ${estaAtrasada ? 'border-danger' : ''}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-${tipoIcon} ${tipoClass} me-2"></i>
                                ${conta.name}
                                ${estaAtrasada ? '<i class="fas fa-exclamation-triangle text-danger ms-2" title="Conta atrasada"></i>' : ''}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-tag me-1"></i>${conta.category || 'Outros'}
                                <i class="fas fa-calendar ms-2 me-1"></i>
                                ${vencimento.toLocaleDateString('pt-BR')}
                                ${conta.usuario ? `<i class="fas fa-user ms-2 me-1"></i>${conta.usuario}` : ''}
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

    atualizarResumoFinanceiro(resumo) {
        const container = document.getElementById('resumo-financeiro');
        if (!container || !resumo) return;

        container.innerHTML = `
            <div class="row text-center">
                <div class="col-md-3 mb-3">
                    <div class="card border-primary">
                        <div class="card-body">
                            <h5 class="card-title text-primary">${resumo.total_contas}</h5>
                            <p class="card-text">Total de Contas</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card border-warning">
                        <div class="card-body">
                            <h5 class="card-title text-warning">${resumo.contas_pendentes}</h5>
                            <p class="card-text">Contas Pendentes</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card border-danger">
                        <div class="card-body">
                            <h5 class="card-title text-danger">${resumo.contas_atrasadas}</h5>
                            <p class="card-text">Contas Atrasadas</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card border-success">
                        <div class="card-body">
                            <h5 class="card-title text-success">R$ ${parseFloat(resumo.valor_pendente).toFixed(2)}</h5>
                            <p class="card-text">Valor Pendente</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    verificarContasVencidas() {
        if (!this.financeiroData.contas) return;

        const hoje = new Date();
        const contasVencidas = this.financeiroData.contas.filter(conta => {
            const vencimento = new Date(conta.due_date);
            return vencimento < hoje && (conta.status === 'pendente');
        });

        if (contasVencidas.length > 0 && document.visibilityState === 'visible' && this.configuracoes.notificacoes) {
            this.mostrarAlerta(
                `${contasVencidas.length} conta(s) vencida(s)! Verifique o módulo financeiro. ⚠️`,
                'warning'
            );
        }
    }

    // ================= SISTEMA DE BACKUP =================

    async carregarBackups() {
        if (!this.isOnline || this.currentUser?.role !== 'admin') return;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/backup/listar`, {
                headers: this.getAuthHeaders()
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            if (data.success) {
                this.backupData = data.data;
                this.exibirBackups(data.data.backups);
            }
        } catch (error) {
            console.error('Erro ao carregar backups:', error);
        }
    }

    async gerarBackup() {
        if (!this.isOnline) {
            this.mostrarAlerta('Backup disponível apenas online', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/backup/gerar`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ tipo: 'completo' })
            });

            const data = await response.json();

            if (data.success) {
                this.mostrarAlerta('Backup gerado com sucesso!', 'success');
                this.carregarBackups();
            } else {
                throw new Error(data.error || 'Erro ao gerar backup');
            }
        } catch (error) {
            console.error('Erro ao gerar backup:', error);
            this.mostrarAlerta(error.message, 'danger');
        }
    }

    async backupAutomatico() {
        if (!this.isOnline) return;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/backup/gerar`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ tipo: 'automatico' })
            });

            if (response.ok) {
                console.log('✅ Backup automático realizado com sucesso');
            }
        } catch (error) {
            console.error('Erro no backup automático:', error);
        }
    }

    exibirBackups(backups) {
        const container = document.getElementById('lista-backups');
        if (!container) return;

        if (!backups || backups.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-database fa-3x mb-3"></i>
                    <p>Nenhum backup encontrado</p>
                </div>
            `;
            return;
        }

        const html = backups.map(backup => {
            const tamanho = this.formatarTamanhoArquivo(backup.file_size);
            const data = new Date(backup.created_at).toLocaleString('pt-BR');
            
            return `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-database me-2"></i>
                                ${backup.filename}
                            </h6>
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>${data}
                                <i class="fas fa-hdd ms-2 me-1"></i>${tamanho}
                                <i class="fas fa-user ms-2 me-1"></i>${backup.usuario}
                                <span class="badge bg-info ms-2">${backup.backup_type}</span>
                            </small>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-outline-primary btn-sm" onclick="bizFlowApp.restaurarBackup(${backup.id})">
                                <i class="fas fa-undo me-1"></i>Restaurar
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    async restaurarBackup(backupId) {
        if (!confirm('Tem certeza que deseja restaurar este backup? Esta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/backup/restaurar/${backupId}`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            const data = await response.json();

            if (data.success) {
                this.mostrarAlerta('Processo de restauração iniciado!', 'success');
            } else {
                throw new Error(data.error || 'Erro ao restaurar backup');
            }
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            this.mostrarAlerta(error.message, 'danger');
        }
    }

    // ================= UTILITÁRIOS AVANÇADOS =================

    curtarTexto(texto, limite) {
        if (texto.length <= limite) return texto;
        return texto.substring(0, limite) + '...';
    }

    formatarTamanhoArquivo(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

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
        if (!this.configuracoes.notificacoes && tipo !== 'danger') return;

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
            border-left: 4px solid var(--bs-${tipo});
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
        if (!this.configuracoes.notificacoes) return;

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

    desativarNotificacoes() {
        // Remove todos os alertas ativos
        document.querySelectorAll('.alert-flutuante').forEach(alerta => {
            alerta.remove();
        });
    }

    async carregarCategorias() {
        if (!this.isOnline) return;

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/categorias`, {
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.atualizarSelectCategorias(data.data);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    atualizarSelectCategorias(categorias) {
        const selects = document.querySelectorAll('select[id*="categoria"]');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Todas as Categorias</option>';
            
            categorias.forEach(categoria => {
                const option = document.createElement('option');
                option.value = categoria.name;
                option.textContent = categoria.name;
                select.appendChild(option);
            });

            // Manter o valor atual se ainda existir
            if (currentValue) {
                select.value = currentValue;
            }
        });
    }

    // ================= COMPATIBILIDADE =================

    async carregarVendas() {
        if (!this.isOnline) {
            throw new Error('Offline mode');
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/vendas?limit=10`, {
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
                                ${venda.vendedor ? `<br><i class="fas fa-user me-1"></i>${venda.vendedor}` : ''}
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
                alertasEstoque: this.estoque.filter(item => item.quantidade <= 5).length,
                vendasHoje: this.vendas.filter(v => {
                    const hoje = new Date().toISOString().split('T')[0];
                    const dataVenda = v.data || (v.sale_date ? new Date(v.sale_date).toISOString().split('T')[0] : '');
                    return dataVenda === hoje;
                }).length,
                receitaHoje: this.vendas.filter(v => {
                    const hoje = new Date().toISOString().split('T')[0];
                    const dataVenda = v.data || (v.sale_date ? new Date(v.sale_date).toISOString().split('T')[0] : '');
                    return dataVenda === hoje;
                }).reduce((sum, v) => {
                    const valor = v.valor || v.total_amount || 0;
                    const quantidade = v.quantidade || v.total_items || 1;
                    return sum + (valor * quantidade);
                }, 0)
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
        const tipo = document.getElementById('filtro-relatorio')?.value || 'vendas';
        window.bizFlowApp.exportarPDF(tipo);
    }
}

function gerarRelatorio(tipo) {
    if (window.bizFlowApp) {
        window.bizFlowApp.carregarRelatorios(tipo);
    }
}

function gerarBackup() {
    if (window.bizFlowApp) {
        window.bizFlowApp.gerarBackup();
    }
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
}

function alternarTema() {
    const body = document.body;
    const temaAtual = body.getAttribute('data-bs-theme');
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    
    body.setAttribute('data-bs-theme', novoTema);
    
    if (window.bizFlowApp) {
        window.bizFlowApp.configuracoes.tema = novoTema;
        window.bizFlowApp.salvarConfiguracoes();
    }
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
