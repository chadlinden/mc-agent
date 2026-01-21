import type { Bot } from 'mineflayer';
import * as navigation from './navigation.js';
import * as building from './building.js';
import * as inventory from './inventory.js';
import * as mining from './mining.js';
import * as combat from './combat.js';
import { createLogger } from '../utils/logger.js';
import type { SkillModule, SkillActionParams } from '../types/index.js';

const log = createLogger('skills');

interface SkillRegistry {
  [key: string]: SkillModule;
}

interface ActionResult {
  success: boolean;
  result?: string;
  error?: string;
}

interface SkillMetadata {
  [skillName: string]: {
    description: string;
    actions: {
      [actionName: string]: {
        description: string;
        params: SkillActionParams;
      };
    };
  };
}

/**
 * Skill registry - maps skill names to their modules
 */
export const skills: SkillRegistry = {
  navigation,
  building,
  inventory,
  mining,
  combat,
};

/**
 * Execute a skill action
 */
export async function executeAction(
  bot: Bot,
  skillName: string,
  actionName: string,
  params: Record<string, unknown> = {}
): Promise<ActionResult> {
  const skill = skills[skillName];
  if (!skill) {
    log.warn('Unknown skill', { skillName });
    return { success: false, error: `Unknown skill: ${skillName}` };
  }

  const action = skill.actions[actionName];
  if (!action) {
    log.warn('Unknown action', { skillName, actionName });
    return { success: false, error: `Unknown action: ${skillName}.${actionName}` };
  }

  try {
    log.info('Executing action', { skillName, actionName, params });
    const result = await action.execute(bot, params);
    log.info('Action completed', { skillName, actionName, result });
    return { success: true, result };
  } catch (err) {
    const error = err as Error;
    log.error('Action failed', { skillName, actionName, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get all skill metadata for LLM context
 */
export function getSkillMetadata(): SkillMetadata {
  const metadata: SkillMetadata = {};
  for (const [skillName, skill] of Object.entries(skills)) {
    metadata[skillName] = {
      description: skill.description,
      actions: {},
    };
    for (const [actionName, action] of Object.entries(skill.actions)) {
      metadata[skillName]!.actions[actionName] = {
        description: action.description,
        params: action.params,
      };
    }
  }
  return metadata;
}
