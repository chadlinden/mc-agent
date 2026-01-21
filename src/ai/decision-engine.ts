import type { Bot } from 'mineflayer';
import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';
import { ContextBuilder } from './context.js';
import { chat, parseJsonResponse } from './llm.js';
import { executeAction } from '../skills/index.js';
import type { ShortTermMemory } from '../memory/short-term.js';
import type { LongTermMemory } from '../memory/long-term.js';
import type { LLMResponse } from '../types/index.js';

const log = createLogger('decision-engine');

interface ActionParams {
  message?: string;
  fact?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * AI Decision Engine - handles chat responses and autonomous behavior
 */
export class DecisionEngine {
  private bot: Bot;
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;
  private context: ContextBuilder;

  private isProcessing: boolean;
  private autonomousInterval: ReturnType<typeof setInterval> | null;
  private lastActionTime: number;

  constructor(bot: Bot, shortTermMemory: ShortTermMemory, longTermMemory: LongTermMemory) {
    this.bot = bot;
    this.shortTerm = shortTermMemory;
    this.longTerm = longTermMemory;
    this.context = new ContextBuilder(bot, shortTermMemory, longTermMemory);

    this.isProcessing = false;
    this.autonomousInterval = null;
    this.lastActionTime = 0;
  }

  /**
   * Handle a chat message from a player
   */
  async handleChat(username: string, message: string): Promise<void> {
    if (this.isProcessing) {
      log.debug('Already processing, skipping chat');
      return;
    }

    this.isProcessing = true;
    this.shortTerm.addChat(username, message, false);

    try {
      const { messages } = this.context.buildChatContext(username, message);

      log.info('Processing chat', { username, message });
      const response = await chat(messages);
      log.debug('LLM response', { response });

      const parsed = parseJsonResponse(response);
      if (parsed) {
        await this.executeResponse(parsed);
      } else {
        log.warn('Could not parse LLM response as JSON');
        // Fall back to saying something generic
        this.bot.chat("I'm not sure how to respond to that.");
      }
    } catch (err) {
      const error = err as Error;
      log.error('Error handling chat', { error: error.message });
      this.bot.chat("Sorry, I encountered an error.");
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Make an autonomous decision (called periodically when idle)
   */
  async makeAutonomousDecision(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    // Don't make decisions too frequently
    const now = Date.now();
    if (now - this.lastActionTime < config.bot.autonomousTickMs) {
      return;
    }

    this.isProcessing = true;

    try {
      const { messages } = this.context.buildAutonomousContext();

      log.debug('Making autonomous decision');
      const response = await chat(messages);
      log.debug('LLM response', { response });

      const parsed = parseJsonResponse(response);
      if (parsed) {
        // Check if it's a wait action
        if (parsed.action?.action === 'wait' || !parsed.action) {
          log.debug('AI decided to wait');
        } else {
          await this.executeResponse(parsed);
        }
      }
    } catch (err) {
      const error = err as Error;
      log.error('Error in autonomous decision', { error: error.message });
    } finally {
      this.isProcessing = false;
      this.lastActionTime = Date.now();
    }
  }

  /**
   * Execute the parsed LLM response
   */
  async executeResponse(parsed: LLMResponse): Promise<void> {
    log.debug('Executing response', { parsed });

    // Handle speech
    if (parsed.speech) {
      const speech = parsed.speech.slice(0, config.bot.maxChatResponseLength);
      this.bot.chat(speech);
      this.shortTerm.addChat(this.bot.username, speech, true);
    }

    // Handle action
    if (parsed.action) {
      const { skill, action, params } = parsed.action;

      // Handle utility actions
      if (skill === 'utility' && action) {
        await this.handleUtilityAction(action, (params || {}) as ActionParams);
        return;
      }

      // Execute skill action
      if (skill && action) {
        const result = await executeAction(this.bot, skill, action, params || {});
        this.shortTerm.addAction(skill, action, params || {}, result.success ? (result.result || '') : (result.error || ''));

        if (!result.success) {
          log.warn('Action failed', { skill, action, error: result.error });
        }
      }
    }
  }

  /**
   * Handle utility actions (say, remember, save_location, wait)
   */
  async handleUtilityAction(action: string, params: ActionParams): Promise<void> {
    switch (action) {
      case 'say':
        if (params.message) {
          const msg = params.message.slice(0, config.bot.maxChatResponseLength);
          this.bot.chat(msg);
          this.shortTerm.addChat(this.bot.username, msg, true);
        }
        break;

      case 'remember':
        if (params.fact) {
          this.longTerm.addFact(params.fact);
        }
        break;

      case 'save_location':
        if (params.name) {
          this.longTerm.saveLocation(params.name, this.bot.entity.position, params.description || '');
        }
        break;

      case 'wait':
        // Do nothing
        break;

      default:
        log.warn('Unknown utility action', { action });
    }
  }

  /**
   * Start the autonomous decision loop
   */
  startAutonomousLoop(): void {
    if (this.autonomousInterval) {
      return;
    }

    log.info('Starting autonomous decision loop', { intervalMs: config.bot.autonomousTickMs });

    this.autonomousInterval = setInterval(() => {
      this.makeAutonomousDecision().catch(err => {
        const error = err as Error;
        log.error('Autonomous loop error', { error: error.message });
      });
    }, config.bot.autonomousTickMs);
  }

  /**
   * Stop the autonomous decision loop
   */
  stopAutonomousLoop(): void {
    if (this.autonomousInterval) {
      clearInterval(this.autonomousInterval);
      this.autonomousInterval = null;
      log.info('Stopped autonomous decision loop');
    }
  }

  /**
   * Check if currently processing
   */
  isBusy(): boolean {
    return this.isProcessing;
  }
}
