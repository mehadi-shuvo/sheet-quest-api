import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

function isEnvelope(value: unknown): value is { data: unknown; meta?: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('data' in value)) return false;
  return Object.keys(value).every((key) => key === 'data' || key === 'meta');
}

/** Wraps only lesson-controller JSON responses, leaving 204/framework responses alone. */
@Injectable()
export class LessonResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<{ statusCode: number; headersSent: boolean }>();
    return next.handle().pipe(map((body) => {
      if (response.statusCode === 204 || response.headersSent || body === undefined || isEnvelope(body)) return body;
      return { data: body };
    }));
  }
}
