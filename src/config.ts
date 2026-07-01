import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(10, 'BOT_TOKEN is required'),
  ADMIN_ID: z.coerce.number().int().positive(),
  TONAPI_KEY: z.string().min(1, 'TONAPI_KEY is required'),
  TONAPI_BASE_URL: z.string().url().default('https://tonapi.io'),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SWEEP_INTERVAL_SEC: z.coerce.number().int().positive().default(120),
  WATCHER_CONCURRENCY: z.coerce.number().int().positive().default(8),
  TONAPI_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  TONAPI_RETRIES: z.coerce.number().int().min(0).default(3),
  // Прикладывать ли свечной график к уведомлениям buy/sell/swap.
  CHART_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Понятная ошибка вместо невнятного падения позже
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
