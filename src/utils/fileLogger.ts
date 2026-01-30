/**
 * File Logger
 *
 * Extends the base logger with file-based logging capabilities.
 * Uses winston's built-in file transport.
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { getLogger } from './logger.js';
import { createComponentLogger } from './logger.js';

const log = createComponentLogger('FileLogger');

/**
 * File logger configuration
 */
export interface FileLoggerConfig {
  enabled: boolean;
  logDirectory: string;
  maxFiles: string;
  maxSize: string;
  datePattern: string;
  zippedArchive: boolean;
}

const DEFAULT_CONFIG: FileLoggerConfig = {
  enabled: true,
  logDirectory: './logs',
  maxFiles: '7d',
  maxSize: '20m',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: false,
};

/**
 * JSON format for file logging
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Initialize file logging transports
 */
export function initializeFileLogging(config: Partial<FileLoggerConfig> = {}): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    log.info('File logging is disabled');
    return;
  }

  // Ensure log directory exists
  const logDir = path.resolve(cfg.logDirectory);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    log.info('Created log directory', { path: logDir });
  }

  const logger = getLogger();

  // Combined log transport (all levels)
  const combinedTransport = new winston.transports.File({
    dirname: logDir,
    filename: 'combined.log',
    format: jsonFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 7,
  });

  // Error log transport (errors only)
  const errorTransport = new winston.transports.File({
    dirname: logDir,
    filename: 'error.log',
    level: 'error',
    format: jsonFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 7,
  });

  // Add transports to logger
  logger.add(combinedTransport);
  logger.add(errorTransport);

  log.info('File logging initialized', {
    directory: logDir,
  });
}

/**
 * Get the log directory path
 */
export function getLogDirectory(config: Partial<FileLoggerConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return path.resolve(cfg.logDirectory);
}

/**
 * List all log files
 */
export function listLogFiles(config: Partial<FileLoggerConfig> = {}): string[] {
  const logDir = getLogDirectory(config);

  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir).filter((file) => file.endsWith('.log') || file.endsWith('.gz'));
}

/**
 * Get total size of log files
 */
export function getLogFilesSize(config: Partial<FileLoggerConfig> = {}): number {
  const logDir = getLogDirectory(config);

  if (!fs.existsSync(logDir)) {
    return 0;
  }

  const files = listLogFiles(config);
  return files.reduce((total, file) => {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    return total + stats.size;
  }, 0);
}

/**
 * Read recent log entries (last N lines)
 */
export function readRecentLogs(
  filename: string,
  lines: number = 100,
  config: Partial<FileLoggerConfig> = {}
): string[] {
  const logDir = getLogDirectory(config);
  const filePath = path.join(logDir, filename);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n').filter((line) => line.trim());

  return allLines.slice(-lines);
}

/**
 * Parse JSON log entries
 */
export function parseLogEntries(
  lines: string[]
): Array<{
  timestamp: string;
  level: string;
  message: string;
  component?: string;
  [key: string]: unknown;
}> {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

/**
 * Clean up old log files manually
 */
export function cleanupOldLogs(
  daysToKeep: number,
  config: Partial<FileLoggerConfig> = {}
): number {
  const logDir = getLogDirectory(config);

  if (!fs.existsSync(logDir)) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const files = listLogFiles(config);
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);

    if (stats.mtime < cutoffDate) {
      fs.unlinkSync(filePath);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    log.info('Cleaned up old log files', {
      deleted: deletedCount,
      daysKept: daysToKeep,
    });
  }

  return deletedCount;
}

/**
 * Get log statistics
 */
export function getLogStats(config: Partial<FileLoggerConfig> = {}): {
  fileCount: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  oldestFile?: string;
  newestFile?: string;
  logDirectory: string;
} {
  const logDir = getLogDirectory(config);
  const files = listLogFiles(config);

  if (files.length === 0) {
    return {
      fileCount: 0,
      totalSizeBytes: 0,
      totalSizeMB: 0,
      logDirectory: logDir,
    };
  }

  const totalSize = getLogFilesSize(config);

  // Sort files by modification time
  const sortedFiles = files
    .map((file) => ({
      name: file,
      mtime: fs.statSync(path.join(logDir, file)).mtime,
    }))
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

  const result: {
    fileCount: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    oldestFile?: string;
    newestFile?: string;
    logDirectory: string;
  } = {
    fileCount: files.length,
    totalSizeBytes: totalSize,
    totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
    logDirectory: logDir,
  };

  if (sortedFiles.length > 0) {
    const oldest = sortedFiles[0];
    const newest = sortedFiles[sortedFiles.length - 1];
    if (oldest) {
      result.oldestFile = oldest.name;
    }
    if (newest) {
      result.newestFile = newest.name;
    }
  }

  return result;
}
