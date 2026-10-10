import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Safeguard for non-HTTP contexts (e.g., websockets, microservices)
    if (!response || typeof response.status !== 'function') {
      this.logger.error('Non-HTTP exception captured:', exception);
      return;
    }

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request as any).id ||
      'req-' + Date.now().toString(36);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorResponse: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        errorResponse = res;
        message = (res as any).message || (res as any).error || message;
        if (Array.isArray(message)) {
          message = message.join(', ');
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
    }

    // Redact sensitive headers & payload
    const safeUrl = request.originalUrl || request.url;
    const clientIp =
      (request.headers['x-forwarded-for'] as string) ||
      request.socket?.remoteAddress ||
      'unknown';

    // Structured JSON log for SRE / Incident Investigation
    const logPayload = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'ERROR' : 'WARN',
      requestId,
      method: request.method,
      url: safeUrl,
      clientIp,
      status,
      errorMessage: message,
      stack:
        exception instanceof Error && status >= 500
          ? exception.stack
          : undefined,
    };

    if (status >= 500) {
      this.logger.error(JSON.stringify(logPayload));
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    // Standard sanitized response
    response.status(status).json({
      statusCode: status,
      success: false,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV !== 'production' && errorResponse
        ? { details: errorResponse }
        : {}),
    });
  }
}
