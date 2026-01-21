import { getLlama, LlamaChatSession, Llama, LlamaModel, LlamaContext, LlamaContextSequence } from 'node-llama-cpp';
import config from '../../config/bot-config.js';
import { createLogger } from '../utils/logger.js';
import type { LLMResponse } from '../types/index.js';

const log = createLogger('llm');

let llamaInstance: Llama | null = null;
let modelInstance: LlamaModel | null = null;
let contextInstance: LlamaContext | null = null;
let sequenceInstance: LlamaContextSequence | null = null;

interface GenerateOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Initialize the LLM with GPU acceleration
 */
export async function initialize(): Promise<void> {
  if (modelInstance) {
    log.info('LLM already initialized');
    return;
  }

  log.info('Initializing LLM with CUDA...', { modelPath: config.llm.modelPath });

  try {
    llamaInstance = await getLlama({
      gpu: 'cuda',
    });

    modelInstance = await llamaInstance.loadModel({
      modelPath: config.llm.modelPath,
      gpuLayers: config.llm.gpuLayers,
    });

    contextInstance = await modelInstance.createContext({
      contextSize: config.llm.contextSize,
    });

    // Create a single reusable sequence
    sequenceInstance = contextInstance.getSequence();

    log.info('LLM initialized successfully', {
      gpuLayers: config.llm.gpuLayers,
      contextSize: config.llm.contextSize,
    });
  } catch (err) {
    const error = err as Error;
    log.error('Failed to initialize LLM', { error: error.message });
    throw err;
  }
}

/**
 * Generate a response for a single prompt (stateless)
 * Reuses the same context sequence for all requests
 */
export async function generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
  if (!contextInstance || !sequenceInstance) {
    await initialize();
  }

  // Create a new session reusing the existing sequence
  // The session will clear history on creation
  const session = new LlamaChatSession({
    contextSequence: sequenceInstance!,
  });

  try {
    const response = await session.prompt(prompt, {
      temperature: options.temperature ?? config.llm.temperature,
      topP: options.topP ?? config.llm.topP,
      maxTokens: options.maxTokens ?? config.llm.maxTokens,
    });

    return response;
  } finally {
    // Dispose the session but keep the sequence for reuse
    // Clear the sequence state for the next request
    session.dispose();
    // Erase the sequence to reset it for fresh prompts
    sequenceInstance!.eraseContextTokenRanges([{
      start: 0,
      end: sequenceInstance!.nextTokenIndex,
    }]);
  }
}

/**
 * Chat with conversation history (for multi-turn)
 */
export async function chat(messages: ChatMessage[], options: GenerateOptions = {}): Promise<string> {
  if (!contextInstance || !sequenceInstance) {
    await initialize();
  }

  const session = new LlamaChatSession({
    contextSequence: sequenceInstance!,
  });

  try {
    // Build the conversation by replaying history
    let response = '';
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.role === 'system') {
        // System messages are prepended to the first user message
        continue;
      }
      if (msg?.role === 'user') {
        // For the last user message, get the response
        if (i === messages.length - 1) {
          // Prepend system message if exists
          const systemMsg = messages.find(m => m.role === 'system');
          const fullPrompt = systemMsg
            ? `${systemMsg.content}\n\n${msg.content}`
            : msg.content;

          response = await session.prompt(fullPrompt, {
            temperature: options.temperature ?? config.llm.temperature,
            topP: options.topP ?? config.llm.topP,
            maxTokens: options.maxTokens ?? config.llm.maxTokens,
          });
        }
      }
    }

    return response;
  } finally {
    // Dispose session and reset sequence for next use
    session.dispose();
    sequenceInstance!.eraseContextTokenRanges([{
      start: 0,
      end: sequenceInstance!.nextTokenIndex,
    }]);
  }
}

/**
 * Parse JSON from LLM response (with fallback)
 */
export function parseJsonResponse(response: string): LLMResponse | null {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as LLMResponse;
    } catch (err) {
      const error = err as Error;
      log.warn('Failed to parse JSON from response', { error: error.message });
    }
  }
  return null;
}

/**
 * Cleanup resources
 */
export async function shutdown(): Promise<void> {
  // Dispose in reverse order of creation
  if (sequenceInstance) {
    sequenceInstance.dispose();
    sequenceInstance = null;
  }
  if (contextInstance) {
    await contextInstance.dispose();
    contextInstance = null;
  }
  if (modelInstance) {
    await modelInstance.dispose();
    modelInstance = null;
  }
  log.info('LLM shutdown complete');
}

/**
 * Test the LLM (can be run standalone)
 */
export async function test(prompt: string = 'Hello, who are you?'): Promise<string> {
  await initialize();
  log.info('Testing LLM with prompt:', { prompt });
  const response = await generate(prompt);
  log.info('Response:', { response });
  return response;
}

// Allow running as standalone test
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const testPrompt = process.argv.includes('--test')
    ? process.argv[process.argv.indexOf('--test') + 1] || 'Hello, who are you?'
    : 'Hello, who are you?';

  test(testPrompt)
    .then(() => shutdown())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Test failed:', err);
      process.exit(1);
    });
}
