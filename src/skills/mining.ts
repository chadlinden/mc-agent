import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import { createLogger } from '../utils/logger.js';
import { getNavigationController } from '../bot/navigation-controller.js';
import type { SkillModule } from '../types/index.js';

const log = createLogger('skill:mining');

export const description = 'Resource gathering and mining skills';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Count items matching a pattern in inventory
 */
function invCountMatching(bot: Bot, pattern: string): number {
  return bot.inventory.items()
    .filter(i => i.name.includes(pattern))
    .reduce((s, i) => s + i.count, 0);
}

/**
 * Normalize block type names (handle common aliases)
 */
function normalizeBlockType(blockType: string): string {
  const aliases: Record<string, string> = {
    'coal': 'coal_ore',
    'iron': 'iron_ore',
    'gold': 'gold_ore',
    'diamond': 'diamond_ore',
    'emerald': 'emerald_ore',
    'redstone': 'redstone_ore',
    'lapis': 'lapis_ore',
    'copper': 'copper_ore',
    'wood': 'oak_log',
    'log': 'oak_log',
    'cobble': 'cobblestone',
    'dirt': 'dirt',
    'stone': 'stone',
  };

  const lower = blockType.toLowerCase();
  return aliases[lower] || lower;
}

/**
 * Equip best tool for mining
 */
export async function equipBestTool(bot: Bot, blockName: string): Promise<boolean> {
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

export const actions: SkillModule['actions'] = {
  mine: {
    description: 'Find and mine blocks of a specific type',
    params: {
      blockType: 'Block type to mine (e.g., "stone", "iron_ore")',
      count: 'Number of blocks to mine (default 16)',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const blockType = normalizeBlockType(params.blockType as string);
      const targetCount = parseInt(params.count as string, 10) || 16;
      log.info('Mining blocks', { blockType, targetCount });

      let mined = 0;

      while (mined < targetCount) {
        const block = bot.findBlock({
          matching: (b: Block) => b && b.name === blockType,
          maxDistance: 48,
          count: 1,
        });

        if (!block) {
          log.warn('No more blocks found', { blockType, mined });
          break;
        }

        const nav = getNavigationController(bot);
        await nav.goto(new Vec3(block.position.x, block.position.y, block.position.z), { range: 2 });

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
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const targetCount = parseInt(params.count as string, 10) || 16;
      const startCount = invCountMatching(bot, '_log');

      while (invCountMatching(bot, '_log') - startCount < targetCount) {
        const block = bot.findBlock({
          matching: (b: Block) => b && b.name.endsWith('_log'),
          maxDistance: 48,
          count: 1,
        });

        if (!block) {
          log.warn('No more logs found');
          break;
        }

        const nav = getNavigationController(bot);
        await nav.goto(new Vec3(block.position.x, block.position.y, block.position.z), { range: 2 });

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
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const oreType = normalizeBlockType(params.oreType as string);
      log.info('Finding ore', { oreType });

      const block = bot.findBlock({
        matching: (b: Block) => b && b.name === oreType,
        maxDistance: 64,
        count: 1,
      });

      if (!block) {
        throw new Error(`No ${oreType} found nearby`);
      }

      const nav = getNavigationController(bot);
      await nav.goto(new Vec3(block.position.x, block.position.y, block.position.z), { range: 3 });

      return `Found ${oreType} at ${block.position.x}, ${block.position.y}, ${block.position.z}`;
    },
  },
};
