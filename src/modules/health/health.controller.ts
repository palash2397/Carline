import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness Probe (Kubernetes / Docker / PM2)' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness Probe (Checks MongoDB & Dependencies)' })
  @ApiResponse({ status: 200, description: 'Service is ready to accept traffic' })
  @ApiResponse({ status: 503, description: 'Service dependencies are degraded' })
  async getReadiness() {
    const report = await this.healthService.getReadiness();
    if (report.status !== 'READY') {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Runtime Performance Telemetry (SRE Observability)' })
  @ApiResponse({ status: 200, description: 'System telemetry metrics' })
  async getMetrics() {
    return this.healthService.getMetrics();
  }
}
