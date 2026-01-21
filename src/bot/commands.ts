import type { Bot } from 'mineflayer';
import { createLogger } from '../utils/logger.js';
import type { DecisionEngine } from '../ai/decision-engine.js';

const log = createLogger('commands');

type CommandHandler = (bot: Bot, decisionEngine: DecisionEngine) => Promise<boolean>;

interface DirectCommands {
  [key: string]: CommandHandler;
}

/**
 * Built-in commands that bypass the LLM for direct control
 * These are triggered by specific keywords in chat
 */
const DIRECT_COMMANDS: DirectCommands = {
  // Emergency stop
  'stop': async (bot: Bot, decisionEngine: DecisionEngine): Promise<boolean> => {
    bot.pathfinder.setGoal(null);
    decisionEngine.stopAutonomousLoop();
    bot.chat('Stopped all actions.');
    return true;
  },

  // Resume autonomous behavior
  'resume': async (bot: Bot, decisionEngine: DecisionEngine): Promise<boolean> => {
    decisionEngine.startAutonomousLoop();
    bot.chat('Resumed autonomous behavior.');
    return true;
  },

  // Status report
  'status': async (bot: Bot, decisionEngine: DecisionEngine): Promise<boolean> => {
    const pos = bot.entity.position;
    const busy = decisionEngine.isBusy() ? 'busy' : 'idle';
    bot.chat(`HP: ${Math.round(bot.health)}/20, Food: ${Math.round(bot.food)}/20, Pos: ${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}, Status: ${busy}`);
    return true;
  },

  // List inventory
  'inventory': async (bot: Bot): Promise<boolean> => {
    const items = bot.inventory.items();
    if (items.length === 0) {
      bot.chat('Inventory is empty.');
      return true;
    }
    const summary = items.slice(0, 5).map(i => `${i.name}x${i.count}`).join(', ');
    const more = items.length > 5 ? ` +${items.length - 5} more` : '';
    bot.chat(`Inv: ${summary}${more}`);
    return true;
  },

  // Help
  'help': async (bot: Bot): Promise<boolean> => {
    bot.chat('Commands: stop, resume, status, inventory, help. Or just chat with me!');
    return true;
  },
};

/**
 * Check if a message is a direct command and execute it
 * Returns true if command was handled, false otherwise
 */
export async function tryDirectCommand(message: string, bot: Bot, decisionEngine: DecisionEngine): Promise<boolean> {
  const cmd = message.toLowerCase().trim();

  const handler = DIRECT_COMMANDS[cmd];
  if (handler) {
    log.info('Executing direct command', { command: cmd });
    try {
      await handler(bot, decisionEngine);
      return true;
    } catch (err) {
      const error = err as Error;
      log.error('Command error', { command: cmd, error: error.message });
      bot.chat(`Command failed: ${error.message}`);
      return true; // Still considered handled
    }
  }

  return false;
}

export { DIRECT_COMMANDS };
