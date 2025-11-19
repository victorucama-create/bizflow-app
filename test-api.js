// test-api.js - Testes da API FASE 5.1
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 Iniciando testes da API FASE 5.1...\n');

  const tests = [
    {
      name: 'Health Check',
      url: '/health',
      method: 'GET'
    },
    {
      name: 'API Status',
      url: '/api/status',
      method: 'GET'
    },
    {
      name: 'Test Endpoint',
      url: '/api/test',
      method: 'GET'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}${test.url}`, {
        method: test.method
      });
      const responseTime = Date.now() - startTime;

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ ${test.name}: PASSED (${responseTime}ms)`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED - ${data.error}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Resultado: ${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
}

testAPI();
