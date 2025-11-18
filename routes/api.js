const express = require('express');
const router = express.Router();

// Dados mock para demonstração
let vendas = [
    { id: 1, produto: "Café Expresso", valor: 5.00, data: "2024-01-15" },
    { id: 2, produto: "Pão de Queijo", valor: 4.50, data: "2024-01-15" }
];

let estoque = [
    { id: 1, produto: "Café", quantidade: 100, minimo: 20 },
    { id: 2, produto: "Leite", quantidade: 30, minimo: 15 }
];

// Rotas de Vendas
router.get('/vendas', (req, res) => {
    res.json({ success: true, data: vendas });
});

router.post('/vendas', (req, res) => {
    const novaVenda = {
        id: vendas.length + 1,
        ...req.body,
        data: new Date().toISOString().split('T')[0]
    };
    vendas.push(novaVenda);
    res.json({ success: true, data: novaVenda });
});

// Rotas de Estoque
router.get('/estoque', (req, res) => {
    res.json({ success: true, data: estoque });
});

router.post('/estoque', (req, res) => {
    const novoItem = {
        id: estoque.length + 1,
        ...req.body
    };
    estoque.push(novoItem);
    res.json({ success: true, data: novoItem });
});

// Rota de Dashboard/Relatórios
router.get('/dashboard', (req, res) => {
    const totalVendas = vendas.reduce((sum, venda) => sum + venda.valor, 0);
    const alertasEstoque = estoque.filter(item => item.quantidade < item.minimo);
    
    res.json({
        success: true,
        data: {
            totalVendas,
            totalVendasQuantidade: vendas.length,
            alertasEstoque: alertasEstoque.length,
            produtosBaixoEstoque: alertasEstoque
        }
    });
});

module.exports = router;
