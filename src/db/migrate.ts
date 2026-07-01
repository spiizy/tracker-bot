import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Отдельное короткоживущее соединение только для миграций.
async function main() {
  const client = postgres(config.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  logger.info('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  logger.info('Migrations complete.');
  await client.end();
}

main().catch((err) => {
  logger.error(err, 'Migration failed');
  process.exit(1);
});
