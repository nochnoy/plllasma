import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  // Генерация GUID как в PHP
  private generateGuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Авторизация по логину и паролю (копирует loginByPassword из PHP)
  async loginByPassword(loginDto: LoginDto, res: Response): Promise<any> {
    const { login, password } = loginDto;

    if (!login || !password) {
      throw new UnauthorizedException('Login and password are required');
    }

    // Защита от брутфорса (sleep(2) в PHP)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const user = await this.userService.findByLoginAndPassword(login, password);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Создаем токен и сохраняем в БД
    const logkey = this.generateGuid();
    await this.userService.updateLogkey(user.id_user, logkey);

    // Устанавливаем cookie (как createToken в PHP)
    const oneWeek = 3600 * (24 * 7); // 7 дней
    res.cookie('contortion_key', logkey, {
      maxAge: oneWeek * 1000, // в миллисекундах
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    // Создаем JWT токен для дополнительной безопасности
    const payload = { 
      sub: user.id_user, 
      login: user.login,
      logkey: logkey 
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      ...user.getClientInfo(),
      accessToken
    };
  }

  // Авторизация по токену из cookies (копирует loadUserByToken из PHP)
  async loginByToken(req: Request, res: Response): Promise<any> {
    // Защита от брутфорса (sleep(2) в PHP)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const token = this.getToken(req);
    
    if (!token) {
      throw new UnauthorizedException('No token found');
    }

    const user = await this.userService.findByLogkey(token);
    
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Обновляем токен (как createToken в PHP)
    const newLogkey = this.generateGuid();
    await this.userService.updateLogkey(user.id_user, newLogkey);

    // Обновляем cookie
    const oneWeek = 3600 * (24 * 7);
    res.cookie('contortion_key', newLogkey, {
      maxAge: oneWeek * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    const payload = { 
      sub: user.id_user, 
      login: user.login,
      logkey: newLogkey 
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      ...user.getClientInfo(),
      accessToken
    };
  }

  // Получение токена из cookies (копирует getToken из PHP)
  private getToken(req: Request): string | null {
    const token = req.cookies?.contortion_key;
    if (!token) {
      return null;
    }
    
    // Защита от кулхацкеров (как в PHP)
    return token.replace(/['"\\]/g, '');
  }

  // Валидация пользователя по JWT токену
  async validateUser(payload: any): Promise<User> {
    const user = await this.userService.findByLogkey(payload.logkey);
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }
    return user;
  }

  // Выход из системы (копирует логику из logoff.php)
  async logout(userId: number, res: Response): Promise<any> {
    await this.userService.clearLogkey(userId);
    
    // Очищаем cookie
    res.clearCookie('contortion_key');

    return { authorized: false };
  }
}


