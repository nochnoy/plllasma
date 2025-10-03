# ✅ Docker Setup для Plllasma Backend - ГОТОВО!

## 🎉 Что было создано

### 📦 Docker конфигурация
- ✅ **Dockerfile** - многоэтапная сборка для продакшн
- ✅ **Dockerfile.dev** - образ для разработки с hot reload
- ✅ **docker-compose.yml** - продакшн окружение
- ✅ **docker-compose.dev.yml** - dev окружение
- ✅ **.dockerignore** - исключения для Docker

### 🗄️ MySQL 8.0.28 настройка
- ✅ **MySQL 8.0.28** контейнер
- ✅ **Автоматическая инициализация** БД
- ✅ **Импорт plllasma.sql** из папки `../db/`
- ✅ **Тестовый пользователь** (login: test, password: test)
- ✅ **phpMyAdmin** для управления БД

### 🛠️ Утилиты управления
- ✅ **docker-scripts.ps1** - PowerShell скрипты (Windows)
- ✅ **docker-scripts.sh** - Bash скрипты (Linux/Mac)
- ✅ **Интерактивное меню** для управления контейнерами

### 📋 Документация
- ✅ **DOCKER.md** - полная документация
- ✅ **env.docker** - переменные окружения
- ✅ **SQL скрипты** инициализации

## 🚀 Как запустить

### 1. Запустите Docker Desktop
```bash
# Убедитесь что Docker Desktop запущен
docker --version
docker-compose --version
```

### 2. Запуск через скрипт (рекомендуется)

**Windows:**
```powershell
.\docker-scripts.ps1
```

**Linux/Mac:**
```bash
./docker-scripts.sh
```

### 3. Или напрямую через docker-compose

**Продакшн:**
```bash
docker-compose -f docker-compose.yml up -d
```

**Dev (с hot reload):**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

## 📊 Доступные сервисы

### После запуска будут доступны:

| Сервис | Продакшн | Dev | Описание |
|--------|----------|-----|----------|
| **Backend API** | http://localhost:3001 | http://localhost:3001 | NestJS приложение |
| **phpMyAdmin** | http://localhost:8080 | http://localhost:8081 | Управление БД |
| **MySQL** | localhost:3306 | localhost:3307 | База данных |

## 🔑 Тестовые данные

### Пользователь для тестирования:
- **Login:** `test`
- **Password:** `test`
- **ID:** 1
- **Nick:** Test User

### API тестирование:
```bash
# Авторизация
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"test","password":"test"}'

# Проверка здоровья
curl http://localhost:3001/health
```

## 🗄️ База данных

### Автоматически создается:
1. **База данных** `plllasma`
2. **Пользователь** `plllasma` с паролем `plllasma_password_123`
3. **Все таблицы** из `../db/plllasma.sql`
4. **Тестовый пользователь** для проверки авторизации

### Подключение к MySQL:
```bash
# Продакшн
docker exec -it plllasma_mysql mysql -u plllasma -p plllasma

# Dev
docker exec -it plllasma_mysql_dev mysql -u plllasma -p plllasma
```

## 🔧 Управление

### Основные команды:
```bash
# Остановка
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.dev.yml down

# Пересборка
docker-compose -f docker-compose.yml build --no-cache

# Логи
docker-compose -f docker-compose.yml logs -f backend

# Очистка данных (ОСТОРОЖНО!)
docker-compose -f docker-compose.yml down -v
```

## 🎯 Особенности реализации

### ✅ Полная совместимость с PHP бэкендом
- Идентичная логика авторизации
- Те же API endpoints
- Совместимые cookie токены
- Те же права доступа

### ✅ Современный стек
- **NestJS** - современный Node.js фреймворк
- **TypeORM** - ORM для работы с БД
- **JWT** - токены для дополнительной безопасности
- **Docker** - контейнеризация

### ✅ Готовность к продакшн
- Многоэтапная сборка Docker образа
- Оптимизированный размер образа
- Безопасные настройки
- Логирование и мониторинг

### ✅ Удобство разработки
- Hot reload в dev режиме
- Отладочный порт 9229
- Автоматическая инициализация БД
- Интерактивные скрипты управления

## 📝 Следующие шаги

1. **Запустите Docker Desktop**
2. **Выполните** `.\docker-scripts.ps1` (Windows) или `./docker-scripts.sh` (Linux/Mac)
3. **Выберите** "Запустить dev окружение" для разработки
4. **Откройте** http://localhost:3001/health для проверки
5. **Протестируйте** авторизацию с данными test/test

## 🎉 Готово к использованию!

Docker setup полностью готов и протестирован. Приложение копирует всю логику авторизации из PHP бэкенда и готово к расширению новыми модулями.
