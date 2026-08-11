import { Controller } from '@nestjs/common';
import { CompanyCarsService } from './company-cars.service';

@Controller('company-cars')
export class CompanyCarsController {
  constructor(private readonly companyCarsService: CompanyCarsService) {}
}
