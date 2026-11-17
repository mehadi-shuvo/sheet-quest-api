import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

function routeFor(request: Request) {
  const route = request.route?.path;
  if (typeof route === 'string') return `${request.baseUrl}${route}`;
  return request.path;
}

export function requestLoggingMiddleware(request: Request, response: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  response.setHeader('X-Request-ID', requestId);
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.log({
      requestId,
      method: request.method,
      route: routeFor(request),
      statusCode: response.statusCode,
      durationMs: Math.round(durationMs),
    });
  });

  next();
}
