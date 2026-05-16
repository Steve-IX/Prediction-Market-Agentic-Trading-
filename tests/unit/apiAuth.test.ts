import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/config/index.js', () => ({
  getConfig: () => ({
    env: 'production',
    api: { secret: 'test-secret-key' },
  }),
}));

describe('requireApiSecret', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects missing credentials', async () => {
    const { requireApiSecret } = await import('../../src/api/middleware/requireApiSecret.js');
    const req = { headers: {} } as Request;
    const res = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    } as Response;
    const next = vi.fn() as NextFunction;

    requireApiSecret(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid bearer token', async () => {
    const { requireApiSecret } = await import('../../src/api/middleware/requireApiSecret.js');
    const req = {
      headers: { authorization: 'Bearer test-secret-key' },
    } as Request;
    const res = {
      status: () => res,
      json: () => res,
    } as Response;
    const next = vi.fn() as NextFunction;

    requireApiSecret(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
