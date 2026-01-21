import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { createLogger } from '../utils/logger.js';
import { initializePathfinder } from './bot.js';
import type { DecisionEngine } from '../ai/decision-engine.js';
import type { ShortTermMemory } from '../memory/short-term.js';

const log = createLogger('events');

/**
 * Set up all bot event handlers
 */
export function setupEventHandlers(bot: Bot, decisionEngine: DecisionEngine, shortTermMemory: ShortTermMemory): void {
  // Spawn event
  bot.once('spawn', () => {
    log.info('Bot spawned', {
      position: bot.entity.position,
      health: bot.health,
    });

    initializePathfinder(bot);

    bot.chat('AI Bot online. I can respond to chat and act autonomously.');

    // Start autonomous decision loop after a short delay
    setTimeout(() => {
      decisionEngine.startAutonomousLoop();
    }, 5000);
  });

  // Chat event
  bot.on('chat', async (username: string, message: string) => {
    // Ignore own messages
    if (username === bot.username) return;

    log.info('Chat received', { username, message });

    // Let the decision engine handle it
    await decisionEngine.handleChat(username, message);
  });

  // Health change
  bot.on('health', () => {
    log.debug('Health changed', { health: bot.health, food: bot.food });

    shortTermMemory.addEvent('health_change', {
      health: bot.health,
      food: bot.food,
    });

    // Alert if low health
    if (bot.health < 8) {
      shortTermMemory.addEvent('low_health', { health: bot.health });
    }
  });

  // Entity hurt (bot took damage)
  bot.on('entityHurt', (entity: Entity) => {
    if (entity === bot.entity) {
      log.info('Bot took damage', { health: bot.health });
      shortTermMemory.addEvent('took_damage', { health: bot.health });
    }
  });

  // Player joined
  bot.on('playerJoined', (player) => {
    log.info('Player joined', { username: player.username });
    shortTermMemory.addEvent('player_joined', { username: player.username });
  });

  // Player left
  bot.on('playerLeft', (player) => {
    log.info('Player left', { username: player.username });
    shortTermMemory.addEvent('player_left', { username: player.username });
  });

  // Death event
  bot.on('death', () => {
    log.warn('Bot died');
    shortTermMemory.addEvent('death', {});

    // Stop autonomous loop on death
    decisionEngine.stopAutonomousLoop();
  });

  // Respawn
  bot.on('respawn', () => {
    log.info('Bot respawned');
    shortTermMemory.addEvent('respawn', {});

    // Reinitialize pathfinder
    initializePathfinder(bot);

    // Restart autonomous loop after respawn
    setTimeout(() => {
      decisionEngine.startAutonomousLoop();
    }, 3000);
  });

  // Kicked from server
  bot.on('kicked', (reason: string) => {
    log.error('Bot kicked', { reason });
    decisionEngine.stopAutonomousLoop();
  });

  // Error
  bot.on('error', (err: Error) => {
    log.error('Bot error', { error: err.message });
  });

  // End (disconnected)
  bot.on('end', (reason: string) => {
    log.warn('Bot disconnected', { reason });
    decisionEngine.stopAutonomousLoop();
  });

  log.info('Event handlers set up');
}
