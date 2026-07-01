import type { Bot } from 'grammy';
import type { BotContext } from './context.js';
import { logger } from '../logger.js';

// Подсказки команд в меню Telegram (кнопка «/»). Локализуем через language_code.
const COMMANDS_RU = [
  { command: 'menu', description: 'Главное меню' },
  { command: 'add', description: 'Добавить кошелёк' },
  { command: 'list', description: 'Мои кошельки' },
  { command: 'remove', description: 'Удалить кошельки' },
  { command: 'groups', description: 'Группы' },
  { command: 'stats', description: 'Статистика' },
  { command: 'settings', description: 'Настройки' },
  { command: 'cancel', description: 'Отмена текущего действия' },
  { command: 'lang', description: 'Язык / Language' },
  { command: 'help', description: 'Помощь' },
];

const COMMANDS_EN = [
  { command: 'menu', description: 'Main menu' },
  { command: 'add', description: 'Add a wallet' },
  { command: 'list', description: 'My wallets' },
  { command: 'remove', description: 'Remove wallets' },
  { command: 'groups', description: 'Groups' },
  { command: 'stats', description: 'Stats' },
  { command: 'settings', description: 'Settings' },
  { command: 'cancel', description: 'Cancel current action' },
  { command: 'lang', description: 'Language / Язык' },
  { command: 'help', description: 'Help' },
];

/** Регистрирует подсказки команд в Telegram (RU по умолчанию + EN). */
export async function setBotCommands(bot: Bot<BotContext>): Promise<void> {
  try {
    await bot.api.setMyCommands(COMMANDS_RU);
    await bot.api.setMyCommands(COMMANDS_EN, { language_code: 'en' });
  } catch (err) {
    logger.warn({ err: String(err) }, 'setMyCommands failed');
  }
}
