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
const user_service_1 = require("../user/user.service");
let AuthService = class AuthService {
    constructor(userService, jwtService) {
        this.userService = userService;
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
        const user = await this.userService.findByLoginAndPassword(login, password);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const logkey = this.generateGuid();
        await this.userService.updateLogkey(user.id_user, logkey);
        const oneWeek = 3600 * (24 * 7);
        res.cookie('contortion_key', logkey, {
            maxAge: oneWeek * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        const payload = {
            sub: user.id_user,
            login: user.login,
            logkey: logkey
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            ...user.getClientInfo(),
            accessToken
        };
    }
    async loginByToken(req, res) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const token = this.getToken(req);
        if (!token) {
            throw new common_1.UnauthorizedException('No token found');
        }
        const user = await this.userService.findByLogkey(token);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        const newLogkey = this.generateGuid();
        await this.userService.updateLogkey(user.id_user, newLogkey);
        const oneWeek = 3600 * (24 * 7);
        res.cookie('contortion_key', newLogkey, {
            maxAge: oneWeek * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        const payload = {
            sub: user.id_user,
            login: user.login,
            logkey: newLogkey
        };
        const accessToken = this.jwtService.sign(payload);
        return {
            ...user.getClientInfo(),
            accessToken
        };
    }
    getToken(req) {
        const token = req.cookies?.contortion_key;
        if (!token) {
            return null;
        }
        return token.replace(/['"\\]/g, '');
    }
    async validateUser(payload) {
        const user = await this.userService.findByLogkey(payload.logkey);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        return user;
    }
    async logout(userId, res) {
        await this.userService.clearLogkey(userId);
        res.clearCookie('contortion_key');
        return { authorized: false };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_service_1.UserService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map