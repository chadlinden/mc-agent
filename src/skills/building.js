import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import { createLogger } from '../utils/logger.js';

const log = createLogger('skill:building');

export const description = 'Construction and block placement skills';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wrap an async operation with a timeout
 */
function withTimeout(promise, ms, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

/**
 * Find solid ground below a position
 */
export async function findGround(bot, pos, maxDrop = 12) {
  let p = pos.floored();
  for (let i = 0; i < maxDrop; i++) {
    const below = bot.blockAt(p.offset(0, -1, 0));
    if (below && below.name !== 'air') return p;
    p = p.offset(0, -1, 0);
  }
  return pos.floored();
}

/**
 * Equip an item by name
 */
export async function equipItem(bot, name) {
  const item = bot.inventory.items().find(i => i.name === name);
  if (!item) return false;
  await bot.equip(item, 'hand');
  return true;
}

/**
 * Dig a block if it exists
 */
async function digIfNeeded(bot, pos) {
  const b = bot.blockAt(pos);
  if (b && b.name !== 'air') {
    await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
    await bot.dig(b);
  }
}

/**
 * Place a block at position with timeout protection
 */
async function placeAt(bot, targetPos, timeoutMs = 8000) {
  const cur = bot.blockAt(targetPos);
  if (cur && cur.name !== 'air') return true;

  const offsets = [
    new Vec3(0, -1, 0),
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
    new Vec3(0, 1, 0),
  ];

  for (const off of offsets) {
    const refPos = targetPos.plus(off);
    const refBlock = bot.blockAt(refPos);
    if (refBlock && refBlock.name !== 'air') {
      try {
        await withTimeout(
          bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2)),
          timeoutMs,
          `Pathfinding to ${targetPos} timed out`
        );
      } catch (err) {
        log.warn('Pathfinding failed, trying to place anyway', { error: err.message });
      }

      try {
        await withTimeout(
          bot.placeBlock(refBlock, off.scaled(-1)),
          timeoutMs,
          `Placing block at ${targetPos} timed out`
        );
        return true;
      } catch (err) {
        log.warn('Block placement failed', { pos: targetPos, error: err.message });
        // Continue trying other reference blocks
      }
    }
  }
  return false;
}

/**
 * Generate hut blueprint
 */
export function hutPlan(origin) {
  const blocks = [];
  const w = 7;
  const wallH = 3;
  const x0 = origin.x, y0 = origin.y, z0 = origin.z;

  // Floor
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, y0, z0 + dz), type: 'oak_planks' });
    }
  }

  // Walls
  for (let dy = 1; dy <= wallH; dy++) {
    for (let i = 0; i < w; i++) {
      blocks.push({ pos: new Vec3(x0 + i, y0 + dy, z0), type: 'oak_planks' });
      blocks.push({ pos: new Vec3(x0 + i, y0 + dy, z0 + (w - 1)), type: 'oak_planks' });
      blocks.push({ pos: new Vec3(x0, y0 + dy, z0 + i), type: 'oak_planks' });
      blocks.push({ pos: new Vec3(x0 + (w - 1), y0 + dy, z0 + i), type: 'oak_planks' });
    }
  }

  // Door opening
  const doorX = x0 + Math.floor(w / 2);
  blocks.push({ pos: new Vec3(doorX, y0 + 1, z0), type: 'air' });
  blocks.push({ pos: new Vec3(doorX, y0 + 2, z0), type: 'air' });

  // Roof
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, y0 + wallH + 1, z0 + dz), type: 'oak_planks' });
    }
  }

  // Interior torch
  blocks.push({ pos: new Vec3(x0 + 2, y0 + 2, z0 + 2), type: 'torch' });

  return blocks;
}

/**
 * Build from a block plan
 */
async function buildFromPlan(bot, plan, originY) {
  const floor = plan.filter(p => p.pos.y === originY && p.type !== 'air');
  const walls = plan.filter(p => p.pos.y > originY && p.pos.y <= originY + 3);
  const roof = plan.filter(p => p.pos.y === originY + 4);
  const rest = plan.filter(p => !floor.includes(p) && !walls.includes(p) && !roof.includes(p));
  const stages = [floor, walls, roof, rest];

  let placed = 0;
  let failed = 0;

  for (const stage of stages) {
    for (const step of stage) {
      if (step.type === 'air') {
        try {
          await digIfNeeded(bot, step.pos);
        } catch (err) {
          log.warn('Failed to dig block', { pos: step.pos, error: err.message });
        }
        continue;
      }

      const itemName = step.type === 'torch' ? 'torch' : step.type;
      const ok = await equipItem(bot, itemName);
      if (!ok) {
        if (step.type === 'torch') continue;
        log.warn('Missing material, skipping', { item: itemName });
        failed++;
        continue;
      }

      const cur = bot.blockAt(step.pos);
      if (cur && cur.name === step.type) {
        placed++;
        continue;
      }

      if (cur && cur.name !== 'air' && cur.name !== step.type) {
        try {
          await digIfNeeded(bot, step.pos);
        } catch (err) {
          log.warn('Failed to clear block', { pos: step.pos, error: err.message });
        }
      }

      let success = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          success = await placeAt(bot, step.pos);
          if (success) break;
        } catch (err) {
          log.warn('Place attempt failed', { pos: step.pos, attempt, error: err.message });
          await sleep(200);
        }
      }

      if (success) {
        placed++;
      } else {
        failed++;
        log.warn('Could not place block after retries', { pos: step.pos, type: step.type });
      }

      await sleep(80);
    }
  }

  log.info('Build complete', { placed, failed });
  return { placed, failed };
}

export const actions = {
  build_hut: {
    description: 'Build a 7x7 wooden hut',
    params: {
      location: '"here" or "position:x,y,z"',
    },
    async execute(bot, params) {
      let origin;
      if (params.location === 'here' || !params.location) {
        const pos = bot.entity.position.offset(5, 0, 0);
        origin = await findGround(bot, pos);
      } else if (params.location.startsWith('position:')) {
        const coords = params.location.slice(9).split(',').map(Number);
        origin = await findGround(bot, new Vec3(coords[0], coords[1], coords[2]));
      } else {
        throw new Error('Invalid location format');
      }

      const o = new Vec3(Math.floor(origin.x), origin.y, Math.floor(origin.z));
      log.info('Building hut at', { position: o });

      const plan = hutPlan(o);
      const result = await buildFromPlan(bot, plan, o.y);

      if (result.failed > 0) {
        return `Hut partially built at ${o.x}, ${o.y}, ${o.z} (${result.placed} placed, ${result.failed} failed)`;
      }
      return `Hut built at ${o.x}, ${o.y}, ${o.z} (${result.placed} blocks placed)`;
    },
  },

  place_block: {
    description: 'Place a specific block at a position',
    params: {
      position: '"position:x,y,z"',
      blockType: 'Block type name (e.g., "oak_planks")',
    },
    async execute(bot, params) {
      if (!params.position?.startsWith('position:')) {
        throw new Error('Position must be in format "position:x,y,z"');
      }

      const coords = params.position.slice(9).split(',').map(Number);
      const pos = new Vec3(coords[0], coords[1], coords[2]);

      const ok = await equipItem(bot, params.blockType);
      if (!ok) throw new Error(`Don't have ${params.blockType}`);

      await placeAt(bot, pos);
      return `Placed ${params.blockType} at ${pos.x}, ${pos.y}, ${pos.z}`;
    },
  },

  break_block: {
    description: 'Break a block at a position',
    params: {
      position: '"position:x,y,z"',
    },
    async execute(bot, params) {
      if (!params.position?.startsWith('position:')) {
        throw new Error('Position must be in format "position:x,y,z"');
      }

      const coords = params.position.slice(9).split(',').map(Number);
      const pos = new Vec3(coords[0], coords[1], coords[2]);

      await digIfNeeded(bot, pos);
      return `Broke block at ${pos.x}, ${pos.y}, ${pos.z}`;
    },
  },
};
