import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
export declare class AuthService {
    private userService;
    private jwtService;
    constructor(userService: UserService, jwtService: JwtService);
    private generateGuid;
    loginByPassword(loginDto: LoginDto, res: Response): Promise<any>;
    loginByToken(req: Request, res: Response): Promise<any>;
    private getToken;
    validateUser(payload: any): Promise<User>;
    logout(userId: number, res: Response): Promise<any>;
}
