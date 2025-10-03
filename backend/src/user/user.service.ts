import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Access } from './entities/access.entity';
import { UserIgnore } from './entities/user-ignore.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Access)
    private accessRepository: Repository<Access>,
    @InjectRepository(UserIgnore)
    private userIgnoreRepository: Repository<UserIgnore>,
  ) {}

  async findByLogin(login: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { login },
      relations: ['access', 'ignored']
    });
  }

  async findByLoginAndPassword(login: string, password: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { login, password },
      relations: ['access', 'ignored']
    });
  }

  async findByLogkey(logkey: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { logkey },
      relations: ['access', 'ignored']
    });
  }

  async updateLogkey(userId: number, logkey: string): Promise<void> {
    await this.userRepository.update(userId, { 
      logkey, 
      time_logged: new Date() 
    });
  }

  async clearLogkey(userId: number): Promise<void> {
    await this.userRepository.update(userId, { logkey: '' });
  }

  // Проверка прав доступа (копирует логику из PHP)
  canRead(user: User, channelId: number): boolean {
    if (!user.access || user.access.length === 0) {
      return false;
    }
    
    for (const access of user.access) {
      if (access.id_place === channelId) {
        const role = parseInt(access.role.toString());
        if (role !== 9) { // ROLE_NOBODY
          return true;
        }
      }
    }
    return false;
  }

  canWrite(user: User, channelId: number): boolean {
    if (!user.access || user.access.length === 0) {
      return false;
    }
    
    for (const access of user.access) {
      if (access.id_place === channelId) {
        const role = parseInt(access.role.toString());
        if (role !== 9) { // ROLE_NOBODY
          return true;
        }
      }
    }
    return false;
  }

  canTrash(user: User, channelId: number): boolean {
    if (!user.access || user.access.length === 0) {
      return false;
    }
    
    for (const access of user.access) {
      if (access.id_place === channelId) {
        const role = parseInt(access.role.toString());
        if (role === 2 || role === 3 || role === 4 || role === 5) { // ROLE_MODERATOR, ROLE_ADMIN, ROLE_OWNER, ROLE_GOD
          return true;
        }
      }
    }
    return false;
  }

  canEditMatrix(user: User, channelId: number): boolean {
    if (!user.access || user.access.length === 0) {
      return false;
    }
    
    for (const access of user.access) {
      if (access.id_place === channelId) {
        const role = parseInt(access.role.toString());
        if (role === 3 || role === 4 || role === 5) { // ROLE_ADMIN, ROLE_OWNER, ROLE_GOD
          return true;
        }
      }
    }
    return false;
  }
}


