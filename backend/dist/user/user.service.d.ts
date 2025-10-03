import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Access } from './entities/access.entity';
import { UserIgnore } from './entities/user-ignore.entity';
export declare class UserService {
    private userRepository;
    private accessRepository;
    private userIgnoreRepository;
    constructor(userRepository: Repository<User>, accessRepository: Repository<Access>, userIgnoreRepository: Repository<UserIgnore>);
    findByLogin(login: string): Promise<User | null>;
    findByLoginAndPassword(login: string, password: string): Promise<User | null>;
    findByLogkey(logkey: string): Promise<User | null>;
    updateLogkey(userId: number, logkey: string): Promise<void>;
    clearLogkey(userId: number): Promise<void>;
    canRead(user: User, channelId: number): boolean;
    canWrite(user: User, channelId: number): boolean;
    canTrash(user: User, channelId: number): boolean;
    canEditMatrix(user: User, channelId: number): boolean;
}
