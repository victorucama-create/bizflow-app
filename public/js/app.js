// BizFlow - Sistema de Gestão Integrada
// JavaScript Application Controller - Versão Render Compatible

class BizFlowApp {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.vendas = [];
        this.estoque = [];
        this.dashboardData = {};
        this.isOnline = false;
        this.init();
    }

    async init() {
        try {
            console.log('🚀 Inicializando BizFlow App...');
            
            // Testar conexão com a API
            await this.testarConexao();
            
            // Carregar dados iniciais
            await this.carregarDadosIniciais();
            
            // Configurar event listeners
            this.configurarEventListeners();
            
            // Iniciar atualizações automáticas
            this.iniciarAtualizacoesAutomaticas();
            
            console.log('✅ BizFlow App inicializado com sucesso!');
            this.mostrarAlerta('Sistema carregado com sucesso! 🎉', 'success');
        } catch (error) {
            console.error('❌ Erro ao inicializar app:', error);
            this.mostrarAlerta('Modo offline ativado. Dados locais carregados.', 'warning');
            this.carregarDadosLocais();
        }
    }

    async testarConexao() {
        try {
            console.log('🔍 Testando conexão com a API...');
            
            // Tentar health check primeiro
            const healthResponse = await fetch(`${this.API_BASE_URL}/health`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                timeout: 5000
            });
            
            if (!healthResponse.ok) {
                throw new Error(`Health check falhou: ${healthResponse.status}`);
            }
            
            const healthData = await healthResponse.json();
            
            if (healthData.status === 'OK') {
                this.isOnline = true;
                this.atualizarStatusConexao('online', 'Conectado');
                console.log('✅ Conexão estabelecida com sucesso');
                return true;
            } else {
                throw new Error('Health check retornou status inválido');
            }
        } catch (error) {
            console.warn('⚠️ Health check falhou, tentando rota alternativa...');
            
            // Tentar rota alternativa
            try {
                const testResponse = await fetch(`${this.API_BASE_URL}/api/test`, {
                    method: 'GET',
                    timeout: 5000
                });
                
                if (testResponse.ok) {
                    this.isOnline = true;
                    this.atualizarStatusConexao('online', 'Conectado');
                    console.log('✅ Conexão estabelecida via rota alternativa');
                    return true;
                }
            } catch (secondError) {
                console.warn('⚠️ Todas as tentativas de conexão falharam');
            }
            
            this.isOnline = false;
            this.atualizarStatusConexao('offline', 'Modo Offline');
            throw new Error('Servidor indisponível');
        }
    }

    async carregarDadosIniciais() {
        try {
            console.log('📥 Carregando dados iniciais...');
            
            await Promise.all([
                this.carregarVendas(),
                this.carregarEstoque(),
                this.carregarDashboard()
            ]);
            
            console.log('✅ Dados iniciais carregados com sucesso');
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

        // Atalhos de teclado
        document.addEventListener('keydown', (e) => {
            // Ctrl + Enter para registrar venda rápida
            if (e.ctrlKey && e.key === 'Enter') {
                const produto = document.getElementById('produto');
                if (produto === document.activeElement) {
                    document.getElementById('valor').focus();
                } else {
                    this.registrarVenda();
                }
            }
            
            // Escape para limpar formulários
            if (e.key === 'Escape') {
                document.getElementById('venda-form').reset();
                document.getElementById('estoque-form').reset();
            }
        });

        // Atualizar dados quando a página ganha foco
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.carregarDashboard();
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
                this.carregarDashboard();
            }
        }, 30000);

        // Verificar alertas a cada minuto
        setInterval(() => {
            this.verificarAlertasEstoque();
        }, 60000);

        // Verificar conexão a cada 2 minutos
        setInterval(() => {
            if (navigator.onLine && !this.isOnline) {
                this.verificarConexao();
            }
        }, 120000);
    }

    // ================= VENDAS =================

    async carregarVendas() {
        if (!this.isOnline) {
            throw new Error('Offline mode');
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/vendas`);
            
            if (!response.ok) {
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
                const response = await fetch(`${this.API_BASE_URL}/api/vendas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ produto, valor, quantidade })
                });

                if (!response.ok) {
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
                
                // Adicionar à lista local
                this.vendas.unshift(resultado.data);
            }

            // Limpar formulário
            form.reset();
            quantidadeInput.value = 1;
            produtoInput.focus(); // Voltar foco para o primeiro campo

            // Recarregar dados
            if (this.isOnline) {
                await this.carregarVendas();
                await this.carregarDashboard();
            } else {
                this.exibirVendas(this.vendas);
                this.atualizarDashboardLocal();
            }
            
            // Feedback
            this.mostrarAlerta(resultado.message, 'success');
            
            // Efeito visual
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

        const html = vendas.slice(0, 10).map(venda => `
            <div class="list-group-item fade-in">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${venda.produto}</h6>
                        <small class="text-muted">
                            <i class="fas fa-calendar me-1"></i>${venda.data} 
                            <i class="fas fa-clock ms-2 me-1"></i>${venda.hora}
                            ${!this.isOnline ? '<span class="badge bg-warning ms-2">Local</span>' : ''}
                        </small>
                    </div>
                    <div class="text-end">
                        <strong class="text-success">R$ ${venda.valor.toFixed(2)}</strong>
                        <br>
                        <small class="text-muted">Qtd: ${venda.quantidade}</small>
                    </div>
                </div>
                <div class="mt-2">
                    <small class="text-primary">
                        Total: <strong>R$ ${(venda.valor * venda.quantidade).toFixed(2)}</strong>
                    </small>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // ================= ESTOQUE =================

    async carregarEstoque() {
        if (!this.isOnline) {
            throw new Error('Offline mode');
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/estoque`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.estoque = data.data;
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
        const quantidadeInput = document.getElementById('quantidade');
        const minimoInput = document.getElementById('minimo');
        
        const produto = produtoInput.value.trim();
        const quantidade = parseInt(quantidadeInput.value);
        const minimo = parseInt(minimoInput.value);

        // Validação
        if (!produto) {
            this.mostrarAlerta('Informe o nome do produto!', 'warning');
            produtoInput.focus();
            return;
        }

        if (quantidade < 0) {
            this.mostrarAlerta('Quantidade não pode ser negativa!', 'warning');
            quantidadeInput.focus();
            return;
        }

        if (minimo < 1) {
            this.mostrarAlerta('Estoque mínimo deve ser pelo menos 1!', 'warning');
            minimoInput.focus();
            return;
        }

        this.mostrarLoading(form, 'Adicionando...');

        try {
            let resultado;
            
            if (this.isOnline) {
                const response = await fetch(`${this.API_BASE_URL}/api/estoque`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ produto, quantidade, minimo })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                resultado = await response.json();

                if (!resultado.success) {
                    throw new Error(resultado.error || 'Erro ao adicionar item');
                }
            } else {
                // Modo offline - simular resposta
                resultado = {
                    success: true,
                    data: {
                        id: Date.now(),
                        produto,
                        quantidade,
                        minimo,
                        categoria: "Geral",
                        ultimaAtualizacao: new Date().toISOString()
                    },
                    message: "Item adicionado (modo offline) 📦"
                };
                
                // Adicionar à lista local
                this.estoque.unshift(resultado.data);
            }

            // Limpar formulário
            form.reset();
            minimoInput.value = 5;
            produtoInput.focus();

            // Recarregar dados
            if (this.isOnline) {
                await this.carregarEstoque();
                await this.carregarDashboard();
            } else {
                this.exibirEstoque(this.estoque);
                this.atualizarDashboardLocal();
            }
            
            this.mostrarAlerta(resultado.message, 'success');

        } catch (error) {
            console.error('Erro ao adicionar item:', error);
            this.mostrarAlerta(
                this.isOnline ? error.message : 'Item salvo localmente (sem sincronização)',
                this.isOnline ? 'danger' : 'warning'
            );
        } finally {
            this.esconderLoading(form, 'Adicionar ao Estoque');
        }
    }

    exibirEstoque(estoque) {
        const container = document.getElementById('lista-estoque');
        
        if (!estoque || estoque.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-box-open fa-3x mb-3"></i>
                    <p>Nenhum item cadastrado</p>
                    <small class="text-warning">
                        <i class="fas fa-${this.isOnline ? 'cloud' : 'wifi'} me-1"></i>
                        ${this.isOnline ? 'Online' : 'Offline'}
                    </small>
                </div>
            `;
            return;
        }

        const html = estoque.map(item => {
            const alerta = item.quantidade <= item.minimo;
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
                                ${!this.isOnline ? '<span class="badge bg-warning ms-2">Local</span>' : ''}
                            </small>
                        </div>
                        <div class="text-end">
                            <span class="badge ${badgeClass}">
                                <i class="fas fa-${icon} me-1"></i>${badgeText}
                            </span>
                            <div class="mt-1">
                                <small class="text-muted">
                                    ${item.quantidade} / ${item.minimo} min
                                </small>
                            </div>
                        </div>
                    </div>
                    ${alerta ? `
                        <div class="alert alert-warning mt-2 py-1 mb-0">
                            <small>
                                <i class="fas fa-exclamation-triangle me-1"></i>
                                <strong>Alerta:</strong> Estoque abaixo do mínimo!
                            </small>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    verificarAlertasEstoque() {
        const alertas = this.estoque.filter(item => item.quantidade <= item.minimo);
        
        if (alertas.length > 0 && document.visibilityState === 'visible') {
            // Mostrar alerta apenas se não foi mostrado recentemente
            const ultimoAlerta = localStorage.getItem('ultimoAlertaEstoque');
            const agora = new Date().getTime();
            
            if (!ultimoAlerta || (agora - parseInt(ultimoAlerta)) > 300000) { // 5 minutos
                this.mostrarAlerta(
                    `${alertas.length} item(s) com estoque baixo! Verifique o módulo de estoque. ⚠️`,
                    'warning'
                );
                localStorage.setItem('ultimoAlertaEstoque', agora.toString());
            }
        }
    }

    // ================= DASHBOARD =================

    async carregarDashboard() {
        if (!this.isOnline) {
            this.atualizarDashboardLocal();
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/dashboard`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.dashboardData = data.data;
                this.atualizarDashboard(this.dashboardData);
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            this.atualizarDashboardLocal();
        }
    }

    atualizarDashboard(data) {
        // Atualizar cards principais
        this.atualizarElemento('total-receita', `R$ ${data.receitaTotal.toFixed(2)}`);
        this.atualizarElemento('total-vendas', data.totalVendas.toString());
        this.atualizarElemento('total-itens', data.totalItensEstoque.toString());
        this.atualizarElemento('total-alertas', data.alertasEstoque.toString());

        // Atualizar resumo financeiro
        this.atualizarElemento('resumo-receita', `R$ ${data.receitaTotal.toFixed(2)}`);
        this.atualizarElemento('resumo-vendas', data.totalVendas.toString());
        this.atualizarElemento('resumo-ticket', `R$ ${data.ticketMedio.toFixed(2)}`);

        // Atualizar transações recentes
        this.atualizarTransacoesRecentes();

        // Animar mudanças
        this.animarAtualizacaoDashboard();
    }

    atualizarDashboardLocal() {
        const receitaTotal = this.vendas.reduce((sum, v) => sum + (v.valor * v.quantidade), 0);
        const totalVendas = this.vendas.length;
        const totalItensEstoque = this.estoque.length;
        const alertasEstoque = this.estoque.filter(item => item.quantidade <= item.minimo).length;
        const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;

        const dataLocal = {
            receitaTotal,
            totalVendas,
            totalItensEstoque,
            alertasEstoque,
            ticketMedio
        };

        this.atualizarDashboard(dataLocal);
    }

    atualizarTransacoesRecentes() {
        const container = document.getElementById('transacoes-recentes');
        const vendasRecentes = this.vendas.slice(0, 5);
        
        if (vendasRecentes.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Nenhuma transação disponível</p>';
            return;
        }

        const html = vendasRecentes.map(venda => `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                <div>
                    <small class="fw-bold">${venda.produto}</small>
                    <br>
                    <small class="text-muted">${venda.data} ${venda.hora}</small>
                </div>
                <div class="text-end">
                    <small class="text-success fw-bold">R$ ${venda.valor.toFixed(2)}</small>
                    <br>
                    <small class="text-muted">x${venda.quantidade}</small>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
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

    // ================= UTILITÁRIOS =================

    atualizarElemento(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) {
            // Animação de contador se for número
            if (!isNaN(parseFloat(valor)) && isFinite(valor)) {
                this.animarContador(elemento, parseFloat(valor));
            } else {
                elemento.textContent = valor;
            }
        }
    }

    animarContador(elemento, valorFinal) {
        const valorTexto = elemento.textContent;
        let valorAtual;
        
        // Extrair número do texto atual
        if (valorTexto.includes('R$')) {
            valorAtual = parseFloat(valorTexto.replace('R$', '').replace(',', '').trim()) || 0;
        } else {
            valorAtual = parseFloat(valorTexto) || 0;
        }
        
        const duracao = 800;
        const frames = 30;
        const incremento = (valorFinal - valorAtual) / frames;
        let valorAtualAnimado = valorAtual;
        let frame = 0;

        const animar = () => {
            if (frame < frames) {
                valorAtualAnimado += incremento;
                
                // Formatar como moeda se for o card de receita
                if (elemento.id.includes('receita') || elemento.id.includes('ticket')) {
                    elemento.textContent = `R$ ${valorAtualAnimado.toFixed(2)}`;
                } else {
                    elemento.textContent = Math.round(valorAtualAnimado).toString();
                }
                
                frame++;
                setTimeout(animar, duracao / frames);
            } else {
                // Garantir o valor final exato
                if (elemento.id.includes('receita') || elemento.id.includes('ticket')) {
                    elemento.textContent = `R$ ${valorFinal.toFixed(2)}`;
                } else {
                    elemento.textContent = Math.round(valorFinal).toString();
                }
            }
        };

        animar();
    }

    mostrarAlerta(mensagem, tipo = 'info') {
        // Remover alertas anteriores do mesmo tipo
        const alertasExistentes = document.querySelectorAll('.alert-flutuante');
        alertasExistentes.forEach(alerta => {
            if (alerta.textContent.includes(mensagem.substring(0, 20))) {
                alerta.remove();
            }
        });

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

        // Auto-remover após 5 segundos (10 para warnings)
        const timeout = tipo === 'warning' ? 10000 : 5000;
        setTimeout(() => {
            if (alerta.parentNode) {
                try {
                    alerta.remove();
                } catch (e) {
                    // Ignora erro se o elemento já foi removido
                }
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
            
            // Atualizar ícones de status em outros lugares
            document.querySelectorAll('.status-indicator').forEach(indicator => {
                indicator.className = `status-${status}`;
            });
        }
    }

    carregarDadosLocais() {
        console.log('📂 Carregando dados locais...');
        
        // Dados de exemplo para modo offline
        this.vendas = [
            { id: 1, produto: "Café Expresso", valor: 5.00, quantidade: 1, data: "2024-01-15", hora: "10:30" },
            { id: 2, produto: "Pão de Queijo", valor: 4.50, quantidade: 2, data: "2024-01-15", hora: "11:15" }
        ];

        this.estoque = [
            { id: 1, produto: "Café em Grãos", quantidade: 50, minimo: 10, categoria: "Matéria-prima" },
            { id: 2, produto: "Leite", quantidade: 25, minimo: 15, categoria: "Laticínios" }
        ];

        this.dashboardData = {
            receitaTotal: 14.00,
            totalVendas: 2,
            totalItensVendidos: 3,
            ticketMedio: 7.00,
            alertasEstoque: 0,
            totalItensEstoque: 2,
            vendasRecentes: 2
        };

        this.exibirVendas(this.vendas);
        this.exibirEstoque(this.estoque);
        this.atualizarDashboard(this.dashboardData);
        
        console.log('✅ Dados locais carregados');
    }

    // ================= EXPORTAÇÃO =================

    async exportarVendasCSV() {
        try {
            if (this.isOnline) {
                const response = await fetch(`${this.API_BASE_URL}/api/export/vendas`);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vendas-bizflow-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                // Exportação offline
                const csvData = this.vendas.map(v => 
                    `"${v.data}","${v.hora}","${v.produto}",${v.quantidade},${v.valor},${v.valor * v.quantidade}`
                ).join('\n');
                
                const csvHeader = 'Data,Hora,Produto,Quantidade,Valor Unitário,Valor Total\n';
                const csv = csvHeader + csvData;
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vendas-bizflow-offline-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
            
            this.mostrarAlerta('Vendas exportadas com sucesso! 📊', 'success');
        } catch (error) {
            console.error('Erro ao exportar vendas:', error);
            this.mostrarAlerta('Erro ao exportar vendas', 'danger');
        }
    }

    exportarEstoqueJSON() {
        try {
            const dados = {
                estoque: this.estoque,
                exportadoEm: new Date().toISOString(),
                totalItens: this.estoque.length,
                modo: this.isOnline ? 'online' : 'offline'
            };
            
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `estoque-bizflow-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.mostrarAlerta('Estoque exportado com sucesso! 📦', 'success');
        } catch (error) {
            console.error('Erro ao exportar estoque:', error);
            this.mostrarAlerta('Erro ao exportar estoque', 'danger');
        }
    }
}

// ================= INICIALIZAÇÃO DA APLICAÇÃO =================

// Funções globais para os botões
function exportarVendas() {
    if (window.bizFlowApp) {
        window.bizFlowApp.exportarVendasCSV();
    }
}

function exportarEstoque() {
    if (window.bizFlowApp) {
        window.bizFlowApp.exportarEstoqueJSON();
    }
}

function gerarRelatorio() {
    if (window.bizFlowApp) {
        window.bizFlowApp.mostrarAlerta('Relatório gerado com sucesso! 📋', 'info');
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
    
    // Configurar ano atual no footer
    document.getElementById('ano-atual').textContent = new Date().getFullYear();
    
    // Efeito de fade-in para as seções
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    // Observar todas as seções
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

// Service Worker registration (para futura implementação PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(error) {
                console.log('ServiceWorker registration failed');
            });
    });
}
