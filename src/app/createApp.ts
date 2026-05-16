import express, { type Express } from 'express';

/**
 * Create base Express application (routes registered in index bootstrap).
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());
  return app;
}
