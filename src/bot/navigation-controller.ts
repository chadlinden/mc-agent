import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import type { Block } from 'prismarine-block';
import type { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';

import { LEAVES } from '../types/materials.js';

const { goals, Movements } = pathfinderPkg;

// Goal type from pathfinder
type Goal = InstanceType<typeof goals.Goal>;
import minecraftData from 'minecraft-data';
import { createLogger } from '../utils/logger.js';

const log = createLogger('navigation');

/**
 * Block action result
 * - 'break': Break the block (optionally with a specific tool)
 * - 'avoid': Path around this block
 * - 'allow': Pass through (for passable blocks like doors)
 */
export type BlockAction = 'break' | 'avoid' | 'allow';

/**
 * Extended block action with tool preference
 */
export interface BlockActionWithTool {
  action: BlockAction;
  /** Tool to equip before breaking (e.g., 'diamond_axe', 'iron_pickaxe') */
  tool?: string;
  /** Tool type pattern to match (e.g., '_axe', '_pickaxe', '_shovel') */
  toolType?: string;
  /** Tools to avoid using (e.g., ['diamond_sword', 'iron_sword']) */
  avoidTools?: string[];
}

export type BlockHandlerResult = BlockAction | BlockActionWithTool;
export type BlockHandler = (block: Block, bot: Bot) => BlockHandlerResult | Promise<BlockHandlerResult>;

/**
 * Navigation options for customizing pathfinding behavior
 */
export interface NavigationOptions {
  /** Range to stop from target (default: 1 for positions, 2 for entities) */
  range?: number;
  /** Whether to allow breaking blocks (default: false) */
  canBreak?: boolean;
  /** Whether to allow placing blocks for bridging (default: false) */
  canPlace?: boolean;
  /** Timeout in ms (default: 60000) */
  timeout?: number;
  /** Sprint when possible (default: true) */
  sprint?: boolean;
}

/**
 * Centralized navigation controller for all bot movement
 * Provides a single point to customize pathfinding behavior
 */
export class NavigationController {
  private bot: Bot;
  private blockHandlers: Map<string, BlockHandler> = new Map();
  private defaultHandler: BlockHandler | null = null;
  private movements: InstanceType<typeof Movements> | null = null;
  private currentGoal: Goal | null = null;
  private isNavigating: boolean = false;
  private digHandlerBound: boolean = false;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /**
   * Equip a tool matching the given criteria
   * @returns true if a matching tool was equipped
   */
  private async equipToolFor(block: Block): Promise<boolean> {
    const handler = this.blockHandlers.get(block.name) || this.defaultHandler;
    if (!handler) return false;

    try {
      const result = await handler(block, this.bot);
      const config = typeof result === 'string' ? { action: result } : result;

      if (config.action !== 'break') return false;

      const items = this.bot.inventory.items();

      // If specific tool is requested
      if (config.tool) {
        const tool = items.find(i => i.name === config.tool);
        if (tool) {
          await this.bot.equip(tool, 'hand');
          log.debug(`🔧 Equipped ${tool.name} for ${block.name}`);
          return true;
        }
      }

      // If tool type pattern is requested (e.g., '_axe')
      if (config.toolType) {
        // Prefer higher-tier tools
        const tiers = ['netherite', 'diamond', 'iron', 'stone', 'wooden', 'golden'];
        for (const tier of tiers) {
          const tool = items.find(i => i.name === `${tier}${config.toolType}`);
          if (tool) {
            await this.bot.equip(tool, 'hand');
            log.debug(`🔧 Equipped ${tool.name} for ${block.name}`);
            return true;
          }
        }
      }

      // If we should avoid certain tools (e.g., don't use swords)
      if (config.avoidTools && config.avoidTools.length > 0) {
        const currentItem = this.bot.heldItem;
        const isHoldingBadTool = currentItem && config.avoidTools.some(bad =>
          currentItem.name.includes(bad)
        );

        if (isHoldingBadTool) {
          // Find any tool that's not in the avoid list
          const safeTool = items.find(i => {
            const isTool = i.name.includes('_axe') || i.name.includes('_pickaxe') ||
                          i.name.includes('_shovel') || i.name.includes('_hoe') ||
                          i.name === 'shears';
            return isTool && !config.avoidTools!.some(bad => i.name.includes(bad));
          });

          if (safeTool) {
            await this.bot.equip(safeTool, 'hand');
            log.debug(`🔧 Switched from ${currentItem?.name} to ${safeTool.name} for ${block.name}`);
            return true;
          } else {
            // No good tool, just unequip to use fist
            await this.bot.unequip('hand');
            log.debug(`🔧 Unequipped to avoid using ${currentItem?.name} on ${block.name}`);
            return true;
          }
        }
      }
    } catch (err) {
      const error = err as Error;
      log.warn(`Failed to equip tool for ${block.name}: ${error.message}`);
    }

    return false;
  }

  /**
   * Setup the dig interceptor for tool selection
   * Wraps bot.dig to equip the right tool before digging
   */
  private setupDigHandler(): void {
    if (this.digHandlerBound) return;

    const originalDig = this.bot.dig.bind(this.bot);

    // Override dig to equip tool first
    this.bot.dig = async (block: Block, forceLook?: boolean | 'ignore', digFace?: 'auto' | Vec3 | 'raycast') => {
      await this.equipToolFor(block);
      // @ts-expect-error - overload signature complexity
      return originalDig(block, forceLook, digFace);
    };

    this.digHandlerBound = true;
    log.debug('📋 Dig interceptor registered for tool selection');
  }

  /**
   * Initialize the navigation controller (call after bot spawn)
   */
  initialize(): void {
    const mcData = minecraftData(this.bot.version);
    // @ts-expect-error - Movements constructor accepts mcData as second arg at runtime
    this.movements = new Movements(this.bot, mcData);
    this.applyBlockRules();
    this.bot.pathfinder.setMovements(this.movements);
    this.setupDigHandler();
    log.info('🧭 Navigation controller initialized');
  }

  /**
   * Register a handler for a specific block type
   * @param blockName - The block name (e.g., 'oak_door', 'cobweb', 'water')
   * @param handler - Function that returns how to handle this block
   */
  onBlock(blockName: string, handler: BlockHandler): this {
    if (blockName.includes('*')) {
      switch (true) {
        case blockName.includes('leaves'):
          for (const m in LEAVES) {
            const keyName = `${LEAVES[m]}_leaves`;
            log.info(`setting wildcard handler for ${keyName}`);
            this.blockHandlers.set(keyName, handler);
          }
          break;
        default:
          break;
      }
    } else {
      this.blockHandlers.set(blockName, handler);
      log.info(`📋 Registered block handler for "${blockName}"`);
    }
    this.applyBlockRules();

    return this;
  }

  /**
   * Register a default handler for blocks without specific handlers
   */
  onAnyBlock(handler: BlockHandler): this {
    this.defaultHandler = handler;
    log.info('📋 Registered default block handler');
    return this;
  }

  /**
   * Remove a block handler
   */
  removeBlockHandler(blockName: string): this {
    this.blockHandlers.delete(blockName);
    this.applyBlockRules();
    return this;
  }

  /**
   * Apply block rules to movements configuration
   */
  private applyBlockRules(): void {
    if (!this.movements) return;

    const mcData = minecraftData(this.bot.version);

    // Configure common block behaviors based on handlers
    for (const [blockName, handler] of this.blockHandlers) {
      const blockData = mcData.blocksByName[blockName];
      if (!blockData) continue;

      // For synchronous simple rules, we can set them on movements
      // Complex async handlers are checked during navigation
      try {
        const dummyBlock = { name: blockName } as Block;
        const result = handler(dummyBlock, this.bot);
        if (result instanceof Promise) continue; // Skip async handlers here

        // Normalize result to get the action
        const action = typeof result === 'string' ? result : result.action;

        if (action === 'avoid') {
          this.movements.blocksCantBreak.add(blockData.id);
          log.debug(`🚫 Set "${blockName}" as non-breakable (avoid)`);
        } else if (action === 'break') {
          this.movements.blocksCantBreak.delete(blockData.id);
          log.debug(`⛏️ Set "${blockName}" as breakable`);
        }
      } catch {
        // Handler threw, skip
      }
    }
  }

  /**
   * Configure movement settings
   */
  configure(options: {
    canDig?: boolean;
    canPlace?: boolean;
    allowSprinting?: boolean;
    allowParkour?: boolean;
    maxDropDown?: number;
  }): this {
    if (!this.movements) {
      log.warn('⚠️ Navigation not initialized, call initialize() first');
      return this;
    }

    if (options.canDig !== undefined) {
      this.movements.canDig = options.canDig;
      log.info(`⚙️ canDig = ${options.canDig}`);
    }
    if (options.canPlace !== undefined) {
      // @ts-expect-error - canPlace exists at runtime
      this.movements.canPlace = options.canPlace;
      log.info(`⚙️ canPlace = ${options.canPlace}`);
    }
    if (options.allowSprinting !== undefined) {
      this.movements.allowSprinting = options.allowSprinting;
      log.info(`⚙️ allowSprinting = ${options.allowSprinting}`);
    }
    if (options.allowParkour !== undefined) {
      this.movements.allowParkour = options.allowParkour;
      log.info(`⚙️ allowParkour = ${options.allowParkour}`);
    }
    if (options.maxDropDown !== undefined) {
      this.movements.maxDropDown = options.maxDropDown;
      log.info(`⚙️ maxDropDown = ${options.maxDropDown}`);
    }

    this.bot.pathfinder.setMovements(this.movements);
    return this;
  }

  /**
   * Navigate to a position
   */
  async goto(position: Vec3, options: NavigationOptions = {}): Promise<string> {
    const range = options.range ?? 1;
    log.info(`🚶 Navigating to position (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}) range=${range}`);

    const goal = new goals.GoalNear(position.x, position.y, position.z, range);
    return this.executeNavigation(goal, options);
  }

  /**
   * Navigate to a block for interaction (ensures bot is not inside the block)
   */
  async gotoBlock(pos: Vec3, options: NavigationOptions = {}): Promise<string> {
    const range = options.range ?? 3;
    log.info(`🚶 Navigating to block at (${pos.x}, ${pos.y}, ${pos.z}) for interaction`);

    // GoalLookAtBlock ensures the bot can see the block and is not inside it
    const goal = new goals.GoalLookAtBlock(pos, this.bot.world, {
      reach: range,
      entityHeight: 1.6
    });
    return this.executeNavigation(goal, options);
  }

  /**
   * Navigate to an entity
   * Uses GoalFollow to track entity position dynamically, including y coordinate
   */
  async gotoEntity(entity: Entity, options: NavigationOptions = {}): Promise<string> {
    const range = options.range ?? 2;
    const name = entity.name || entity.username || 'entity';
    const pos = entity.position;
    log.info(`🚶 Navigating to ${name} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) range=${range}`);

    // Use GoalFollow instead of GoalNear to properly track entity's y coordinate
    // GoalFollow dynamically updates as the entity moves, preventing issues where
    // the bot thinks it's arrived when it's actually beneath the target
    const goal = new goals.GoalFollow(entity, range);
    return this.executeNavigation(goal, options);
  }

  /**
   * Follow an entity continuously
   */
  follow(entity: Entity, range: number = 2): void {
    const name = entity.name || entity.username || 'entity';
    log.info(`👣 Following ${name} at range ${range}`);

    this.currentGoal = new goals.GoalFollow(entity, range);
    this.bot.pathfinder.setGoal(this.currentGoal, true); // dynamic = true
    this.isNavigating = true;
  }

  /**
   * Stop all navigation
   */
  stop(): void {
    log.info('🛑 Stopping navigation');
    this.bot.pathfinder.setGoal(null);
    this.currentGoal = null;
    this.isNavigating = false;
  }

  /**
   * Check if currently navigating
   */
  get isMoving(): boolean {
    return this.isNavigating;
  }

  /**
   * Get the current goal
   */
  get goal(): Goal | null {
    return this.currentGoal;
  }

  /**
   * Execute navigation with timeout and error handling
   */
  private async executeNavigation(goal: Goal, options: NavigationOptions): Promise<string> {
    const timeout = options.timeout ?? 60000;

    // Apply temporary movement settings
    if (this.movements) {
      if (options.canBreak !== undefined) {
        this.movements.canDig = options.canBreak;
      }
      if (options.sprint !== undefined) {
        this.movements.allowSprinting = options.sprint;
      }
      this.bot.pathfinder.setMovements(this.movements);
    }

    this.currentGoal = goal;
    this.isNavigating = true;

    // Check if we're already at the goal to avoid log spam for micro-movements
    // Construct a minimal Move-like object for the isEnd check
    const currentPos = this.bot.entity.position;
    // @ts-expect-error - isEnd is part of the Pathfinder Goal interface
    if (goal.isEnd({ x: currentPos.x, y: currentPos.y, z: currentPos.z })) {
      this.isNavigating = false;
      this.currentGoal = null;
      log.debug('Already at destination, skipping pathfinding');
      return 'Already at destination';
    }

    log.debug('📍 Starting pathfinding...');

    try {
      await Promise.race([
        this.bot.pathfinder.goto(goal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Navigation timeout')), timeout)
        ),
      ]);

      log.debug('🏁 Arrived at destination!');
      return 'Arrived at destination';
    } catch (err) {
      const error = err as Error;
      if (error.message === 'Navigation timeout') {
        log.warn('⏱️ Navigation timed out');
        this.stop();
        throw new Error('Navigation timed out');
      }
      log.error(`❌ Navigation failed: ${error.message}`);
      throw err;
    } finally {
      this.isNavigating = false;
      this.currentGoal = null;
    }
  }
}

// Singleton instance holder
let navigationController: NavigationController | null = null;

/**
 * Get or create the navigation controller for a bot
 */
export function getNavigationController(bot: Bot): NavigationController {
  if (!navigationController || (navigationController as unknown as { bot: Bot }).bot !== bot) {
    navigationController = new NavigationController(bot);
  }
  return navigationController;
}

/**
 * Initialize navigation for a bot (call after spawn)
 */
export function initializeNavigation(bot: Bot): NavigationController {
  const controller = getNavigationController(bot);
  controller.initialize();
  return controller;
}
