import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateRideTypeDto } from './create-ride-type.dto';

export class UpdateRideTypeDto extends PartialType(CreateRideTypeDto) {}
