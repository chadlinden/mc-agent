import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Vec3 } from 'vec3';
import config from '../../config/bot-config.js';
import minecraftData from 'minecraft-data';

interface NearbyEntity {
  type: string;
  name: string;
  position: Vec3;
  distance: number;
  health: number | undefined;
}

interface NearbyBlock {
  position: Vec3;
  block: string | undefined;
  distance: number;
}

interface BotStatus {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  heldItem: string;
  gameMode: string;
}

interface WorldState {
  bot: BotStatus;
  inventory: string;
  nearbyPlayers: NearbyEntity[];
  nearbyMobs: NearbyEntity[];
  timeOfDay: string;
  weather: string;
}

/**
 * Get nearby entities within radius
 */
export const getNearbyEntities = (bot: Bot, radius: number = config.bot.nearbyRadius): NearbyEntity[] => {
  const entities: NearbyEntity[] = [];
  for (const entity of Object.values(bot.entities) as Entity[]) {
    if (entity === bot.entity) continue;
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance <= radius) {
      entities.push({
        type: entity.type,
        name: entity.name || entity.username || entity.displayName || 'unknown',
        position: entity.position.clone(),
        distance: Math.round(distance),
        health: entity.health,
      });
    }
  }
  return entities.sort((a, b) => a.distance - b.distance);
};

/**
 * Get nearby players
 */
export const getNearbyPlayers = (bot: Bot, radius: number = config.bot.nearbyRadius): NearbyEntity[] => {
  return getNearbyEntities(bot, radius).filter(e => e.type === 'player');
};

/**
 * Get nearby mobs (hostile and passive)
 */
export const getNearbyMobs = (bot: Bot, radius: number = config.bot.nearbyRadius): NearbyEntity[] => {
  return getNearbyEntities(bot, radius).filter(e => e.type === 'mob');
};

/**
 * Get inventory summary
 */
export const getInventorySummary = (bot: Bot): string => {
  const items = bot.inventory.items();
  if (items.length === 0) return 'empty';

  const summary = items.map(item => `${item.name}x${item.count}`);
  return summary.join(', ');
};

/**
 * Get held item info
 */
export const getHeldItem = (bot: Bot): string => {
  const item = bot.heldItem;
  return item ? `${item.name}x${item.count}` : 'empty hand';
};

/**
 * Get time of day as human-readable string
 */
export const getTimeOfDay = (bot: Bot): string => {
  const time = bot.time.timeOfDay;
  if (time < 6000) return 'morning';
  if (time < 12000) return 'day';
  if (time < 13000) return 'sunset';
  if (time < 23000) return 'night';
  return 'sunrise';
};

/**
 * Get weather condition
 */
export const getWeather = (bot: Bot): string => {
  if (bot.thunderState > 0) return 'thunderstorm';
  if (bot.rainState > 0) return 'rain';
  return 'clear';
};

/**
 * Get nearby blocks of specific types
 */
export const findNearbyBlocks = (bot: Bot, blockNames: string[], radius: number = 32, count: number = 10): NearbyBlock[] => {
  const mcData = minecraftData(bot.version);
  const blockIds = blockNames
    .map(name => mcData.blocksByName[name]?.id)
    .filter((id): id is number => id !== undefined);

  const blocks = bot.findBlocks({
    matching: blockIds,
    maxDistance: radius,
    count: count,
  });

  return blocks.map(pos => ({
    position: pos,
    block: bot.blockAt(pos)?.name,
    distance: Math.round(bot.entity.position.distanceTo(pos)),
  }));
};

/**
 * Get bot's current status
 */
export const getBotStatus = (bot: Bot): BotStatus => ({
  position: {
    x: Math.round(bot.entity.position.x),
    y: Math.round(bot.entity.position.y),
    z: Math.round(bot.entity.position.z),
  },
  health: Math.round(bot.health),
  food: Math.round(bot.food),
  heldItem: getHeldItem(bot),
  gameMode: bot.game.gameMode,
});

/**
 * Build complete world state for AI context
 */
export const buildWorldState = (bot: Bot): WorldState => ({
  bot: getBotStatus(bot),
  inventory: getInventorySummary(bot),
  nearbyPlayers: getNearbyPlayers(bot, 48),
  nearbyMobs: getNearbyMobs(bot, 24),
  timeOfDay: getTimeOfDay(bot),
  weather: getWeather(bot),
});
