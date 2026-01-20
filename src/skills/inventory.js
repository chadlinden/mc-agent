import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import minecraftData from 'minecraft-data';
import { createLogger } from '../utils/logger.js';

const log = createLogger('skill:inventory');

export const description = 'Inventory and chest management skills';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Check if block is a chest
 */
function isChestBlock(b, mcData) {
  if (!b) return false;
  const chestId = mcData.blocksByName.chest?.id;
  const trappedId = mcData.blocksByName.trapped_chest?.id;
  return b.type === chestId || b.type === trappedId;
}

/**
 * Find nearest chest
 */
export async function findChestNear(bot, maxDistance = 20) {
  const mcData = minecraftData(bot.version);

  // Fast path
  const found = bot.findBlock({
    matching: b => isChestBlock(b, mcData),
    maxDistance,
    count: 1,
  });

  if (found) return found;

  // Brute force fallback
  const base = bot.entity.position.floored();
  let best = null;
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
export function invCount(bot, itemName) {
  return bot.inventory.items()
    .filter(i => i.name === itemName)
    .reduce((s, i) => s + i.count, 0);
}

export const actions = {
  open_chest: {
    description: 'Open a chest',
    params: {
      position: '"nearest" or "position:x,y,z"',
    },
    async execute(bot, params) {
      let chestBlock;

      if (params.position === 'nearest' || !params.position) {
        chestBlock = await findChestNear(bot, 20);
        if (!chestBlock) throw new Error('No chest found nearby');
      } else if (params.position.startsWith('position:')) {
        const coords = params.position.slice(9).split(',').map(Number);
        const pos = new Vec3(coords[0], coords[1], coords[2]);
        chestBlock = bot.blockAt(pos);
        if (!chestBlock) throw new Error('No block at that position');
      } else {
        throw new Error('Invalid position format');
      }

      await bot.pathfinder.goto(new goals.GoalNear(
        chestBlock.position.x,
        chestBlock.position.y,
        chestBlock.position.z,
        2
      ));

      // Store chest window for later operations
      bot._openChest = await bot.openChest(chestBlock);
      log.info('Opened chest', { position: chestBlock.position });

      return `Opened chest at ${chestBlock.position.x}, ${chestBlock.position.y}, ${chestBlock.position.z}`;
    },
  },

  deposit: {
    description: 'Deposit items into open chest',
    params: {
      items: '"all" or "item:count,item:count"',
    },
    async execute(bot, params) {
      if (!bot._openChest) throw new Error('No chest is open');

      const chest = bot._openChest;
      const items = bot.inventory.items();

      if (params.items === 'all') {
        for (const it of items) {
          try {
            await chest.deposit(it.type, null, it.count);
            await sleep(80);
          } catch {}
        }
        return 'Deposited all items';
      }

      // Parse item:count format
      const toDeposit = params.items.split(',').map(s => {
        const [name, count] = s.trim().split(':');
        return { name, count: parseInt(count, 10) || 64 };
      });

      const mcData = minecraftData(bot.version);
      for (const want of toDeposit) {
        const itemDef = mcData.itemsByName[want.name];
        if (!itemDef) continue;

        try {
          await chest.deposit(itemDef.id, null, want.count);
          await sleep(80);
        } catch {}
      }

      return 'Deposited items';
    },
  },

  withdraw: {
    description: 'Withdraw items from open chest',
    params: {
      items: '"item:count,item:count"',
    },
    async execute(bot, params) {
      if (!bot._openChest) throw new Error('No chest is open');

      const chest = bot._openChest;
      const mcData = minecraftData(bot.version);

      const toWithdraw = params.items.split(',').map(s => {
        const [name, count] = s.trim().split(':');
        return { name, count: parseInt(count, 10) || 64 };
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
    async execute(bot, params) {
      const itemName = params.item;
      const item = bot.inventory.items().find(i => i.name === itemName);
      if (!item) throw new Error(`Don't have ${itemName}`);

      // Determine destination based on item type
      let dest = 'hand';
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
    async execute(bot, params) {
      if (params.items === 'all') {
        const items = bot.inventory.items();
        for (const it of items) {
          await bot.toss(it.type, null, it.count);
          await sleep(80);
        }
        return 'Dropped all items';
      }

      const toDrop = params.items.split(',').map(s => {
        const [name, count] = s.trim().split(':');
        return { name, count: parseInt(count, 10) || 64 };
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
    async execute(bot) {
      if (bot._openChest) {
        try {
          bot._openChest.close();
        } catch {}
        bot._openChest = null;
      }
      return 'Chest closed';
    },
  },
};
