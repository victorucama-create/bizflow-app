const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir arquivos estáticos
app.use(express.static('public'));
app.use(express.static('views'));

// Rotas API
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Rota para health check (importante para Render.com)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'BizFlow API'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor BizFlow rodando na porta ${PORT}`);
    console.log(`📊 Acesse: http://localhost:${PORT}`);
});

module.exports = app;
