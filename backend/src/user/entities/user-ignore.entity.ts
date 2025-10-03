import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('lnk_user_ignor')
export class UserIgnore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_user' })
  id_user: number;

  @Column({ name: 'id_ignored_user' })
  id_ignored_user: number;

  @Column({ name: 'date_created', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_created: Date;

  @ManyToOne(() => User, user => user.ignored)
  @JoinColumn({ name: 'id_user' })
  user: User;
}


