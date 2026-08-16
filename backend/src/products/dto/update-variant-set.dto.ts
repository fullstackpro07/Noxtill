import { PartialType } from '@nestjs/mapped-types';
import { CreateVariantSetDto } from './create-variant-set.dto';

export class UpdateVariantSetDto extends PartialType(CreateVariantSetDto) {}
