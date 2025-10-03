import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { Access } from './entities/access.entity';
import { UserIgnore } from './entities/user-ignore.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Access, UserIgnore])],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}


