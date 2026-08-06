import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('match_history')
export class MatchHistory {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  bracketNodeId: string | null;

  @Column()
  nationAId: string;

  @Column()
  nationBId: string;

  @Column({ type: 'int' })
  scoreA: number;

  @Column({ type: 'int' })
  scoreB: number;

  @Column({ type: 'varchar', nullable: true })
  winnerNationId: string | null;

  @Column({ type: 'varchar', nullable: true })
  generalA: string | null;

  @Column({ type: 'varchar', nullable: true })
  generalB: string | null;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @Column({ type: 'datetime' })
  endedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}