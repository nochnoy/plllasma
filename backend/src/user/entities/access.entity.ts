import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('tbl_access')
export class Access {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_user', nullable: true })
  id_user: number;

  @Column({ name: 'id_place', nullable: true })
  id_place: number;

  @Column({ nullable: true })
  role: number;

  @Column({ default: 0 })
  addedbyscript: number;

  @ManyToOne(() => User, user => user.access)
  @JoinColumn({ name: 'id_user' })
  user: User;
}


