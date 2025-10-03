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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("./entities/user.entity");
const access_entity_1 = require("./entities/access.entity");
const user_ignore_entity_1 = require("./entities/user-ignore.entity");
let UserService = class UserService {
    constructor(userRepository, accessRepository, userIgnoreRepository) {
        this.userRepository = userRepository;
        this.accessRepository = accessRepository;
        this.userIgnoreRepository = userIgnoreRepository;
    }
    async findByLogin(login) {
        return this.userRepository.findOne({
            where: { login },
            relations: ['access', 'ignored']
        });
    }
    async findByLoginAndPassword(login, password) {
        return this.userRepository.findOne({
            where: { login, password },
            relations: ['access', 'ignored']
        });
    }
    async findByLogkey(logkey) {
        return this.userRepository.findOne({
            where: { logkey },
            relations: ['access', 'ignored']
        });
    }
    async updateLogkey(userId, logkey) {
        await this.userRepository.update(userId, {
            logkey,
            time_logged: new Date()
        });
    }
    async clearLogkey(userId) {
        await this.userRepository.update(userId, { logkey: '' });
    }
    canRead(user, channelId) {
        if (!user.access || user.access.length === 0) {
            return false;
        }
        for (const access of user.access) {
            if (access.id_place === channelId) {
                const role = parseInt(access.role.toString());
                if (role !== 9) {
                    return true;
                }
            }
        }
        return false;
    }
    canWrite(user, channelId) {
        if (!user.access || user.access.length === 0) {
            return false;
        }
        for (const access of user.access) {
            if (access.id_place === channelId) {
                const role = parseInt(access.role.toString());
                if (role !== 9) {
                    return true;
                }
            }
        }
        return false;
    }
    canTrash(user, channelId) {
        if (!user.access || user.access.length === 0) {
            return false;
        }
        for (const access of user.access) {
            if (access.id_place === channelId) {
                const role = parseInt(access.role.toString());
                if (role === 2 || role === 3 || role === 4 || role === 5) {
                    return true;
                }
            }
        }
        return false;
    }
    canEditMatrix(user, channelId) {
        if (!user.access || user.access.length === 0) {
            return false;
        }
        for (const access of user.access) {
            if (access.id_place === channelId) {
                const role = parseInt(access.role.toString());
                if (role === 3 || role === 4 || role === 5) {
                    return true;
                }
            }
        }
        return false;
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(access_entity_1.Access)),
    __param(2, (0, typeorm_1.InjectRepository)(user_ignore_entity_1.UserIgnore)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], UserService);
//# sourceMappingURL=user.service.js.map