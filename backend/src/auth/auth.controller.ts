import { Controller, Post, Body, Req, Res, UseGuards, Get } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from '../user/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /api/auth/login - авторизация по логину/паролю или по токену
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res() res: Response) {
    try {
      // Если логин и пароль не указаны - пытаемся авторизоваться по токену из cookies
      if (!loginDto.login && !loginDto.password) {
        const result = await this.authService.loginByToken(req, res);
        return res.json(result);
      } else {
        // Авторизация по логину и паролю
        const result = await this.authService.loginByPassword(loginDto, res);
        return res.json(result);
      }
    } catch (error) {
      return res.status(401).json({ error: 'auth' });
    }
  }

  // GET /api/auth/me - получение информации о текущем пользователе
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Req() req: Request) {
    const user: User = req.user as User;
    return user.getClientInfo();
  }

  // POST /api/auth/logout - выход из системы
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const user: User = req.user as User;
    const result = await this.authService.logout(user.id_user, res);
    return res.json(result);
  }
}


