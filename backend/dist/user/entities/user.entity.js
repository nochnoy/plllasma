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
exports.User = void 0;
const typeorm_1 = require("typeorm");
const access_entity_1 = require("./access.entity");
const user_ignore_entity_1 = require("./user-ignore.entity");
let User = class User {
    get icon() {
        return this.icon_old ? this.id_user.toString() : '-';
    }
    getClientInfo() {
        return {
            userId: this.id_user,
            nick: this.nick,
            icon: this.icon,
            access: this.access || [],
            unreadChannels: []
        };
    }
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ name: 'id_user' }),
    __metadata("design:type", Number)
], User.prototype, "id_user", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 80, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "login", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 80, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "nick", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "logkey", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1 }),
    __metadata("design:type", Number)
], User.prototype, "logmode", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "sex", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'time_joined', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", Date)
], User.prototype, "time_joined", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'time_logged', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], User.prototype, "time_logged", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'icon_old', type: 'text', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "icon_old", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: '' }),
    __metadata("design:type", String)
], User.prototype, "usrStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 12, default: '' }),
    __metadata("design:type", String)
], User.prototype, "birthday", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], User.prototype, "country", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 120, default: '' }),
    __metadata("design:type", String)
], User.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 30, default: '' }),
    __metadata("design:type", String)
], User.prototype, "icq", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 120, default: '' }),
    __metadata("design:type", String)
], User.prototype, "homepage", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "businesstype", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], User.prototype, "businesstext", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], User.prototype, "realname", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => access_entity_1.Access, access => access.user),
    __metadata("design:type", Array)
], User.prototype, "access", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_ignore_entity_1.UserIgnore, userIgnore => userIgnore.user),
    __metadata("design:type", Array)
], User.prototype, "ignored", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('tbl_users')
], User);
//# sourceMappingURL=user.entity.js.map