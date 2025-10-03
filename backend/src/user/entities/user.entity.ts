import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Access } from './access.entity';
import { UserIgnore } from './user-ignore.entity';

@Entity('tbl_users')
export class User {
  @PrimaryGeneratedColumn({ name: 'id_user' })
  id_user: number;

  @Column({ length: 80, nullable: true })
  login: string;

  @Column({ length: 80, nullable: true })
  password: string;

  @Column({ length: 32, nullable: true })
  nick: string;

  @Column({ length: 100, nullable: true })
  logkey: string;

  @Column({ default: 1 })
  logmode: number;

  @Column({ default: 0 })
  sex: number;

  @Column({ type: 'text' })
  email: string;

  @Column({ name: 'time_joined', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  time_joined: Date;

  @Column({ name: 'time_logged', type: 'datetime', nullable: true })
  time_logged: Date;

  @Column({ name: 'icon_old', type: 'text', nullable: true })
  icon_old: string;

  @Column({ length: 10, default: '' })
  usrStatus: string;

  @Column({ length: 12, default: '' })
  birthday: string;

  @Column({ type: 'text' })
  country: string;

  @Column({ length: 120, default: '' })
  city: string;

  @Column({ length: 30, default: '' })
  icq: string;

  @Column({ length: 120, default: '' })
  homepage: string;

  @Column({ default: 0 })
  businesstype: number;

  @Column({ type: 'text' })
  businesstext: string;

  @Column({ type: 'text' })
  realname: string;

  @OneToMany(() => Access, access => access.user)
  access: Access[];

  @OneToMany(() => UserIgnore, userIgnore => userIgnore.user)
  ignored: UserIgnore[];

  // Виртуальное поле для иконки (как в PHP)
  get icon(): string {
    return this.icon_old ? this.id_user.toString() : '-';
  }

  // Получить информацию для клиента (как getUserInfoForClient в PHP)
  getClientInfo() {
    return {
      userId: this.id_user,
      nick: this.nick,
      icon: this.icon,
      access: this.access || [],
      unreadChannels: [] // TODO: реализовать логику непрочитанных каналов
    };
  }
}


