import { logger } from './logger.js';
import { sql } from './db/index.js';
import { buildBot, attachHandlers } from './bot/index.js';
import { setBotCommands } from './bot/commands.js';
import { Notifier } from './services/notify.js';
import { Watcher } from './services/watcher.js';

async function main(): Promise<void> {
  logger.info('Starting TON Wallet Tracker…');

  const bot = buildBot();
  const notifier = new Notifier(bot);
  const watcher = new Watcher(notifier);
  attachHandlers(bot, watcher);

  await watcher.start();
  await setBotCommands(bot);

  // graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down…');
    watcher.stop();
    await bot.stop();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  // long polling; для вебхука пришлось бы поднимать HTTP — для MVP polling проще
  await bot.start({
    drop_pending_updates: true,
    onStart: (me) => logger.info({ username: me.username }, 'Bot started'),
  });
}

main().catch((err) => {
  logger.error({ err: String(err) }, 'Fatal startup error');
  process.exit(1);
});
