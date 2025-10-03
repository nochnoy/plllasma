"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const cookieParser = require("cookie-parser");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use(cookieParser());
    app.enableCors({
        origin: [
            'https://plllasma.ru',
            'https://plllasma.com',
            'https://contortion.ru',
            'https://localhost',
            'http://localhost:4200'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Cache-Control', 'Pragma', 'Origin', 'Authorization', 'Content-Type', 'X-Requested-With', 'X-Auth-Token']
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
    }));
    app.setGlobalPrefix('api');
    await app.listen(3001);
    console.log('Backend server running on port 3001');
}
bootstrap();
//# sourceMappingURL=main.js.map