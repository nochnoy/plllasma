// Простой тест API для проверки работы бэкенда
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  console.log('🧪 Тестирование Plllasma Backend API...\n');

  try {
    // Тест 1: Проверка здоровья сервиса
    console.log('1. Проверка здоровья сервиса...');
    const healthResponse = await fetch(`${API_BASE.replace('/api', '')}/health`);
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('✅ Сервис работает:', health);
    } else {
      console.log('❌ Сервис не отвечает');
    }

    // Тест 2: Проверка главной страницы
    console.log('\n2. Проверка главной страницы...');
    const mainResponse = await fetch(`${API_BASE.replace('/api', '')}/`);
    if (mainResponse.ok) {
      const main = await mainResponse.text();
      console.log('✅ Главная страница:', main);
    }

    // Тест 3: Проверка авторизации без токена
    console.log('\n3. Проверка авторизации без токена...');
    const authResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    if (authResponse.status === 401) {
      console.log('✅ Авторизация без токена корректно отклонена');
    } else {
      console.log('⚠️ Неожиданный ответ авторизации:', authResponse.status);
    }

    // Тест 4: Проверка авторизации с неверными данными
    console.log('\n4. Проверка авторизации с неверными данными...');
    const wrongAuthResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        login: 'test',
        password: 'wrong'
      })
    });
    
    if (wrongAuthResponse.status === 401) {
      console.log('✅ Неверные данные корректно отклонены');
    } else {
      console.log('⚠️ Неожиданный ответ на неверные данные:', wrongAuthResponse.status);
    }

  } catch (error) {
    console.log('❌ Ошибка при тестировании:', error.message);
  }
}

// Запускаем тест через 3 секунды после старта сервера
setTimeout(testAPI, 3000);
