// Прокси для локальной docker-разработки (docker-compose.yml, сервис web на :8090).
// Запуск: npm run start:docker
//
// Отличается от proxy.conf.js (прод) двумя вещами: цель — локальный докер, и нет
// правила на '/': всё, что не API и не статика сайта, дев-сервер отдаёт сам из src/.
const TARGET = 'http://localhost:8090';

const PROXY_CONFIG = [
  {
    context: [
      '/api/**',
    ],
    target: TARGET,
    secure: false,
    changeOrigin: true,
    cookieDomainRewrite: 'localhost'
  },
  {
    // Статика web root, которая нужна клиенту: /a/ (общие файлы) и /i/ (юзерпики).
    // Обе папки в докер-контейнере смонтированы из репозитория.
    context: [
      '/a/**',
      '/i/**',
    ],
    target: TARGET,
    secure: false,
    changeOrigin: true
  }
]

module.exports = PROXY_CONFIG;
