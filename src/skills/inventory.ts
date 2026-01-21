import type { Bot } from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Chest } from 'mineflayer';
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import minecraftData, { IndexedData } from 'minecraft-data';
import { createLogger } from '../utils/logger.js';
import { getNavigationController } from '../bot/navigation-controller.js';
import type { SkillModule } from '../types/index.js';

const log = createLogger('skill:inventory');

export const description = 'Inventory and chest management skills';

// Extended Bot type to include our custom property
interface BotWithChest extends Bot {
  _openChest?: Chest | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Check if block is a chest
 */
function isChestBlock(b: Block | null, mcData: IndexedData): boolean {
  if (!b) return false;
  const chestId = mcData.blocksByName.chest?.id;
  const trappedId = mcData.blocksByName.trapped_chest?.id;
  return b.type === chestId || b.type === trappedId;
}

/**
 * Find nearest chest
 */
export async function findChestNear(bot: Bot, maxDistance: number = 20): Promise<Block | null> {
  const mcData = minecraftData(bot.version);

  // Fast path
  const found = bot.findBlock({
    matching: (b: Block) => isChestBlock(b, mcData),
    maxDistance,
    count: 1,
  });

  if (found) return found;

  // Brute force fallback
  const base = bot.entity.position.floored();
  let best: Block | null = null;
  let bestDist = Infinity;

  for (let dx = -maxDistance; dx <= maxDistance; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -maxDistance; dz <= maxDistance; dz++) {
        const p = base.offset(dx, dy, dz);
        const b = bot.blockAt(p);
        if (!isChestBlock(b, mcData)) continue;
        const d = base.distanceTo(p);
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
    }
  }

  return best;
}

/**
 * Get item count in inventory
 */
export function invCount(bot: Bot, itemName: string): number {
  return bot.inventory.items()
    .filter(i => i.name === itemName)
    .reduce((s, i) => s + i.count, 0);
}

export const actions: SkillModule['actions'] = {
  open_chest: {
    description: 'Open a chest',
    params: {
      position: '"nearest" or "position:x,y,z"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const extBot = bot as BotWithChest;
      let chestBlock: Block | null;
      const position = params.position as string | undefined;

      if (position === 'nearest' || !position) {
        chestBlock = await findChestNear(bot, 20);
        if (!chestBlock) throw new Error('No chest found nearby');
      } else if (position.startsWith('position:')) {
        const coords = position.slice(9).split(',').map(Number);
        const pos = new Vec3(coords[0]!, coords[1]!, coords[2]!);
        chestBlock = bot.blockAt(pos);
        if (!chestBlock) throw new Error('No block at that position');
      } else {
        throw new Error('Invalid position format');
      }

      const nav = getNavigationController(bot);
      // Use gotoBlock to ensure we aren't standing in the chest we want to open
      await nav.gotoBlock(new Vec3(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z), { range: 4 });

      // Store chest window for later operations
      extBot._openChest = await bot.openChest(chestBlock);
      log.info('Opened chest', { position: chestBlock.position });

      return `Opened chest at ${chestBlock.position.x}, ${chestBlock.position.y}, ${chestBlock.position.z}`;
    },
  },

  deposit: {
    description: 'Deposit items into open chest',
    params: {
      items: '"all" or "item:count,item:count"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const extBot = bot as BotWithChest;
      if (!extBot._openChest) throw new Error('No chest is open');

      const chest = extBot._openChest;
      const items = bot.inventory.items();
      const itemsParam = params.items as string;

      if (itemsParam === 'all') {
        for (const it of items) {
          try {
            await chest.deposit(it.type, null, it.count);
            await sleep(80);
          } catch {
            // Ignore deposit errors
          }
        }
        return 'Deposited all items';
      }

      // Parse item:count format
      const toDeposit = itemsParam.split(',').map(s => {
        const parts = s.trim().split(':');
        return { name: parts[0]!, count: parseInt(parts[1] ?? '64', 10) };
      });

      const mcData = minecraftData(bot.version);
      for (const want of toDeposit) {
        const itemDef = mcData.itemsByName[want.name];
        if (!itemDef) continue;

        try {
          await chest.deposit(itemDef.id, null, want.count);
          await sleep(80);
        } catch {
          // Ignore deposit errors
        }
      }

      return 'Deposited items';
    },
  },

  withdraw: {
    description: 'Withdraw items from open chest',
    params: {
      items: '"item:count,item:count"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const extBot = bot as BotWithChest;
      if (!extBot._openChest) throw new Error('No chest is open');

      const chest = extBot._openChest;
      const mcData = minecraftData(bot.version);
      const itemsParam = params.items as string;

      const toWithdraw = itemsParam.split(',').map(s => {
        const parts = s.trim().split(':');
        return { name: parts[0]!, count: parseInt(parts[1] ?? '64', 10) };
      });

      for (const want of toWithdraw) {
        const itemDef = mcData.itemsByName[want.name];
        if (!itemDef) continue;

        let remaining = want.count;
        while (remaining > 0) {
          const take = Math.min(remaining, 64);
          try {
            await chest.withdraw(itemDef.id, null, take);
            remaining -= take;
            await sleep(80);
          } catch {
            break;
          }
        }
      }

      return 'Withdrew items';
    },
  },

  equip: {
    description: 'Equip an item (armor or hand)',
    params: {
      item: 'Item name to equip',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const itemName = params.item as string;
      const item = bot.inventory.items().find(i => i.name === itemName);
      if (!item) throw new Error(`Don't have ${itemName}`);

      // Determine destination based on item type
      let dest: 'hand' | 'head' | 'torso' | 'legs' | 'feet' = 'hand';
      if (itemName.includes('helmet')) dest = 'head';
      else if (itemName.includes('chestplate')) dest = 'torso';
      else if (itemName.includes('leggings')) dest = 'legs';
      else if (itemName.includes('boots')) dest = 'feet';

      await bot.equip(item, dest);
      return `Equipped ${itemName}`;
    },
  },

  drop: {
    description: 'Drop items from inventory',
    params: {
      items: '"all" or "item:count,item:count"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const itemsParam = params.items as string;

      if (itemsParam === 'all') {
        const items = bot.inventory.items();
        for (const it of items) {
          await bot.toss(it.type, null, it.count);
          await sleep(80);
        }
        return 'Dropped all items';
      }

      const toDrop = itemsParam.split(',').map(s => {
        const parts = s.trim().split(':');
        return { name: parts[0]!, count: parseInt(parts[1] ?? '64', 10) };
      });

      const mcData = minecraftData(bot.version);
      for (const want of toDrop) {
        const itemDef = mcData.itemsByName[want.name];
        if (!itemDef) continue;

        await bot.toss(itemDef.id, null, want.count);
        await sleep(80);
      }

      return 'Dropped items';
    },
  },

  close_chest: {
    description: 'Close the currently open chest',
    params: {},
    async execute(bot: Bot): Promise<string> {
      const extBot = bot as BotWithChest;
      if (extBot._openChest) {
        try {
          extBot._openChest.close();
        } catch {
          // Ignore close errors
        }
        extBot._openChest = null;
      }
      return 'Chest closed';
    },
  },
};
