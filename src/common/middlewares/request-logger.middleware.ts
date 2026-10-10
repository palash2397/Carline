import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = process.hrtime.bigint();

    // Assign or propagate correlation ID
    const requestId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Capture response completion
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number((endTime - startTime) / BigInt(1e6));

      const contentLength = res.getHeader('content-length') || 0;
      const statusCode = res.statusCode;

      // Extract client IP safely
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        'unknown';

      // Skip logging verbose health checks unless there's an error
      if (req.originalUrl?.includes('/health') && statusCode < 400) {
        return;
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
        type: 'ACCESS_LOG',
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        responseSizeBytes: Number(contentLength) || 0,
        clientIp,
        userAgent: req.headers['user-agent'] || 'unknown',
      };

      if (statusCode >= 500) {
        this.logger.error(JSON.stringify(logEntry));
      } else if (statusCode >= 400) {
        this.logger.warn(JSON.stringify(logEntry));
      } else {
        this.logger.log(JSON.stringify(logEntry));
      }
    });

    next();
  }
}
