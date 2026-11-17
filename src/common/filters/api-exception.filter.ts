import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

type BodyParserError = {
  status?: unknown;
  type?: unknown;
};

function isBodyParserError(value: unknown): value is BodyParserError {
  return typeof value === 'object' && value !== null && ('status' in value || 'type' in value);
}

function isDefaultHttpResponse(value: unknown, statusCode: HttpStatus, error: string) {
  return typeof value === 'object'
    && value !== null
    && 'error' in value
    && 'statusCode' in value
    && (value as { error?: unknown; statusCode?: unknown }).error === error
    && (value as { statusCode?: unknown }).statusCode === statusCode;
}

function isLessonRequest(request: Request) {
  return (request.originalUrl ?? request.url).startsWith('/v1/lessons/');
}

function errorCodeForStatus(status: number) {
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return 'INTERNAL_ERROR';
  return 'INVALID_REQUEST';
}

function errorMessageForStatus(status: number) {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return 'Internal server error';
  return 'Request could not be processed.';
}

function explicitError(value: unknown, status: number) {
  if (typeof value === 'object' && value !== null && 'code' in value && 'message' in value) {
    const { code, message } = value as { code?: unknown; message?: unknown };
    if (typeof code === 'string' && typeof message === 'string') return { code, message };
  }
  return { code: errorCodeForStatus(status), message: errorMessageForStatus(status) };
}

/**
 * Envelopes lesson errors while retaining non-lesson response contracts, and
 * never exposes parser details or stacks for malformed or unexpected failures.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    if (isLessonRequest(request)) {
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const payload = status === HttpStatus.BAD_REQUEST && isDefaultHttpResponse(exception.getResponse(), HttpStatus.BAD_REQUEST, 'Bad Request')
          ? { code: 'INVALID_REQUEST', message: 'Request body is invalid.' }
          : explicitError(exception.getResponse(), status);
        response.status(status).json({ error: payload });
        return;
      }
      if (isBodyParserError(exception)) {
        response.status(HttpStatus.BAD_REQUEST).json({ error: { code: 'INVALID_REQUEST', message: 'Request body is invalid.' } });
        return;
      }
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
      return;
    }

    if (exception instanceof HttpException) {
      if (exception.getStatus() === HttpStatus.BAD_REQUEST && isDefaultHttpResponse(exception.getResponse(), HttpStatus.BAD_REQUEST, 'Bad Request')) {
        response.status(HttpStatus.BAD_REQUEST).json({ code: 'INVALID_REQUEST', message: 'Request body is invalid.' });
        return;
      }
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (isBodyParserError(exception)) {
      response.status(HttpStatus.BAD_REQUEST).json({ code: 'INVALID_REQUEST', message: 'Request body is invalid.' });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
