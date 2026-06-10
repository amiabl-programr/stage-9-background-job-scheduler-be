import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  });

  await ds.initialize();
  const queryRunner = ds.createQueryRunner();

  try {
    await queryRunner.query(
      `INSERT INTO "jobs" ("type", "payload", "priority") VALUES ('send_email', '{"to":"admin@test.com","subject":"Hello"}', 1)`,
    );
    await queryRunner.query(
      `INSERT INTO "jobs" ("type", "payload", "priority") VALUES ('send_email', '{"to":"user@test.com","subject":"Welcome"}', 2)`,
    );
    await queryRunner.query(
      `INSERT INTO "jobs" ("type", "payload", "priority") VALUES ('generate_report', '{"reportId":"r1"}', 3)`,
    );

    console.log('Seed completed: 3 jobs inserted');
  } finally {
    await queryRunner.release();
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
