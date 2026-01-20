import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { createLogger } from '../utils/logger.js';

const log = createLogger('skill:mining');

export const description = 'Resource gathering and mining skills';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Count items matching a pattern in inventory
 */
function invCountMatching(bot, pattern) {
  return bot.inventory.items()
    .filter(i => i.name.includes(pattern))
    .reduce((s, i) => s + i.count, 0);
}

/**
 * Equip best tool for mining
 */
export async function equipBestTool(bot, blockName) {
  const pickaxes = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'];
  const axes = ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'];
  const shovels = ['diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel'];

  let toolList = pickaxes; // default

  if (blockName.includes('log') || blockName.includes('plank') || blockName.includes('wood')) {
    toolList = axes;
  } else if (blockName.includes('dirt') || blockName.includes('sand') || blockName.includes('gravel')) {
    toolList = shovels;
  }

  for (const toolName of toolList) {
    const tool = bot.inventory.items().find(i => i.name === toolName);
    if (tool) {
      await bot.equip(tool, 'hand');
      return true;
    }
  }

  return false;
}

export const actions = {
  mine: {
    description: 'Find and mine blocks of a specific type',
    params: {
      blockType: 'Block type to mine (e.g., "stone", "iron_ore")',
      count: 'Number of blocks to mine (default 16)',
    },
    async execute(bot, params) {
      const blockType = params.blockType;
      const targetCount = parseInt(params.count, 10) || 16;

      let mined = 0;

      while (mined < targetCount) {
        const block = bot.findBlock({
          matching: b => b && b.name === blockType,
          maxDistance: 48,
          count: 1,
        });

        if (!block) {
          log.warn('No more blocks found', { blockType, mined });
          break;
        }

        await bot.pathfinder.goto(new goals.GoalNear(
          block.position.x,
          block.position.y,
          block.position.z,
          2
        ));

        await equipBestTool(bot, blockType);

        const targetBlock = bot.blockAt(block.position);
        if (targetBlock && targetBlock.name !== 'air') {
          await bot.dig(targetBlock);
          mined++;
        }

        await sleep(100);
      }

      return `Mined ${mined} ${blockType}`;
    },
  },

  gather_wood: {
    description: 'Gather wood logs from nearby trees',
    params: {
      count: 'Number of logs to gather (default 16)',
    },
    async execute(bot, params) {
      const targetCount = parseInt(params.count, 10) || 16;
      const startCount = invCountMatching(bot, '_log');

      while (invCountMatching(bot, '_log') - startCount < targetCount) {
        const block = bot.findBlock({
          matching: b => b && b.name.endsWith('_log'),
          maxDistance: 48,
          count: 1,
        });

        if (!block) {
          log.warn('No more logs found');
          break;
        }

        await bot.pathfinder.goto(new goals.GoalNear(
          block.position.x,
          block.position.y,
          block.position.z,
          2
        ));

        await equipBestTool(bot, '_log');

        const targetBlock = bot.blockAt(block.position);
        if (targetBlock && targetBlock.name !== 'air') {
          await bot.dig(targetBlock);
        }

        await sleep(100);
      }

      const gathered = invCountMatching(bot, '_log') - startCount;
      return `Gathered ${gathered} logs`;
    },
  },

  find_ore: {
    description: 'Find and go to nearest ore of a type',
    params: {
      oreType: 'Ore type (e.g., "iron_ore", "diamond_ore", "coal_ore")',
    },
    async execute(bot, params) {
      const oreType = params.oreType;

      const block = bot.findBlock({
        matching: b => b && b.name === oreType,
        maxDistance: 64,
        count: 1,
      });

      if (!block) {
        throw new Error(`No ${oreType} found nearby`);
      }

      await bot.pathfinder.goto(new goals.GoalNear(
        block.position.x,
        block.position.y,
        block.position.z,
        3
      ));

      return `Found ${oreType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`;
    },
  },
};
