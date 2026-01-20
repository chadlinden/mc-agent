import { buildWorldState } from '../utils/world-state.js';
import { buildSystemPrompt, buildChatPrompt, buildAutonomousPrompt } from './prompts.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('context');

/**
 * Context builder for AI prompts
 */
export class ContextBuilder {
  constructor(bot, shortTermMemory, longTermMemory) {
    this.bot = bot;
    this.shortTerm = shortTermMemory;
    this.longTerm = longTermMemory;
    this.botName = bot.username;
  }

  /**
   * Get current world state
   */
  getWorldState() {
    return buildWorldState(this.bot);
  }

  /**
   * Build context for chat response
   */
  buildChatContext(playerName, message) {
    const worldState = this.getWorldState();
    const longTermMemory = this.longTerm.formatForContext();

    // Remember this player interaction
    this.longTerm.rememberPlayer(playerName, { lastMessage: message });

    const systemPrompt = buildSystemPrompt(this.botName);
    const userPrompt = buildChatPrompt(worldState, longTermMemory, playerName, message);

    log.debug('Built chat context', { playerName, worldState });

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      worldState,
    };
  }

  /**
   * Build context for autonomous decision
   */
  buildAutonomousContext() {
    const worldState = this.getWorldState();
    const longTermMemory = this.longTerm.formatForContext();
    const recentActions = this.shortTerm.formatActionsForContext(5);

    const systemPrompt = buildSystemPrompt(this.botName);
    const userPrompt = buildAutonomousPrompt(worldState, longTermMemory, recentActions);

    log.debug('Built autonomous context', { worldState });

    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      worldState,
    };
  }
}
