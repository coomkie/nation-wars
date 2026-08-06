import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BracketNode } from './bracket-node.entity';

@Entity('brackets')
export class Bracket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rootNodeId: string;

  @Column({ type: 'varchar', nullable: true })
  championNationId: string | null;

  @Column({ default: 'active' })
  status: 'active' | 'completed';

  @OneToMany(() => BracketNode, (node) => node.bracket, {
    cascade: true,
    eager: true,
  })
  nodes: BracketNode[];

  @CreateDateColumn()
  createdAt: Date;
}
