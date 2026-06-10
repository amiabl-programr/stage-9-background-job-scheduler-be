import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';

@Injectable()
export class DeadLetterRepository extends Repository<DeadLetterEntry> {
  constructor(private dataSource: DataSource) {
    super(DeadLetterEntry, dataSource.createEntityManager());
  }
}
