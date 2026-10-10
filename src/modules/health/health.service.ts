import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  // Liveness check (very lightweight)
  getLiveness() {
    return {
      status: 'UP',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  // Readiness check (validates database availability)
  async getReadiness() {
    const mongoState = this.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const isDbConnected = mongoState === 1;

    let dbLatencyMs = -1;
    let dbError = null;

    if (isDbConnected && this.connection.db) {
      const pingStart = process.hrtime.bigint();
      try {
        await this.connection.db.admin().ping();
        const pingEnd = process.hrtime.bigint();
        dbLatencyMs = Number((pingEnd - pingStart) / BigInt(1e6));
      } catch (err: any) {
        dbError = err?.message || 'Database ping failed';
        this.logger.error('Database ping failed:', err);
      }
    }

    const isHealthy = isDbConnected && dbLatencyMs >= 0;

    return {
      status: isHealthy ? 'READY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      dependencies: {
        database: {
          status: isDbConnected ? 'UP' : 'DOWN',
          stateCode: mongoState,
          latencyMs: dbLatencyMs,
          error: dbError,
        },
      },
    };
  }

  // Detailed telemetry metrics for SRE & Performance Monitoring
  async getMetrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    // Event loop lag measurement
    const lagStart = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    const eventLoopLagMs = Date.now() - lagStart;

    const readiness = await this.getReadiness();

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
        externalMb: Number((mem.external / 1024 / 1024).toFixed(2)),
      },
      cpu: {
        userMicroseconds: cpu.user,
        systemMicroseconds: cpu.system,
      },
      eventLoop: {
        lagMs: eventLoopLagMs,
        healthy: eventLoopLagMs < 100, // Alert threshold if lag exceeds 100ms
      },
      database: readiness.dependencies.database,
    };
  }
}
