// API Base URL - será ajustada automaticamente no Render.com
const API_BASE_URL = window.location.origin + '/api';

class BizFlowApp {
    constructor() {
        this.init();
    }

    init() {
        this.loadDashboard();
        this.loadVendas();
        this.loadEstoque();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Formulário de Vendas
        document.getElementById('venda-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarVenda();
        });

        // Formulário de Estoque
        document.getElementById('estoque-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.adicionarEstoque();
        });
    }

    async loadDashboard() {
        try {
            const response = await fetch(`${API_BASE_URL}/dashboard`);
            const data = await response.json();
            
            if (data.success) {
                this.updateDashboard(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        }
    }

    updateDashboard(data) {
        // Atualizar cards do dashboard
        document.getElementById('total-vendas').textContent = 
            `R$ ${data.totalVendas.toFixed(2)}`;
        document.getElementById('quantidade-vendas').textContent = 
            data.totalVendasQuantidade;
        document.getElementById('alertas-estoque').textContent = 
            data.alertasEstoque;

        // Criar cards do dashboard
        const dashboardCards = document.getElementById('dashboard-cards');
        dashboardCards.innerHTML = `
            <div class="col-md-4">
                <div class="card text-white bg-success">
                    <div class="card-body">
                        <h5><i class="fas fa-money-bill-wave"></i> Receita Total</h5>
                        <h3>R$ ${data.totalVendas.toFixed(2)}</h3>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-white bg-info">
                    <div class="card-body">
                        <h5><i class="fas fa-shopping-cart"></i> Vendas</h5>
                        <h3>${data.totalVendasQuantidade}</h3>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card text-white bg-warning">
                    <div class="card-body">
                        <h5><i class="fas fa-exclamation-triangle"></i> Alertas</h5>
                        <h3>${data.alertasEstoque}</h3>
                    </div>
                </div>
            </div>
        `;
    }

    async loadVendas() {
        try {
            const response = await fetch(`${API_BASE_URL}/vendas`);
            const data = await response.json();
            
            if (data.success) {
                this.displayVendas(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar vendas:', error);
        }
    }

    displayVendas(vendas) {
        const listaVendas = document.getElementById('lista-vendas');
        listaVendas.innerHTML = '';

        if (vendas.length === 0) {
            listaVendas.innerHTML = '<p class="text-muted">Nenhuma venda registrada.</p>';
            return;
        }

        vendas.forEach(venda => {
            const vendaElement = document.createElement('div');
            vendaElement.className = 'card mb-2 fade-in';
            vendaElement.innerHTML = `
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between">
                        <span><strong>${venda.produto}</strong></span>
                        <span class="text-success">R$ ${venda.valor.toFixed(2)}</span>
                    </div>
                    <small class="text-muted">${venda.data}</small>
                </div>
            `;
            listaVendas.appendChild(vendaElement);
        });
    }

    async registrarVenda() {
        const produto = document.getElementById('produto').value;
        const valor = parseFloat(document.getElementById('valor').value);

        try {
            const response = await fetch(`${API_BASE_URL}/vendas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ produto, valor })
            });

            const data = await response.json();

            if (data.success) {
                // Limpar formulário
                document.getElementById('venda-form').reset();
                
                // Recarregar dados
                this.loadVendas();
                this.loadDashboard();
                
                // Feedback visual
                this.showAlert('Venda registrada com sucesso!', 'success');
            }
        } catch (error) {
            console.error('Erro ao registrar venda:', error);
            this.showAlert('Erro ao registrar venda.', 'danger');
        }
    }

    async loadEstoque() {
        try {
            const response = await fetch(`${API_BASE_URL}/estoque`);
            const data = await response.json();
            
            if (data.success) {
                this.displayEstoque(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar estoque:', error);
        }
    }

    displayEstoque(estoque) {
        const listaEstoque = document.getElementById('lista-estoque');
        listaEstoque.innerHTML = '';

        if (estoque.length === 0) {
            listaEstoque.innerHTML = '<p class="text-muted">Nenhum item em estoque.</p>';
            return;
        }

        estoque.forEach(item => {
            const alertClass = item.quantidade < item.minimo ? 'border-warning' : '';
            const estoqueElement = document.createElement('div');
            estoqueElement.className = `card mb-2 ${alertClass} fade-in`;
            estoqueElement.innerHTML = `
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${item.produto}</strong>
                            <br>
                            <small class="text-muted">
                                Quantidade: ${item.quantidade} | Mínimo: ${item.minimo}
                            </small>
                        </div>
                        ${item.quantidade < item.minimo ? 
                            '<span class="badge bg-warning text-dark"><i class="fas fa-exclamation-triangle"></i> Baixo</span>' : 
                            '<span class="badge bg-success"><i class="fas fa-check"></i> OK</span>'
                        }
                    </div>
                </div>
            `;
            listaEstoque.appendChild(estoqueElement);
        });
    }

    async adicionarEstoque() {
        const produto = document.getElementById('produto-estoque').value;
        const quantidade = parseInt(document.getElementById('quantidade').value);
        const minimo = parseInt(document.getElementById('minimo').value);

        try {
            const response = await fetch(`${API_BASE_URL}/estoque`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ produto, quantidade, minimo })
            });

            const data = await response.json();

            if (data.success) {
                // Limpar formulário
                document.getElementById('estoque-form').reset();
                
                // Recarregar dados
                this.loadEstoque();
                this.loadDashboard();
                
                // Feedback visual
                this.showAlert('Item adicionado ao estoque!', 'success');
            }
        } catch (error) {
            console.error('Erro ao adicionar estoque:', error);
            this.showAlert('Erro ao adicionar item.', 'danger');
        }
    }

    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.top = '20px';
        alertDiv.style.right = '20px';
        alertDiv.style.zIndex = '1050';
        alertDiv.style.minWidth = '300px';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alertDiv);

        // Auto-remove após 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }
}

// Inicializar a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new BizFlowApp();
});
