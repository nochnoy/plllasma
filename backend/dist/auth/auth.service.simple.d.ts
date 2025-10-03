import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
export declare class AuthService {
    private jwtService;
    constructor(jwtService: JwtService);
    private generateGuid;
    loginByPassword(loginDto: LoginDto, res: Response): Promise<any>;
    loginByToken(req: Request, res: Response): Promise<any>;
    private getToken;
    validateUser(payload: any): Promise<any>;
    logout(userId: number, res: Response): Promise<any>;
}
