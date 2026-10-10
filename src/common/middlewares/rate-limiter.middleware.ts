import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface ClientTraffic {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  // In-memory sliding window counter per IP
  private readonly clients = new Map<string, ClientTraffic>();
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly maxRequestsPerMinute = 300; // 300 req/min per IP (ample for normal users/telephony, blocks rogue hammering)

  constructor() {
    // Run garbage collection every 2 minutes to prevent unbounded memory growth
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [ip, traffic] of this.clients.entries()) {
        if (now > traffic.resetTime) {
          this.clients.delete(ip);
        }
      }
    }, 2 * 60 * 1000);

    // Unref so timer doesn't prevent process exit
    if (cleanupInterval.unref) {
      cleanupInterval.unref();
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Exclude health checks from rate limiting
    if (req.originalUrl?.includes('/health')) {
      return next();
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown-client';

    const now = Date.now();
    let traffic = this.clients.get(clientIp);

    if (!traffic || now > traffic.resetTime) {
      traffic = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.clients.set(clientIp, traffic);
    } else {
      traffic.count++;
    }

    const remaining = Math.max(0, this.maxRequestsPerMinute - traffic.count);
    res.setHeader('X-RateLimit-Limit', this.maxRequestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(traffic.resetTime / 1000));

    if (traffic.count > this.maxRequestsPerMinute) {
      res.setHeader('Retry-After', Math.ceil((traffic.resetTime - now) / 1000));
      return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        success: false,
        message: 'Rate limit exceeded. Please retry after a brief pause.',
        retryAfterSeconds: Math.ceil((traffic.resetTime - now) / 1000),
      });
    }

    next();
  }
}
