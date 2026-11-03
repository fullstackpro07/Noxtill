import type { NextFunction, Request, Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { AppException } from './filters/app.exception';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { requestIdMiddleware } from './request-id.middleware';

const run = (incoming?: string) => {
  const req = {
    headers: incoming ? { 'x-request-id': incoming } : {},
  } as unknown as Request;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  requestIdMiddleware(req, res, next);
  return { req, headers, next };
};

describe('requestIdMiddleware', () => {
  it('keeps a safe incoming id and echoes it', () => {
    const { req, headers, next } = run('lb-trace-12345678');
    expect(req.headers['x-request-id']).toBe('lb-trace-12345678');
    expect(headers['X-Request-Id']).toBe('lb-trace-12345678');
    expect(next).toHaveBeenCalled();
  });

  it('replaces a missing or unsafe id with a generated one', () => {
    expect(run().headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    const unsafe = run('<script>alert(1)</script>');
    expect(unsafe.headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(unsafe.req.headers['x-request-id']).toBe(
      unsafe.headers['X-Request-Id'],
    );
  });
});

describe('HttpExceptionFilter request id', () => {
  const respond = (requestId?: string) => {
    let payload: unknown;
    let status = 0;
    const response = {
      status: (s: number) => {
        status = s;
        return response;
      },
      json: (b: unknown) => (payload = b),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          headers: requestId ? { 'x-request-id': requestId } : {},
        }),
      }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(
      new AppException('THING_NOT_FOUND', 'Not found', HttpStatus.NOT_FOUND),
      host,
    );
    return { status, payload };
  };

  it('adds the request id to the error body', () => {
    expect(respond('req-abcdefgh')).toEqual({
      status: 404,
      payload: {
        error: {
          code: 'THING_NOT_FOUND',
          message: 'Not found',
          requestId: 'req-abcdefgh',
        },
      },
    });
  });

  it('keeps the existing body shape when no id is present', () => {
    expect(respond().payload).toEqual({
      error: { code: 'THING_NOT_FOUND', message: 'Not found' },
    });
  });
});
