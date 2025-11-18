const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal - serve o HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Health check obrigatório para Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'BizFlow API está funcionando!',
        timestamp: new Date().toISOString()
    });
});

// API simples
app.get('/api/vendas', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, produto: "Café Expresso", valor: 5.00, data: "2024-01-15" },
            { id: 2, produto: "Pão de Queijo", valor: 4.50, data: "2024-01-15" }
        ]
    });
});

app.post('/api/vendas', (req, res) => {
    const { produto, valor } = req.body;
    const novaVenda = {
        id: Date.now(),
        produto,
        valor: parseFloat(valor),
        data: new Date().toISOString().split('T')[0]
    };
    
    res.json({
        success: true,
        data: novaVenda,
        message: "Venda registrada com sucesso!"
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BizFlow rodando na porta ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
