import 'dotenv/config';

export default {
  // Minecraft server settings
  minecraft: {
    host: process.env.MC_HOST || '127.0.0.1',
    port: parseInt(process.env.MC_PORT, 10) || 25565,
    username: process.env.MC_USER || 'AIBot',
    version: process.env.MC_VERSION || '1.21.10',
  },

  // LLM settings
  llm: {
    modelPath: process.env.MODEL_PATH || './models/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    gpuLayers: parseInt(process.env.GPU_LAYERS, 10) || 33,
    contextSize: parseInt(process.env.CONTEXT_SIZE, 10) || 4096,
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
  },

  // Bot behavior settings
  bot: {
    autonomousTickMs: parseInt(process.env.AUTONOMOUS_TICK_MS, 10) || 8000,
    maxChatResponseLength: 200,
    memoryBufferSize: 50,
    nearbyRadius: 32,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
