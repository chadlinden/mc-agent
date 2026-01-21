import mineflayer, { Bot, BotOptions } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements } = pathfinderPkg;
import minecraftData from 'minecraft-data';
import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bot');

/**
 * Create and configure the Mineflayer bot
 */
export function createBot(testableConfig?: Partial<BotOptions>): Bot {
  log.info('Creating bot', {
    host: config.minecraft.host,
    port: config.minecraft.port,
    username: config.minecraft.username,
    version: config.minecraft.version,
  });

  const botOptions: BotOptions = testableConfig && Object.keys(testableConfig).length > 0
    ? testableConfig as BotOptions
    : {
        host: config.minecraft.host,
        port: config.minecraft.port,
        username: config.minecraft.username,
        version: config.minecraft.version,
      };

  const bot = mineflayer.createBot(botOptions);

  // Load pathfinder plugin
  bot.loadPlugin(pathfinder);

  return bot;
}

/**
 * Initialize pathfinder movements after spawn
 */
export function initializePathfinder(bot: Bot): void {
  const mcData = minecraftData(bot.version);
  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);
  log.info('Pathfinder initialized');
}
