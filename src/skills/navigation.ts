import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import { createLogger } from '../utils/logger.js';
import type { SkillModule } from '../types/index.js';
import { getNavigationController } from '../bot/navigation-controller.js';

const log = createLogger('skill:navigation');

export const description = 'Movement and pathfinding skills';

interface TargetResult {
  type: 'entity' | 'position';
  entity?: Entity;
  position?: InstanceType<typeof Vec3>;
  name?: string;
}

/**
 * Parse a target string into a position or entity
 */
export function parseTarget(bot: Bot, target: string): TargetResult | null {
  if (!target) return null;

  // player:Name format
  if (target.startsWith('player:')) {
    const playerName = target.slice(7);
    const player = bot.players[playerName];
    if (player?.entity) {
      return { type: 'entity', entity: player.entity, name: playerName };
    }
    return null;
  }

  // position:x,y,z format
  if (target.startsWith('position:')) {
    const coords = target.slice(9).split(',').map(Number);
    if (coords.length === 3 && coords.every(n => !isNaN(n))) {
      return { type: 'position', position: new Vec3(coords[0]!, coords[1]!, coords[2]!) };
    }
    return null;
  }

  // entity:type format (find nearest of type)
  if (target.startsWith('entity:')) {
    const entityType = target.slice(7);
    const entity = bot.nearestEntity(e => e?.name === entityType || e?.mobType === entityType);
    if (entity) {
      return { type: 'entity', entity, name: entityType };
    }
    return null;
  }

  // Try as player name directly
  const player = bot.players[target];
  if (player?.entity) {
    return { type: 'entity', entity: player.entity, name: target };
  }

  return null;
}

export const actions: SkillModule['actions'] = {
  goto: {
    description: 'Move to a target location or entity',
    params: {
      target: 'Target: "player:Name", "position:x,y,z", or "entity:type"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const nav = getNavigationController(bot);
      log.info(`🎯 Parsing target: "${params.target}"`);
      const target = parseTarget(bot, params.target as string);
      if (!target) {
        throw new Error(`Invalid or not found target: ${params.target}`);
      }

      // Use different navigation methods based on target type:
      // - Entities: Use gotoEntity with GoalFollow to dynamically track position (including y)
      // - Positions: Use goto with GoalNear for static coordinates
      if (target.type === 'entity' && target.entity) {
        return nav.gotoEntity(target.entity, { range: 2, canBreak: true });
      } else if (target.position) {
        return nav.goto(target.position, { range: 1 });
      } else {
        throw new Error('Invalid target');
      }
    },
  },

  follow: {
    description: 'Continuously follow a player',
    params: {
      player: 'Player name to follow',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const nav = getNavigationController(bot);

      // Strip "player:" prefix if LLM included it
      let playerName = params.player as string;
      if (playerName.startsWith('player:')) {
        playerName = playerName.slice(7);
      }
      log.info(`👤 Looking for player "${playerName}"...`);

      const player = bot.players[playerName];
      if (!player?.entity) {
        throw new Error(`Cannot see player: ${playerName}`);
      }

      nav.follow(player.entity, 2);
      return `Following ${playerName}`;
    },
  },

  stop: {
    description: 'Stop current movement',
    params: {},
    async execute(bot: Bot): Promise<string> {
      const nav = getNavigationController(bot);
      nav.stop();
      return 'Stopped';
    },
  },
};
