import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  /** Correlation id (see request-id.middleware) so a report can be matched to server logs. */
  requestId?: string;
}

function toMessage(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Normalizes every thrown error into `{error:{code,message,fields?}}` per the
 * API conventions (BE-013 / backend spec §1). class-validator's
 * BadRequestException payload (array of ValidationError-derived messages) is
 * flattened into `fields`; AppException's `{code,message}` payload passes
 * through as-is; anything else falls back to a generic 500.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request | undefined>();
    const header = request?.headers?.['x-request-id'];
    const requestId = typeof header === 'string' ? header : undefined;

    const { status, body } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `${requestId ? `[request ${requestId}] ` : ''}${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    }

    response
      .status(status)
      .json({ error: requestId ? { ...body, requestId } : body });
  }

  private normalize(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return {
          status,
          body: { code: this.codeFromStatus(status), message: res },
        };
      }

      const resObj = res as Record<string, unknown>;

      // AppException shape: { code, message }
      if (typeof resObj.code === 'string') {
        return {
          status,
          body: {
            code: resObj.code,
            message: toMessage(resObj.message, resObj.code),
          },
        };
      }

      // Nest's default validation-pipe shape: { message: string[], error, statusCode }
      if (Array.isArray(resObj.message)) {
        return {
          status,
          body: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            fields: this.groupFieldErrors(resObj.message as string[]),
          },
        };
      }

      return {
        status,
        body: {
          code: this.codeFromStatus(status),
          message: toMessage(resObj.message, 'Request failed'),
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status] ?? 'ERROR';
  }

  private groupFieldErrors(messages: string[]): Record<string, string[]> {
    const fields: Record<string, string[]> = {};
    for (const msg of messages) {
      const [field] = msg.split(' ');
      fields[field] = fields[field] ?? [];
      fields[field].push(msg);
    }
    return fields;
  }
}
