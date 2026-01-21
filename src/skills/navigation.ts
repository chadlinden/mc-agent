import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import { createLogger } from '../utils/logger.js';
import type { SkillModule } from '../types/index.js';

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
      const target = parseTarget(bot, params.target as string);
      if (!target) {
        throw new Error(`Invalid or not found target: ${params.target}`);
      }

      let goal;
      if (target.type === 'entity' && target.entity) {
        goal = new goals.GoalNear(
          target.entity.position.x,
          target.entity.position.y,
          target.entity.position.z,
          2
        );
        log.info('Going to entity', { name: target.name });
      } else if (target.position) {
        goal = new goals.GoalNear(
          target.position.x,
          target.position.y,
          target.position.z,
          1
        );
        log.info('Going to position', { position: target.position });
      } else {
        throw new Error('Invalid target');
      }

      await bot.pathfinder.goto(goal);
      return 'Arrived at destination';
    },
  },

  follow: {
    description: 'Continuously follow a player',
    params: {
      player: 'Player name to follow',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      // Strip "player:" prefix if LLM included it
      let playerName = params.player as string;
      if (playerName.startsWith('player:')) {
        playerName = playerName.slice(7);
      }

      const player = bot.players[playerName];
      if (!player?.entity) {
        throw new Error(`Cannot see player: ${playerName}`);
      }

      bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
      log.info('Following player', { player: playerName });
      return `Following ${playerName}`;
    },
  },

  stop: {
    description: 'Stop current movement',
    params: {},
    async execute(bot: Bot): Promise<string> {
      bot.pathfinder.setGoal(null);
      log.info('Stopped movement');
      return 'Stopped';
    },
  },
};
