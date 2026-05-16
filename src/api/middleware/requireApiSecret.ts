import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const log = logger('ApiAuth');

/**
 * Require API_SECRET via Authorization: Bearer <secret> or X-API-Key header.
 * In production, API_SECRET must be configured.
 */
export function requireApiSecret(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const secret = config.api.secret;

  if (!secret) {
    if (config.env === 'production') {
      log.error('API_SECRET is required in production');
      res.status(503).json({ error: 'API authentication not configured' });
      return;
    }
    log.warn('API_SECRET not set — sensitive routes are unauthenticated (development only)');
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
  const apiKey = req.headers['x-api-key'];
  const provided =
    bearer ?? (typeof apiKey === 'string' ? apiKey : Array.isArray(apiKey) ? apiKey[0] : undefined);

  if (!provided || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
