import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { IvrDispatchActionDto, IvrDriverActionDto } from './dto/ivr-action.dto';
import { IvrService } from './ivr.service';

@ApiTags('IVR Webhooks')
@Controller('ivr')
@UseGuards(ApiKeyGuard)
@ApiHeader({
  name: 'x-api-key',
  description: 'API key for IVR access',
  required: true,
})
export class IvrController {
  constructor(private readonly ivrService: IvrService) {}

  @Post('/driver/action')
  async handleDriverAction(@Body() dto: IvrDriverActionDto) {
    return this.ivrService.processDriverAction(dto);
  }

  @Post('/dispatch/action')
  async handleDispatchAction(@Body() dto: IvrDispatchActionDto) {
    return this.ivrService.processDispatchAction(dto);
  }

  @Get('/batches')
  async getOnlineBatches(@Query('queueType') queueType: string) {
    return this.ivrService.getOnlineBatches(queueType);
  }

  @Get('/driver/status/:number')
  async getDriverStatus(@Param('number') number: string) {
    return this.ivrService.getDriverStatus(number);
  }
}
