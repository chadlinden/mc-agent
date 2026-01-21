import fs from 'fs';
import path from 'path';
import config from '../../config/bot-config.js';
import type { Logger, LogLevel } from '../types/index.js';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',

  // Level colors
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red

  // Component colors
  timestamp: '\x1b[90m', // Gray
  module: '\x1b[35m',    // Magenta
  data: '\x1b[90m',      // Gray
};

const currentLevel = LEVELS[config.logging.level as LogLevel] ?? LEVELS.info;
const toConsole = config.logging.toConsole;
const toFile = config.logging.toFile;
const logDir = config.logging.dir;

// Ensure log directory exists
if (toFile) {
  const absoluteLogDir = path.resolve(logDir);
  if (!fs.existsSync(absoluteLogDir)) {
    fs.mkdirSync(absoluteLogDir, { recursive: true });
  }
}

// Generate log filename with date
const getLogFilePath = (): string => {
  const date = new Date().toISOString().split('T')[0];
  return path.resolve(logDir, `bot-${date}.log`);
};

// File write stream (lazy initialized)
let fileStream: fs.WriteStream | null = null;

const getFileStream = (): fs.WriteStream | null => {
  if (!toFile) return null;

  if (!fileStream) {
    fileStream = fs.createWriteStream(getLogFilePath(), { flags: 'a' });
  }
  return fileStream;
};

const timestamp = (): string => new Date().toISOString();

// Plain format for file output (no colors)
const formatPlain = (level: string, module: string, message: string, data?: unknown): string => {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
};

// Colorized format for console output
const formatColored = (level: LogLevel, module: string, message: string, data?: unknown): string => {
  const levelColor = COLORS[level];
  const ts = `${COLORS.timestamp}${timestamp()}${COLORS.reset}`;
  const lvl = `${levelColor}${COLORS.bold}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const mod = `${COLORS.module}${module}${COLORS.reset}`;

  let base = `${ts} ${lvl} ${COLORS.dim}[${COLORS.reset}${mod}${COLORS.dim}]${COLORS.reset} ${message}`;

  if (data !== undefined) {
    const dataStr = JSON.stringify(data, null, 2);
    base += ` ${COLORS.data}${dataStr}${COLORS.reset}`;
  }
  return base;
};

const writeLog = (level: LogLevel, module: string, message: string, data: unknown, consoleMethod: (msg: string) => void): void => {
  if (toConsole) {
    consoleMethod(formatColored(level, module, message, data));
  }

  if (toFile) {
    const stream = getFileStream();
    if (stream) {
      stream.write(formatPlain(level, module, message, data) + '\n');
    }
  }
};

export const createLogger = (module: string): Logger => ({
  debug: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.debug) {
      writeLog('debug', module, message, data, console.log);
    }
  },
  info: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.info) {
      writeLog('info', module, message, data, console.log);
    }
  },
  warn: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.warn) {
      writeLog('warn', module, message, data, console.warn);
    }
  },
  error: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.error) {
      writeLog('error', module, message, data, console.error);
    }
  },
});

// Graceful shutdown - close file stream
export const closeLogger = (): void => {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
};
