import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('dead_letter_queue')
export class DeadLetterEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  jobId: string;

  @Column('text')
  errorMessage: string;

  @Column('int')
  finalRetryCount: number;

  @Column({ type: 'jsonb' })
  jobSnapshot: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
