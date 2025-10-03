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
exports.UserIgnore = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
let UserIgnore = class UserIgnore {
};
exports.UserIgnore = UserIgnore;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], UserIgnore.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'id_user' }),
    __metadata("design:type", Number)
], UserIgnore.prototype, "id_user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'id_ignored_user' }),
    __metadata("design:type", Number)
], UserIgnore.prototype, "id_ignored_user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'date_created', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", Date)
], UserIgnore.prototype, "date_created", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, user => user.ignored),
    (0, typeorm_1.JoinColumn)({ name: 'id_user' }),
    __metadata("design:type", user_entity_1.User)
], UserIgnore.prototype, "user", void 0);
exports.UserIgnore = UserIgnore = __decorate([
    (0, typeorm_1.Entity)('lnk_user_ignor')
], UserIgnore);
//# sourceMappingURL=user-ignore.entity.js.map