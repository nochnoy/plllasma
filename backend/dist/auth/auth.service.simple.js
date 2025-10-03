"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
let AuthService = class AuthService {
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    generateGuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    async loginByPassword(loginDto, res) {
        const { login, password } = loginDto;
        if (!login || !password) {
            throw new common_1.UnauthorizedException('Login and password are required');
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (login === 'test' && password === 'test') {
            const logkey = this.generateGuid();
            const oneWeek = 3600 * (24 * 7);
            res.cookie('contortion_key', logkey, {
                maxAge: oneWeek * 1000,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
            const payload = {
                sub: 1,
                login: login,
                logkey: logkey
            };
            const accessToken = this.jwtService.sign(payload);
            return {
                userId: 1,
                nick: 'Test User',
                icon: '1',
                access: [],
                unreadChannels: [],
                accessToken
            };
        }
        else {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
    }
    async loginByToken(req, res) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const token = this.getToken(req);
        if (!token) {
            throw new common_1.UnauthorizedException('No token found');
        }
        if (token.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
            const newLogkey = this.generateGuid();
            const oneWeek = 3600 * (24 * 7);
            res.cookie('contortion_key', newLogkey, {
                maxAge: oneWeek * 1000,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
            const payload = {
                sub: 1,
                login: 'test',
                logkey: newLogkey
            };
            const accessToken = this.jwtService.sign(payload);
            return {
                userId: 1,
                nick: 'Test User',
                icon: '1',
                access: [],
                unreadChannels: [],
                accessToken
            };
        }
        else {
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
    getToken(req) {
        const token = req.cookies?.contortion_key;
        if (!token) {
            return null;
        }
        return token.replace(/['"\\]/g, '');
    }
    async validateUser(payload) {
        return {
            id_user: payload.sub,
            login: payload.login,
            nick: 'Test User',
            icon: '1',
            access: [],
            ignored: []
        };
    }
    async logout(userId, res) {
        res.clearCookie('contortion_key');
        return { authorized: false };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.simple.js.map