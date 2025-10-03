import { Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { User } from '../user/entities/user.entity';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private authService;
    constructor(authService: AuthService);
    validate(payload: any): Promise<User>;
}
export {};
