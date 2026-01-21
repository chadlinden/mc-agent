import 'dotenv/config';
import type { BotConfig } from '../src/types/index.js';

const config: BotConfig = {
  // Minecraft server settings
  minecraft: {
    host: process.env.MC_HOST || '127.0.0.1',
    port: parseInt(process.env.MC_PORT ?? '25565', 10),
    username: process.env.MC_USER || 'AIBot',
    version: process.env.MC_VERSION || '1.21.10',
  },

  // LLM settings
  llm: {
    modelPath: process.env.MODEL_PATH || './models/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    gpuLayers: parseInt(process.env.GPU_LAYERS ?? '33', 10),
    contextSize: parseInt(process.env.CONTEXT_SIZE ?? '4096', 10),
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
  },

  // Bot behavior settings
  bot: {
    autonomousTickMs: parseInt(process.env.AUTONOMOUS_TICK_MS ?? '8000', 10),
    maxChatResponseLength: 200,
    memoryBufferSize: 50,
    nearbyRadius: 32,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    toConsole: process.env.LOG_TO_CONSOLE !== 'false',
    toFile: process.env.LOG_TO_FILE === 'true',
    dir: process.env.LOG_DIR || './logs',
  },

  // Legacy (for backwards compat)
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
