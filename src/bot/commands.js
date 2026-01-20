import { createLogger } from '../utils/logger.js';

const log = createLogger('commands');

/**
 * Built-in commands that bypass the LLM for direct control
 * These are triggered by specific keywords in chat
 */
const DIRECT_COMMANDS = {
  // Emergency stop
  'stop': async (bot, decisionEngine) => {
    bot.pathfinder.setGoal(null);
    decisionEngine.stopAutonomousLoop();
    bot.chat('Stopped all actions.');
    return true;
  },

  // Resume autonomous behavior
  'resume': async (bot, decisionEngine) => {
    decisionEngine.startAutonomousLoop();
    bot.chat('Resumed autonomous behavior.');
    return true;
  },

  // Status report
  'status': async (bot, decisionEngine) => {
    const pos = bot.entity.position;
    const busy = decisionEngine.isBusy() ? 'busy' : 'idle';
    bot.chat(`HP: ${Math.round(bot.health)}/20, Food: ${Math.round(bot.food)}/20, Pos: ${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}, Status: ${busy}`);
    return true;
  },

  // List inventory
  'inventory': async (bot) => {
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
  'help': async (bot) => {
    bot.chat('Commands: stop, resume, status, inventory, help. Or just chat with me!');
    return true;
  },
};

/**
 * Check if a message is a direct command and execute it
 * Returns true if command was handled, false otherwise
 */
export async function tryDirectCommand(message, bot, decisionEngine) {
  const cmd = message.toLowerCase().trim();

  if (DIRECT_COMMANDS[cmd]) {
    log.info('Executing direct command', { command: cmd });
    try {
      await DIRECT_COMMANDS[cmd](bot, decisionEngine);
      return true;
    } catch (err) {
      log.error('Command error', { command: cmd, error: err.message });
      bot.chat(`Command failed: ${err.message}`);
      return true; // Still considered handled
    }
  }

  return false;
}

export { DIRECT_COMMANDS };
