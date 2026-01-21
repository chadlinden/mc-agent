import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('short-term-memory');

interface MemoryEvent {
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
}

interface ChatEntry {
  timestamp: number;
  username: string;
  message: string;
  isBot: boolean;
}

interface ActionEntry {
  timestamp: number;
  skill: string;
  action: string;
  params: Record<string, unknown>;
  result: string;
}

/**
 * Ring buffer for short-term memory (recent events, chat, actions)
 */
export class ShortTermMemory {
  private maxSize: number;
  private events: MemoryEvent[];
  private chatHistory: ChatEntry[];
  private actionHistory: ActionEntry[];

  constructor(maxSize: number = config.bot.memoryBufferSize) {
    this.maxSize = maxSize;
    this.events = [];
    this.chatHistory = [];
    this.actionHistory = [];
  }

  /**
   * Add an event to memory
   */
  addEvent(type: string, data: Record<string, unknown>): void {
    const event: MemoryEvent = {
      timestamp: Date.now(),
      type,
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
    log.debug('Event added', { type, data });
  }

  /**
   * Add a chat message to history
   */
  addChat(username: string, message: string, isBot: boolean = false): void {
    const entry: ChatEntry = {
      timestamp: Date.now(),
      username,
      message,
      isBot,
    };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > this.maxSize) {
      this.chatHistory.shift();
    }
  }

  /**
   * Add an action to history
   */
  addAction(skill: string, action: string, params: Record<string, unknown>, result: string): void {
    const entry: ActionEntry = {
      timestamp: Date.now(),
      skill,
      action,
      params,
      result,
    };
    this.actionHistory.push(entry);
    if (this.actionHistory.length > this.maxSize) {
      this.actionHistory.shift();
    }
  }

  /**
   * Get recent events of a specific type
   */
  getRecentEvents(type: string | null = null, count: number = 10): MemoryEvent[] {
    let events = this.events;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-count);
  }

  /**
   * Get recent chat messages
   */
  getRecentChat(count: number = 10): ChatEntry[] {
    return this.chatHistory.slice(-count);
  }

  /**
   * Get recent actions
   */
  getRecentActions(count: number = 10): ActionEntry[] {
    return this.actionHistory.slice(-count);
  }

  /**
   * Format chat history for LLM context
   */
  formatChatForContext(count: number = 10): string {
    return this.getRecentChat(count)
      .map(c => `${c.isBot ? '[Bot]' : `[${c.username}]`}: ${c.message}`)
      .join('\n');
  }

  /**
   * Format recent events for LLM context
   */
  formatEventsForContext(count: number = 10): string {
    return this.getRecentEvents(null, count)
      .map(e => `- ${e.type}: ${JSON.stringify(e.data)}`)
      .join('\n');
  }

  /**
   * Format recent actions for LLM context
   */
  formatActionsForContext(count: number = 5): string {
    return this.getRecentActions(count)
      .map(a => `- ${a.skill}.${a.action}(${JSON.stringify(a.params)}) → ${a.result}`)
      .join('\n');
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.events = [];
    this.chatHistory = [];
    this.actionHistory = [];
    log.info('Short-term memory cleared');
  }
}
