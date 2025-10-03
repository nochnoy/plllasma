import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    getCurrentUser(req: Request): Promise<{
        userId: number;
        nick: string;
        icon: string;
        access: import("../user/entities/access.entity").Access[];
        unreadChannels: any[];
    }>;
    logout(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
