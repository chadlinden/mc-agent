import type { Bot } from 'mineflayer';
import { buildWorldState } from '../utils/world-state.js';
import { buildSystemPrompt, buildChatPrompt, buildAutonomousPrompt } from './prompts.js';
import { createLogger } from '../utils/logger.js';
import type { ShortTermMemory } from '../memory/short-term.js';
import type { LongTermMemory } from '../memory/long-term.js';

const log = createLogger('context');

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ContextResult {
  messages: ChatMessage[];
  worldState: ReturnType<typeof buildWorldState>;
}

/**
 * Context builder for AI prompts
 */
export class ContextBuilder {
  private bot: Bot;
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private botName: string;

  constructor(bot: Bot, shortTermMemory: ShortTermMemory, longTermMemory: LongTermMemory) {
    this.bot = bot;
    this.shortTerm = shortTermMemory;
    this.longTerm = longTermMemory;
    this.botName = bot.username;
  }

  /**
   * Get current world state
   */
  getWorldState(): ReturnType<typeof buildWorldState> {
    return buildWorldState(this.bot);
  }

  /**
   * Build context for chat response
   */
  buildChatContext(playerName: string, message: string): ContextResult {
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
  buildAutonomousContext(): ContextResult {
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
