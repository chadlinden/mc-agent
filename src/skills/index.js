import * as navigation from './navigation.js';
import * as building from './building.js';
import * as inventory from './inventory.js';
import * as mining from './mining.js';
import * as combat from './combat.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('skills');

/**
 * Skill registry - maps skill names to their modules
 */
export const skills = {
  navigation,
  building,
  inventory,
  mining,
  combat,
};

/**
 * Execute a skill action
 */
export async function executeAction(bot, skillName, actionName, params = {}) {
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
    log.error('Action failed', { skillName, actionName, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get all skill metadata for LLM context
 */
export function getSkillMetadata() {
  const metadata = {};
  for (const [skillName, skill] of Object.entries(skills)) {
    metadata[skillName] = {
      description: skill.description,
      actions: {},
    };
    for (const [actionName, action] of Object.entries(skill.actions)) {
      metadata[skillName].actions[actionName] = {
        description: action.description,
        params: action.params,
      };
    }
  }
  return metadata;
}
