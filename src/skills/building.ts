import type { Bot } from 'mineflayer';
import type { Vec3 as Vec3Type } from 'vec3';
import vec3Pkg from 'vec3';
const { Vec3 } = vec3Pkg;
import { createLogger } from '../utils/logger.js';
import { getNavigationController } from '../bot/navigation-controller.js';
import type { SkillModule } from '../types/index.js';
import { basename } from 'path';

const log = createLogger('skill:building');

export const description = 'Construction and block placement skills';

interface BlockPlan {
  pos: Vec3Type;
  type: string;
}

interface BuildResult {
  placed: number;
  failed: number;
}

const BUILD_PLAN_TYPES = {
  BASE: 'base',
  AIR: 'air',
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Wrap an async operation with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

/**
 * Find solid ground below a position
 */
export async function findGround(bot: Bot, pos: Vec3Type, maxDrop: number = 12): Promise<Vec3Type> {
  let p = pos.floored();
  for (let i = 0; i < maxDrop; i++) {
    const below = bot.blockAt(p.offset(0, -1, 0));
    if (below && below.name !== BUILD_PLAN_TYPES.AIR) return p;
    p = p.offset(0, -1, 0);
  }
  return pos.floored();
}

/**
 * Equip an item by name
 */
export async function equipItem(bot: Bot, name: string): Promise<boolean> {
  const item = bot.inventory.items().find(i => i.name === name);
  if (!item) return false;
  await bot.equip(item, 'hand');
  return true;
}

/**
 * Dig a block if it exists
 */
async function digIfNeeded(bot: Bot, pos: Vec3Type): Promise<void> {
  const b = bot.blockAt(pos);
  if (b && b.name !== BUILD_PLAN_TYPES.AIR) {
    const nav = getNavigationController(bot);
    // Use gotoBlock to ensure we aren't standing in the block we want to dig
    await nav.gotoBlock(new Vec3(pos.x, pos.y, pos.z), { range: 4 });
    await bot.dig(b);
  }
}

/**
 * Place a block at position with timeout protection
 * Verifies placement by checking block state, handling cases where blockUpdate event doesn't fire
 */
async function placeAt(bot: Bot, targetPos: Vec3Type, expectedBlockType?: string, timeoutMs: number = 8000): Promise<boolean> {
  const cur = bot.blockAt(targetPos);
  // If block already exists and matches expected type (or any non-air if no type specified), consider success
  if (cur && cur.name !== BUILD_PLAN_TYPES.AIR) {
    if (!expectedBlockType || cur.name === expectedBlockType) {
      return true;
    }
  }

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
    if (refBlock && refBlock.name !== BUILD_PLAN_TYPES.AIR) {
      try {
        const nav = getNavigationController(bot);
        // Use gotoBlock instead of goto to ensure we aren't standing in the way
        await withTimeout(
          nav.gotoBlock(new Vec3(targetPos.x, targetPos.y, targetPos.z), { range: 4 }),
          timeoutMs,
          `Pathfinding to ${targetPos} timed out`
        );
      } catch (err) {
        const error = err as Error;
        log.warn('Pathfinding failed, trying to place anyway', { error: error.message });
      }

      // Attempt placement
      let placementAttempted = false;
      try {
        await withTimeout(
          bot.placeBlock(refBlock, off.scaled(-1)),
          timeoutMs,
          `Placing block at ${targetPos} timed out`
        );
        placementAttempted = true;
      } catch (err) {
        const error = err as Error;
        placementAttempted = true;
        // Event may have timed out, but block might still be placed (common in creative mode)
        log.debug('PlaceBlock event timed out, verifying placement', { pos: targetPos, error: error.message });
      }

      // Verify placement by checking block state after a short delay
      // This handles cases where blockUpdate event doesn't fire (e.g., creative mode)
      if (placementAttempted) {
        await sleep(100); // Give server time to update block state

        const placedBlock = bot.blockAt(targetPos);
        if (placedBlock && placedBlock.name !== BUILD_PLAN_TYPES.AIR) {
          // Block was placed successfully
          if (!expectedBlockType || placedBlock.name === expectedBlockType) {
            return true;
          }
          // Block exists but wrong type - might need to break and retry
          log.debug('Block placed but wrong type', {
            pos: targetPos,
            expected: expectedBlockType,
            actual: placedBlock.name
          });
        }
      }
    }
  }
  return false;
}

/**
 * Generate hut blueprint
 */
export function hutPlan(origin: Vec3Type): BlockPlan[] {
  const blocks: BlockPlan[] = [];
  const w = 7;
  const wallH = 3;
  const x0 = origin.x, y0 = origin.y, z0 = origin.z;

  // Base
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < w; dz++) {
      blocks.push({ pos: new Vec3(x0 + dx, y0 - 1, z0 + dz), type: BUILD_PLAN_TYPES.BASE });
    }
  }

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
  blocks.push({ pos: new Vec3(doorX, y0 + 1, z0), type: BUILD_PLAN_TYPES.AIR });
  blocks.push({ pos: new Vec3(doorX, y0 + 2, z0), type: BUILD_PLAN_TYPES.AIR });

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
 * Check if a position is on the edge of the roof (adjacent to a wall)
 */
function isEdgeBlock(pos: Vec3Type, roofY: number, plan: BlockPlan[]): boolean {
  // A block is an edge if it's directly above a wall block
  const wallPositions = plan
    .filter(p => p.pos.y === roofY - 1 && p.type !== BUILD_PLAN_TYPES.AIR)
    .map(p => `${p.pos.x},${p.pos.z}`);

  return wallPositions.includes(`${pos.x},${pos.z}`);
}

/**
 * Build from a block plan
 * Sorts blocks to ensure proper support order (bottom to top, edges first)
 */
async function buildFromPlan(bot: Bot, plan: BlockPlan[], originY: number): Promise<BuildResult> {
  const base = plan.filter(p => p.pos.y === originY - 1 && p.type === BUILD_PLAN_TYPES.BASE);
  const floor = plan.filter(p => p.pos.y === originY && p.type !== BUILD_PLAN_TYPES.AIR);
  const walls = plan.filter(p => p.pos.y > originY && p.pos.y <= originY + 3 && p.type !== BUILD_PLAN_TYPES.AIR);
  const roof = plan.filter(p => p.pos.y === originY + 4 && p.type !== BUILD_PLAN_TYPES.AIR);
  const airBlocks = plan.filter(p => p.type === BUILD_PLAN_TYPES.AIR);
  const rest = plan.filter(p => !floor.includes(p) && !walls.includes(p) && !roof.includes(p) && p.type !== BUILD_PLAN_TYPES.AIR);

  base.sort((a, b) => {
    const aIsEdge = isEdgeBlock(a.pos, originY + 4, plan);
    const bIsEdge = isEdgeBlock(b.pos, originY + 4, plan);
    if (aIsEdge && !bIsEdge) return -1;
    if (!aIsEdge && bIsEdge) return 1;
    return 0;
  });

  // Sort walls by Y (bottom to top) to ensure lower blocks support upper ones
  walls.sort((a, b) => a.pos.y - b.pos.y);

  // Sort roof to start from edges (which have wall support) and spiral inward
  roof.sort((a, b) => {
    const aIsEdge = isEdgeBlock(a.pos, originY + 4, plan);
    const bIsEdge = isEdgeBlock(b.pos, originY + 4, plan);
    if (aIsEdge && !bIsEdge) return -1;
    if (!aIsEdge && bIsEdge) return 1;
    return 0;
  });

  // Process air blocks (door) first, then build floor, walls, roof
  const stages = [airBlocks, floor, walls, roof, rest];

  let placed = 0;
  let failed = 0;

  for (const stage of stages) {
    for (const step of stage) {
      if (step.type === BUILD_PLAN_TYPES.BASE) {

      }

      if (step.type === BUILD_PLAN_TYPES.AIR) {
        try {
          await digIfNeeded(bot, step.pos);
        } catch (err) {
          const error = err as Error;
          log.warn('Failed to dig block', { pos: step.pos, error: error.message });
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

      if (cur && cur.name !== BUILD_PLAN_TYPES.AIR && cur.name !== step.type) {
        try {
          await digIfNeeded(bot, step.pos);
        } catch (err) {
          const error = err as Error;
          log.warn('Failed to clear block', { pos: step.pos, error: error.message });
        }
      }

      let success = false;
      // Increased retries to handle creative mode and event timing issues
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          success = await placeAt(bot, step.pos, step.type);
          if (success) break;
        } catch (err) {
          const error = err as Error;
          log.warn('Place attempt failed', { pos: step.pos, attempt, error: error.message });
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

export const actions: SkillModule['actions'] = {
  build_hut: {
    description: 'Build a 7x7 wooden hut',
    params: {
      location: '"here" or "position:x,y,z"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      let origin: Vec3Type;
      const location = params.location as string | undefined;

      if (location === 'here' || !location) {
        const pos = bot.entity.position.offset(5, 0, 0);
        origin = await findGround(bot, pos);
      } else if (location.startsWith('position:')) {
        const coords = location.slice(9).split(',').map(Number);
        origin = await findGround(bot, new Vec3(coords[0]!, coords[1]!, coords[2]!));
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
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const position = params.position as string | undefined;
      const blockType = params.blockType as string;

      if (!position?.startsWith('position:')) {
        throw new Error('Position must be in format "position:x,y,z"');
      }

      const coords = position.slice(9).split(',').map(Number);
      const pos = new Vec3(coords[0]!, coords[1]!, coords[2]!);

      const ok = await equipItem(bot, blockType);
      if (!ok) throw new Error(`Don't have ${blockType}`);

      const success = await placeAt(bot, pos, blockType);
      if (!success) {
        throw new Error(`Failed to place ${blockType} at ${pos.x}, ${pos.y}, ${pos.z}`);
      }
      return `Placed ${blockType} at ${pos.x}, ${pos.y}, ${pos.z}`;
    },
  },

  break_block: {
    description: 'Break a block at a position',
    params: {
      position: '"position:x,y,z"',
    },
    async execute(bot: Bot, params: Record<string, unknown>): Promise<string> {
      const position = params.position as string | undefined;

      if (!position?.startsWith('position:')) {
        throw new Error('Position must be in format "position:x,y,z"');
      }

      const coords = position.slice(9).split(',').map(Number);
      const pos = new Vec3(coords[0]!, coords[1]!, coords[2]!);

      await digIfNeeded(bot, pos);
      return `Broke block at ${pos.x}, ${pos.y}, ${pos.z}`;
    },
  },
};
