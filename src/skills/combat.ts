import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { createLogger } from '../utils/logger.js';
import type { SkillModule } from '../types/index.js';

const log = createLogger('skill:combat');

export const description = 'Combat and defense skills';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'creeper', 'spider', 'cave_spider',
  'enderman', 'witch', 'slime', 'phantom', 'drowned',
  'husk', 'stray', 'pillager', 'vindicator', 'ravager',
  'zombified_piglin', 'hoglin', 'piglin_brute',
];

/**
 * Equip best weapon
 */
export async function equipWeapon(bot: Bot): Promise<boolean> {
  const weapons = ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'diamond_axe', 'iron_axe'];

  for (const weaponName of weapons) {
    const weapon = bot.inventory.items().find(i => i.name === weaponName);
    if (weapon) {
      await bot.equip(weapon, 'hand');
      return true;
    }
  }

  return false;
}

/**
 * Find nearest hostile mob
 */
export function findNearestHostile(bot: Bot, maxDistance: number = 16): Entity | null {
  return bot.nearestEntity(e => {
    if (!e) return false;
    const distance = bot.entity.position.distanceTo(e.position);
    if (distance > maxDistance) return false;

    const mobName = e.name || e.mobType || '';
    return HOSTILE_MOBS.some(h => mobName.toLowerCase().includes(h));
  });
}

export const actions: SkillModule['actions'] = {
  attack: {
    description: 'Attack a target entity',
    params: {
      target: 'Target: "player:Name", "entity:type", or "nearest_hostile"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      let target: Entity | null = null;
      const targetStr = params.target as string;

      if (targetStr === 'nearest_hostile') {
        target = findNearestHostile(bot);
        if (!target) throw new Error('No hostile mobs nearby');
      } else if (targetStr.startsWith('player:')) {
        const playerName = targetStr.slice(7);
        const player = bot.players[playerName];
        if (!player?.entity) throw new Error(`Cannot see player: ${playerName}`);
        target = player.entity;
      } else if (targetStr.startsWith('entity:')) {
        const entityType = targetStr.slice(7);
        target = bot.nearestEntity(e => {
          const name = e?.name || e?.mobType || '';
          return name.toLowerCase().includes(entityType.toLowerCase());
        });
        if (!target) throw new Error(`No ${entityType} found nearby`);
      } else {
        throw new Error('Invalid target format');
      }

      await equipWeapon(bot);

      // Move to and attack
      const attackRange = 3;
      let hits = 0;

      while (target.isValid && (target.health ?? 0) > 0 && hits < 20) {
        const distance = bot.entity.position.distanceTo(target.position);

        if (distance > attackRange) {
          await bot.pathfinder.goto(new goals.GoalNear(
            target.position.x,
            target.position.y,
            target.position.z,
            2
          ));
        }

        try {
          await bot.attack(target);
          hits++;
        } catch {
          // Ignore attack errors
        }

        await sleep(500); // Attack cooldown
      }

      return `Attacked target (${hits} hits)`;
    },
  },

  defend: {
    description: 'Attack the nearest hostile mob',
    params: {},
    async execute(bot: Bot): Promise<string> {
      const hostile = findNearestHostile(bot);
      if (!hostile) {
        return 'No hostile mobs nearby';
      }

      await equipWeapon(bot);

      const attackRange = 3;
      let hits = 0;

      while (hostile.isValid && (hostile.health ?? 0) > 0 && hits < 15) {
        const distance = bot.entity.position.distanceTo(hostile.position);

        if (distance > attackRange) {
          await bot.pathfinder.goto(new goals.GoalNear(
            hostile.position.x,
            hostile.position.y,
            hostile.position.z,
            2
          ));
        }

        try {
          await bot.attack(hostile);
          hits++;
        } catch {
          // Ignore attack errors
        }

        await sleep(500);
      }

      const mobName = hostile.name || hostile.mobType || 'mob';
      return `Defended against ${mobName} (${hits} hits)`;
    },
  },

  flee: {
    description: 'Run away from danger',
    params: {},
    async execute(bot: Bot): Promise<string> {
      const hostile = findNearestHostile(bot, 24);

      if (!hostile) {
        return 'No threats detected';
      }

      // Calculate direction away from hostile
      const myPos = bot.entity.position;
      const threatPos = hostile.position;
      const direction = myPos.minus(threatPos).normalize();

      // Move 20 blocks away
      const safePos = myPos.plus(direction.scaled(20));

      bot.pathfinder.setGoal(new goals.GoalNear(
        safePos.x,
        safePos.y,
        safePos.z,
        2
      ), true);

      await sleep(3000); // Run for a bit
      bot.pathfinder.setGoal(null);

      return 'Fled from danger';
    },
  },
};
