import winston from 'winston';
import { getConfig } from '../config/index.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, component, ...metadata }) => {
  const componentStr = component ? `[${component}]` : '';
  const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  return `${timestamp} ${level} ${componentStr} ${message}${metaStr}`;
});

// Create the base logger
function createLogger(): winston.Logger {
  const config = getConfig();

  return winston.createLogger({
    level: config.logLevel,
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), logFormat),
    transports: [
      new winston.transports.Console({
        format: combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), logFormat),
      }),
    ],
    // Don't exit on handled exceptions
    exitOnError: false,
  });
}

// Singleton logger instance
let loggerInstance: winston.Logger | null = null;

/**
 * Get the logger instance
 */
export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

/**
 * Create a child logger with a component name
 */
export function createComponentLogger(component: string): winston.Logger {
  return getLogger().child({ component });
}

/**
 * Logger interface for type safety
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(options: { component: string }): Logger;
}

/**
 * Wrapper class that implements the Logger interface
 */
export class ComponentLogger implements Logger {
  private logger: winston.Logger;
  private component: string;

  constructor(component: string) {
    this.component = component;
    this.logger = getLogger().child({ component });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  child(options: { component: string }): Logger {
    return new ComponentLogger(`${this.component}:${options.component}`);
  }
}

/**
 * Create a typed logger for a component
 */
export function logger(component: string): Logger {
  return new ComponentLogger(component);
}

// Export default logger for convenience
export const defaultLogger = getLogger();
