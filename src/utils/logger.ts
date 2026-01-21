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

const formatMessage = (level: string, module: string, message: string, data?: unknown): string => {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
};

const writeLog = (formatted: string, consoleMethod: (msg: string) => void): void => {
  if (toConsole) {
    consoleMethod(formatted);
  }

  if (toFile) {
    const stream = getFileStream();
    if (stream) {
      stream.write(formatted + '\n');
    }
  }
};

export const createLogger = (module: string): Logger => ({
  debug: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.debug) {
      writeLog(formatMessage('debug', module, message, data), console.log);
    }
  },
  info: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.info) {
      writeLog(formatMessage('info', module, message, data), console.log);
    }
  },
  warn: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.warn) {
      writeLog(formatMessage('warn', module, message, data), console.warn);
    }
  },
  error: (message: string, data?: unknown): void => {
    if (currentLevel <= LEVELS.error) {
      writeLog(formatMessage('error', module, message, data), console.error);
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
