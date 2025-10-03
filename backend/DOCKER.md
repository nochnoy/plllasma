# 🐳 Docker Setup для Plllasma Backend

Полная Docker конфигурация для NestJS приложения с MySQL 8.0.28.

## 📁 Структура Docker файлов

```
backend/
├── Dockerfile                    # Продакшн образ
├── Dockerfile.dev               # Dev образ с hot reload
├── docker-compose.yml           # Продакшн окружение
├── docker-compose.dev.yml       # Dev окружение
├── .dockerignore               # Исключения для Docker
├── docker-scripts.ps1          # PowerShell скрипты управления
├── docker-scripts.sh           # Bash скрипты управления
├── env.docker                  # Переменные для Docker
└── docker/
    └── mysql/
        └── init/
            ├── 01-init.sql     # Инициализация БД
            └── 02-wait-for-tables.sql # Ожидание таблиц
```

## 🚀 Быстрый старт

### 1. Продакшн окружение

```bash
# Запуск продакшн окружения
docker-compose -f docker-compose.yml up -d

# Или через скрипт (Windows)
.\docker-scripts.ps1

# Или через скрипт (Linux/Mac)
./docker-scripts.sh
```

### 2. Dev окружение

```bash
# Запуск dev окружения с hot reload
docker-compose -f docker-compose.dev.yml up -d
```

## 📊 Доступные сервисы

### Продакшн окружение
- **Backend API**: http://localhost:3001
- **phpMyAdmin**: http://localhost:8080
- **MySQL**: localhost:3306

### Dev окружение
- **Backend API**: http://localhost:3001 (с hot reload)
- **phpMyAdmin**: http://localhost:8081
- **MySQL**: localhost:3307
- **Debug Port**: 9229

## 🗄️ База данных

### MySQL 8.0.28 конфигурация

```yaml
# Продакшн
MYSQL_ROOT_PASSWORD: root_password_123
MYSQL_DATABASE: plllasma
MYSQL_USER: plllasma
MYSQL_PASSWORD: plllasma_password_123
PORT: 3306

# Dev
PORT: 3307 (чтобы не конфликтовать с продакшн)
```

### Автоматическая инициализация

1. **01-init.sql** - создает пользователя и базовые настройки
2. **02-wait-for-tables.sql** - ожидает создания основных таблиц
3. **../db/plllasma.sql** - импортируется автоматически

## 🛠️ Управление контейнерами

### PowerShell скрипты (Windows)

```powershell
# Запуск интерактивного меню
.\docker-scripts.ps1

# Или отдельные команды:
# Запуск продакшн
docker-compose -f docker-compose.yml up -d

# Запуск dev
docker-compose -f docker-compose.dev.yml up -d

# Остановка всех
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.dev.yml down
```

### Bash скрипты (Linux/Mac)

```bash
# Запуск интерактивного меню
./docker-scripts.sh

# Или отдельные команды:
# Запуск продакшн
docker-compose -f docker-compose.yml up -d

# Запуск dev
docker-compose -f docker-compose.dev.yml up -d
```

## 🔧 Полезные команды

### Просмотр логов

```bash
# Логи backend
docker-compose -f docker-compose.yml logs -f backend

# Логи MySQL
docker-compose -f docker-compose.yml logs -f mysql

# Все логи
docker-compose -f docker-compose.yml logs -f
```

### Подключение к MySQL

```bash
# Продакшн
docker exec -it plllasma_mysql mysql -u plllasma -p plllasma

# Dev
docker exec -it plllasma_mysql_dev mysql -u plllasma -p plllasma
```

### Пересборка образов

```bash
# Пересборка с очисткой кеша
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.dev.yml build --no-cache
```

### Очистка данных

```bash
# Остановка и удаление volumes (удалит все данные!)
docker-compose -f docker-compose.yml down -v
docker-compose -f docker-compose.dev.yml down -v
docker volume prune -f
```

## 🔍 Отладка

### Dev окружение с отладчиком

```bash
# Запуск dev окружения
docker-compose -f docker-compose.dev.yml up -d

# Подключение отладчика к порту 9229
# VS Code: Debug > Attach to Node Process
```

### Проверка состояния

```bash
# Статус контейнеров
docker-compose -f docker-compose.yml ps

# Использование ресурсов
docker stats

# Проверка сети
docker network ls
docker network inspect backend_plllasma_network
```

## 🚨 Устранение проблем

### Порт уже используется

```bash
# Проверить какие процессы используют порты
netstat -tulpn | grep :3001
netstat -tulpn | grep :3306

# Остановить контейнеры
docker-compose down
```

### База данных не подключается

```bash
# Проверить логи MySQL
docker-compose logs mysql

# Проверить подключение
docker exec -it plllasma_mysql mysql -u root -p

# Пересоздать базу
docker-compose down -v
docker-compose up -d
```

### Проблемы с правами (Linux/Mac)

```bash
# Исправить права на скрипты
chmod +x docker-scripts.sh

# Исправить права на volumes
sudo chown -R $USER:$USER ./logs
```

## 📝 Переменные окружения

### Основные переменные

```bash
# Приложение
NODE_ENV=production|development
APP_PORT=3001

# База данных
DB_HOST=mysql
DB_PORT=3306
DB_USER=plllasma
DB_PASSWORD=plllasma_password_123
DB_NAME=plllasma

# JWT
JWT_SECRET=your-secret-key-here
```

### Кастомизация

1. Скопируйте `env.docker` в `.env.docker`
2. Измените нужные переменные
3. Обновите `docker-compose.yml` для использования нового файла

## 🔒 Безопасность

### Продакшн рекомендации

1. **Измените пароли** в `docker-compose.yml`
2. **Используйте сильные JWT секреты**
3. **Настройте файрвол** для ограничения доступа к портам
4. **Используйте HTTPS** в продакшн
5. **Регулярно обновляйте** образы

### Пример безопасной конфигурации

```yaml
environment:
  MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
  MYSQL_PASSWORD: ${MYSQL_PASSWORD}
  JWT_SECRET: ${JWT_SECRET}
```

## 📈 Мониторинг

### Health checks

```bash
# Проверка здоровья API
curl http://localhost:3001/health

# Проверка MySQL
docker exec -it plllasma_mysql mysqladmin ping
```

### Логирование

```bash
# Настройка ротации логов в docker-compose.yml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```
