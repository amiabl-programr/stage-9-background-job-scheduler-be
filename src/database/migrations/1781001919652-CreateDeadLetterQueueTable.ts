import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeadLetterQueueTable1781001919652 implements MigrationInterface {
  name = 'CreateDeadLetterQueueTable1781001919652';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dead_letter_queue" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "jobId" uuid NOT NULL,
        "errorMessage" text NOT NULL,
        "finalRetryCount" integer NOT NULL,
        "jobSnapshot" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dead_letter_queue" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dead_letter_queue"`);
  }
}
