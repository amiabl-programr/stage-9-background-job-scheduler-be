import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobsTable1781001919651 implements MigrationInterface {
  name = 'CreateJobsTable1781001919651';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jobs_status_enum') THEN
          CREATE TYPE "public"."jobs_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "priority" integer NOT NULL DEFAULT '2',
        "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'pending',
        "retryCount" integer NOT NULL DEFAULT '0',
        "lastError" text,
        "scheduledAt" TIMESTAMP WITH TIME ZONE,
        "recurringInterval" character varying,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "effectivePriority" double precision NOT NULL DEFAULT '0',
        "dependsOn" uuid array NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."jobs_status_enum"`);
  }
}
