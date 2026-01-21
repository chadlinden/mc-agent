import mineflayer, { Bot, BotOptions } from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder } = pathfinderPkg;
import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';
import { initializeNavigation, getNavigationController } from './navigation-controller.js';

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
 * Now uses the NavigationController for centralized navigation management
 */
export function initializePathfinder(bot: Bot): void {
  const nav = initializeNavigation(bot);

  // Configure default navigation behavior
  nav.configure({
    canDig: true,
    allowSprinting: true,
    allowParkour: true,
    maxDropDown: 4,
  });

  // Custom block handlers/rules
  nav.onBlock('*leaves', () => ({
    action: 'break',
    toolType: '_axe',           // Prefer axes
    avoidTools: ['_sword'],     // Never use swords
  }));
  nav.onBlock('oak_door', () => 'allow');
  nav.onBlock('water', () => 'avoid');

  log.info('Pathfinder initialized with NavigationController');
}

// Re-export for convenience
export { getNavigationController };
