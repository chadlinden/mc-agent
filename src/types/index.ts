import type { Bot } from 'mineflayer';

// Configuration types
export interface MinecraftConfig {
  host: string;
  port: number;
  username: string;
  version: string;
}

export interface LLMConfig {
  modelPath: string;
  gpuLayers: number;
  contextSize: number;
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface BotBehaviorConfig {
  autonomousTickMs: number;
  maxChatResponseLength: number;
  memoryBufferSize: number;
  nearbyRadius: number;
}

export interface LoggingConfig {
  level: string;
  toConsole: boolean;
  toFile: boolean;
  dir: string;
}

export interface BotConfig {
  minecraft: MinecraftConfig;
  llm: LLMConfig;
  bot: BotBehaviorConfig;
  logging: LoggingConfig;
  logLevel: string;
}

// Logger types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

// Memory types
export interface PlayerMemory {
  firstMet: string;
  lastSeen: string;
  relationship: string;
  notes: string[];
}

export interface LocationMemory {
  x: number;
  y: number;
  z: number;
  description: string;
  savedAt: string;
}

export interface LongTermMemoryData {
  players: Record<string, PlayerMemory>;
  locations: Record<string, LocationMemory>;
  facts: string[];
  preferences: Record<string, unknown>;
  metadata: {
    createdAt: string;
    lastUpdated: string;
  };
}

// Skill system types
export interface SkillActionParams {
  [key: string]: string;
}

export interface SkillAction {
  description: string;
  params: SkillActionParams;
  execute: (bot: Bot, params: Record<string, unknown>) => Promise<string>;
}

export interface SkillModule {
  description: string;
  actions: Record<string, SkillAction>;
}

// Decision engine types
export interface LLMAction {
  type: string;
  target?: string;
  skill?: string;
  action?: string;
  params?: Record<string, unknown>;
  text?: string;
  name?: string;
  location?: string;
  fact?: string;
  duration?: number;
}

export interface LLMResponse {
  thought?: string;
  speech?: string;
  actions?: LLMAction[];
}

// Short-term memory types
export interface MemoryEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  player: string;
  message: string;
  timestamp: string;
}

export interface ActionRecord {
  action: string;
  result: string;
  timestamp: string;
}
