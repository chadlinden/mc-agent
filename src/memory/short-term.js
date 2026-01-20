import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('short-term-memory');

/**
 * Ring buffer for short-term memory (recent events, chat, actions)
 */
export class ShortTermMemory {
  constructor(maxSize = config.bot.memoryBufferSize) {
    this.maxSize = maxSize;
    this.events = [];
    this.chatHistory = [];
    this.actionHistory = [];
  }

  /**
   * Add an event to memory
   */
  addEvent(type, data) {
    const event = {
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
  addChat(username, message, isBot = false) {
    const entry = {
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
  addAction(skill, action, params, result) {
    const entry = {
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
  getRecentEvents(type = null, count = 10) {
    let events = this.events;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-count);
  }

  /**
   * Get recent chat messages
   */
  getRecentChat(count = 10) {
    return this.chatHistory.slice(-count);
  }

  /**
   * Get recent actions
   */
  getRecentActions(count = 10) {
    return this.actionHistory.slice(-count);
  }

  /**
   * Format chat history for LLM context
   */
  formatChatForContext(count = 10) {
    return this.getRecentChat(count)
      .map(c => `${c.isBot ? '[Bot]' : `[${c.username}]`}: ${c.message}`)
      .join('\n');
  }

  /**
   * Format recent events for LLM context
   */
  formatEventsForContext(count = 10) {
    return this.getRecentEvents(null, count)
      .map(e => `- ${e.type}: ${JSON.stringify(e.data)}`)
      .join('\n');
  }

  /**
   * Format recent actions for LLM context
   */
  formatActionsForContext(count = 5) {
    return this.getRecentActions(count)
      .map(a => `- ${a.skill}.${a.action}(${JSON.stringify(a.params)}) → ${a.result}`)
      .join('\n');
  }

  /**
   * Clear all memory
   */
  clear() {
    this.events = [];
    this.chatHistory = [];
    this.actionHistory = [];
    log.info('Short-term memory cleared');
  }
}
