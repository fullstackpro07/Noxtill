import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_ID = /^[A-Za-z0-9._:-]{8,100}$/;

/**
 * Correlation id for every request: keeps a caller-supplied `X-Request-Id` when it is a safe
 * token (e.g. from a load balancer), otherwise generates one, and echoes it on the response so
 * a support report can be matched to server logs and error bodies.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_ID.test(incoming)
      ? incoming
      : randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
}
