import config from '../../config/bot-config.js';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

const timestamp = () => new Date().toISOString();

const formatMessage = (level, module, message, data) => {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
};

export const createLogger = (module) => ({
  debug: (message, data) => {
    if (currentLevel <= LEVELS.debug) {
      console.log(formatMessage('debug', module, message, data));
    }
  },
  info: (message, data) => {
    if (currentLevel <= LEVELS.info) {
      console.log(formatMessage('info', module, message, data));
    }
  },
  warn: (message, data) => {
    if (currentLevel <= LEVELS.warn) {
      console.warn(formatMessage('warn', module, message, data));
    }
  },
  error: (message, data) => {
    if (currentLevel <= LEVELS.error) {
      console.error(formatMessage('error', module, message, data));
    }
  },
});
