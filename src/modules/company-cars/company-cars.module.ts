import { Module } from '@nestjs/common';
import { CompanyCarsService } from './company-cars.service';
import { CompanyCarsController } from './company-cars.controller';

@Module({
  controllers: [CompanyCarsController],
  providers: [CompanyCarsService],
})
export class CompanyCarsModule {}
