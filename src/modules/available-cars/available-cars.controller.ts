import { Controller } from '@nestjs/common';
import { AvailableCarsService } from './available-cars.service';

@Controller('available-cars')
export class AvailableCarsController {
  constructor(private readonly availableCarsService: AvailableCarsService) {}
}
