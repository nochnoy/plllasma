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
exports.Access = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
let Access = class Access {
};
exports.Access = Access;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Access.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'id_user', nullable: true }),
    __metadata("design:type", Number)
], Access.prototype, "id_user", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'id_place', nullable: true }),
    __metadata("design:type", Number)
], Access.prototype, "id_place", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Access.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Access.prototype, "addedbyscript", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, user => user.access),
    (0, typeorm_1.JoinColumn)({ name: 'id_user' }),
    __metadata("design:type", user_entity_1.User)
], Access.prototype, "user", void 0);
exports.Access = Access = __decorate([
    (0, typeorm_1.Entity)('tbl_access')
], Access);
//# sourceMappingURL=access.entity.js.map