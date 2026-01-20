/**
 * AI Minecraft Bot - Main Entry Point
 *
 * An AI-powered Minecraft bot using Mineflayer and local LLM inference
 * via llama.cpp on GPU (RTX 4060).
 */

import 'dotenv/config';

import { createLogger } from './utils/logger.js';
import { createBot } from './bot/bot.js';
import { setupEventHandlers } from './bot/events.js';
import { tryDirectCommand } from './bot/commands.js';
import { ShortTermMemory } from './memory/short-term.js';
import { LongTermMemory } from './memory/long-term.js';
import { DecisionEngine } from './ai/decision-engine.js';
import { initialize as initLLM, shutdown as shutdownLLM } from './ai/llm.js';

const log = createLogger('main');

async function main() {
  log.info('Starting AI Minecraft Bot...');

  // Initialize LLM
  log.info('Initializing LLM...');
  try {
    await initLLM();
    log.info('LLM initialized successfully');
  } catch (err) {
    log.error('Failed to initialize LLM', { error: err.message });
    log.error('Make sure you have a GGUF model at the path specified in .env');
    process.exit(1);
  }

  // Initialize memory systems
  const shortTermMemory = new ShortTermMemory();
  const longTermMemory = new LongTermMemory();

  // Create bot
  const bot = createBot();

  // Create decision engine
  const decisionEngine = new DecisionEngine(bot, shortTermMemory, longTermMemory);

  // Override chat handler to check for direct commands first
  const originalHandleChat = decisionEngine.handleChat.bind(decisionEngine);
  decisionEngine.handleChat = async (username, message) => {
    // Check for direct commands first
    const handled = await tryDirectCommand(message, bot, decisionEngine);
    if (!handled) {
      // Pass to AI if not a direct command
      await originalHandleChat(username, message);
    }
  };

  // Set up event handlers
  setupEventHandlers(bot, decisionEngine, shortTermMemory);

  // Graceful shutdown
  const shutdown = async (signal) => {
    log.info(`Received ${signal}, shutting down...`);

    decisionEngine.stopAutonomousLoop();

    try {
      bot.quit();
    } catch {}

    await shutdownLLM();

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.info('Bot initialization complete, connecting to server...');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
