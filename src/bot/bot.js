import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements } = pathfinderPkg;
import minecraftData from 'minecraft-data';
import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bot');

/**
 * Create and configure the Mineflayer bot
 */
export function createBot() {
  log.info('Creating bot', {
    host: config.minecraft.host,
    port: config.minecraft.port,
    username: config.minecraft.username,
    version: config.minecraft.version,
  });

  const bot = mineflayer.createBot({
    host: config.minecraft.host,
    port: config.minecraft.port,
    username: config.minecraft.username,
    version: config.minecraft.version,
  });

  // Load pathfinder plugin
  bot.loadPlugin(pathfinder);

  return bot;
}

/**
 * Initialize pathfinder movements after spawn
 */
export function initializePathfinder(bot) {
  const mcData = minecraftData(bot.version);
  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);
  log.info('Pathfinder initialized');
}
