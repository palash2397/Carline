import { Module } from '@nestjs/common';
import { AvailableCarsService } from './available-cars.service';
import { AvailableCarsController } from './available-cars.controller';

@Module({
  controllers: [AvailableCarsController],
  providers: [AvailableCarsService],
})
export class AvailableCarsModule {}
