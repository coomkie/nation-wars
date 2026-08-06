import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { Bracket } from './bracket.entity';

@Entity('bracket_nodes')
export class BracketNode {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  bracketId: string;

  @ManyToOne(() => Bracket, (bracket) => bracket.nodes, {
    onDelete: 'CASCADE',
  })
  bracket: Bracket;

  /** 0 = final/root; higher = earlier rounds */
  @Column({ type: 'int' })
  round: number;

  @Column({ type: 'varchar', nullable: true })
  nationId: string | null;

  @Column({ type: 'varchar', nullable: true })
  leftChildId: string | null;

  @Column({ type: 'varchar', nullable: true })
  rightChildId: string | null;

  @Column({ type: 'varchar', nullable: true })
  matchId: string | null;

  @Column({ default: false })
  isBye: boolean;
}
