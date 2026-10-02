import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  BUSINESS_MODULE_ERROR_CODES,
  BusinessModulesService,
} from './business-modules.service';

class SaveSelectionDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  enabled!: string[];
}

/** Read-only for every signed-in user (the sidebar needs it); changes go through Settings → Modules. */
@Controller('business-modules')
export class BusinessModulesController {
  constructor(private readonly modules: BusinessModulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.modules.list(user.businessId);
  }

  @Patch('selection')
  async saveSelection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveSelectionDto,
  ) {
    if (user.role !== Role.owner) {
      throw new AppException(
        BUSINESS_MODULE_ERROR_CODES.OWNER_REQUIRED,
        'Only the business owner can change module selection.',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      disabled: await this.modules.setSelection(user.businessId, dto.enabled),
    };
  }
}
