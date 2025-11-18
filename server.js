const express = require('express');
const path = require('path');
const app = express();

// ✅ PORT correta para Render
const PORT = process.env.PORT || 10000;

// ✅ HOST correto para Render
const HOST = '0.0.0.0';

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Cache de dados em memória
let vendas = [
    { id: 1, produto: "Café Expresso", valor: 5.00, quantidade: 1, data: "2024-01-15", hora: "10:30" },
    { id: 2, produto: "Pão de Queijo", valor: 4.50, quantidade: 2, data: "2024-01-15", hora: "11:15" },
    { id: 3, produto: "Capuccino", valor: 8.00, quantidade: 1, data: "2024-01-15", hora: "14:20" }
];

let estoque = [
    { id: 1, produto: "Café em Grãos", quantidade: 50, minimo: 10, categoria: "Matéria-prima" },
    { id: 2, produto: "Leite", quantidade: 25, minimo: 15, categoria: "Laticínios" },
    { id: 3, produto: "Açúcar", quantidade: 8, minimo: 5, categoria: "Matéria-prima" }
];

// ================= ROTAS PRINCIPAIS =================

// ✅ Rota para favicon (elimina erro 404)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ✅ Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ✅ HEALTH CHECK MELHORADO (Render exige isso)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        service: 'BizFlow API',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        port: PORT
    });
});

// ✅ Rota de teste simples
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API BizFlow funcionando perfeitamente! 🚀',
        timestamp: new Date().toISOString()
    });
});

// ================= API - VENDAS =================

app.get('/api/vendas', (req, res) => {
    try {
        const receitaTotal = vendas.reduce((sum, v) => sum + (v.valor * v.quantidade), 0);
        
        res.json({
            success: true,
            data: vendas,
            total: vendas.length,
            receitaTotal: receitaTotal
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vendas', (req, res) => {
    try {
        const { produto, valor, quantidade = 1 } = req.body;
        
        if (!produto || !valor) {
            return res.status(400).json({ 
                success: false, 
                error: 'Produto e valor são obrigatórios' 
            });
        }

        const novaVenda = {
            id: Date.now(),
            produto: produto.trim(),
            valor: parseFloat(valor),
            quantidade: parseInt(quantidade),
            data: new Date().toISOString().split('T')[0],
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString()
        };

        vendas.unshift(novaVenda);

        res.json({
            success: true,
            data: novaVenda,
            message: "Venda registrada com sucesso! 💰"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= API - ESTOQUE =================

app.get('/api/estoque', (req, res) => {
    try {
        const alertas = estoque.filter(item => item.quantidade <= item.minimo);
        
        res.json({
            success: true,
            data: estoque,
            totalItens: estoque.length,
            alertas: alertas.length,
            itensBaixoEstoque: alertas
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/estoque', (req, res) => {
    try {
        const { produto, quantidade, minimo, categoria = "Geral" } = req.body;
        
        if (!produto || quantidade === undefined || minimo === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Produto, quantidade e estoque mínimo são obrigatórios' 
            });
        }

        const novoItem = {
            id: Date.now(),
            produto: produto.trim(),
            quantidade: parseInt(quantidade),
            minimo: parseInt(minimo),
            categoria: categoria.trim(),
            ultimaAtualizacao: new Date().toISOString()
        };

        estoque.unshift(novoItem);

        res.json({
            success: true,
            data: novoItem,
            message: "Item adicionado ao estoque! 📦"
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= API - DASHBOARD =================

app.get('/api/dashboard', (req, res) => {
    try {
        const receitaTotal = vendas.reduce((sum, v) => sum + (v.valor * v.quantidade), 0);
        const totalVendas = vendas.reduce((sum, v) => sum + v.quantidade, 0);
        const alertasEstoque = estoque.filter(item => item.quantidade <= item.minimo);
        
        res.json({
            success: true,
            data: {
                receitaTotal,
                totalVendas: vendas.length,
                totalItensVendidos: totalVendas,
                ticketMedio: vendas.length > 0 ? receitaTotal / vendas.length : 0,
                alertasEstoque: alertasEstoque.length,
                itensBaixoEstoque: alertasEstoque,
                totalItensEstoque: estoque.length,
                vendasRecentes: vendas.slice(0, 5).length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================= MANIPULAÇÃO DE ERROS =================

// Rota não encontrada
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Rota não encontrada',
        path: req.originalUrl 
    });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('Erro no servidor:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor'
    });
});

// ================= INICIALIZAÇÃO DO SERVIDOR =================

// ✅ MÉTODO CORRIGIDO para Render
app.listen(PORT, HOST, () => {
    console.log(`
╔══════════════════════════════════════╗
║            🚀 BIZFLOW API           ║
║        Sistema de Gestão Integrada   ║
╠══════════════════════════════════════╣
║ 📍 Porta: ${PORT}                          ║
║ 🌐 Host: ${HOST}                         ║
║ 🩺 Health: /health                    ║
║ 📊 Dashboard: /                       ║
║ 🔧 Ambiente: ${process.env.NODE_ENV || 'development'}              ║
╚══════════════════════════════════════╝
    `);
    
    console.log(`✅ Servidor rodando: http://${HOST}:${PORT}`);
    console.log(`✅ Health Check: http://${HOST}:${PORT}/health`);
    console.log(`✅ API Test: http://${HOST}:${PORT}/api/test`);
});

module.exports = app;
