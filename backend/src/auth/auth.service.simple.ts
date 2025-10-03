import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
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

  // Простая авторизация без БД для тестирования
  async loginByPassword(loginDto: LoginDto, res: Response): Promise<any> {
    const { login, password } = loginDto;

    if (!login || !password) {
      throw new UnauthorizedException('Login and password are required');
    }

    // Защита от брутфорса (sleep(2) в PHP)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Простая проверка для тестирования (в реальном приложении - запрос к БД)
    if (login === 'test' && password === 'test') {
      const logkey = this.generateGuid();

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
        sub: 1, // ID пользователя
        login: login,
        logkey: logkey 
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        userId: 1,
        nick: 'Test User',
        icon: '1',
        access: [],
        unreadChannels: [],
        accessToken
      };
    } else {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  // Авторизация по токену из cookies (упрощенная версия)
  async loginByToken(req: Request, res: Response): Promise<any> {
    // Защита от брутфорса (sleep(2) в PHP)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const token = this.getToken(req);
    
    if (!token) {
      throw new UnauthorizedException('No token found');
    }

    // В реальном приложении здесь будет проверка в БД
    // Для тестирования просто проверяем формат GUID
    if (token.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      const newLogkey = this.generateGuid();

      // Обновляем cookie
      const oneWeek = 3600 * (24 * 7);
      res.cookie('contortion_key', newLogkey, {
        maxAge: oneWeek * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      const payload = { 
        sub: 1, 
        login: 'test',
        logkey: newLogkey 
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        userId: 1,
        nick: 'Test User',
        icon: '1',
        access: [],
        unreadChannels: [],
        accessToken
      };
    } else {
      throw new UnauthorizedException('Invalid token');
    }
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

  // Валидация пользователя по JWT токену (упрощенная)
  async validateUser(payload: any): Promise<any> {
    // В реальном приложении здесь будет запрос к БД
    return {
      id_user: payload.sub,
      login: payload.login,
      nick: 'Test User',
      icon: '1',
      access: [],
      ignored: []
    };
  }

  // Выход из системы
  async logout(userId: number, res: Response): Promise<any> {
    // Очищаем cookie
    res.clearCookie('contortion_key');

    return { authorized: false };
  }
}
