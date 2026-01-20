import fs from 'fs';
import path from 'path';
import config from '../../config/bot-config.js';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[config.logging?.level ?? config.logLevel] ?? LEVELS.info;
const toConsole = config.logging?.toConsole ?? true;
const toFile = config.logging?.toFile ?? false;
const logDir = config.logging?.dir ?? './logs';

// Ensure log directory exists
if (toFile) {
  const absoluteLogDir = path.resolve(logDir);
  if (!fs.existsSync(absoluteLogDir)) {
    fs.mkdirSync(absoluteLogDir, { recursive: true });
  }
}

// Generate log filename with date
const getLogFilePath = () => {
  const date = new Date().toISOString().split('T')[0];
  return path.resolve(logDir, `bot-${date}.log`);
};

// File write stream (lazy initialized)
let fileStream = null;

const getFileStream = () => {
  if (!toFile) return null;

  if (!fileStream) {
    fileStream = fs.createWriteStream(getLogFilePath(), { flags: 'a' });
  }
  return fileStream;
};

const timestamp = () => new Date().toISOString();

const formatMessage = (level, module, message, data) => {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
};

const writeLog = (formatted, consoleMethod) => {
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

export const createLogger = (module) => ({
  debug: (message, data) => {
    if (currentLevel <= LEVELS.debug) {
      writeLog(formatMessage('debug', module, message, data), console.log);
    }
  },
  info: (message, data) => {
    if (currentLevel <= LEVELS.info) {
      writeLog(formatMessage('info', module, message, data), console.log);
    }
  },
  warn: (message, data) => {
    if (currentLevel <= LEVELS.warn) {
      writeLog(formatMessage('warn', module, message, data), console.warn);
    }
  },
  error: (message, data) => {
    if (currentLevel <= LEVELS.error) {
      writeLog(formatMessage('error', module, message, data), console.error);
    }
  },
});

// Graceful shutdown - close file stream
export const closeLogger = () => {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
};
