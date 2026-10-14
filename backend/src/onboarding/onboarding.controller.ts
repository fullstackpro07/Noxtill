import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OnboardingService } from './onboarding.service';
import {
  ImproveDescriptionDto,
  ModulesDto,
  SaveDraftDto,
  ScreenDto,
} from './dto/onboarding.dto';

/** Auth & Onboarding Steps 2–5 + module management. Auth/tenancy come from the global guards. */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('catalog')
  catalog() {
    return this.onboarding.catalog();
  }

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.get(user);
  }

  @Put('draft')
  saveDraft(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveDraftDto) {
    return this.onboarding.saveDraft(user, dto.draft, dto.screen);
  }

  @Put('screen')
  setScreen(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScreenDto) {
    return this.onboarding.setScreen(user, dto.screen);
  }

  @Post('improve-description')
  @HttpCode(HttpStatus.OK)
  improveDescription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImproveDescriptionDto,
  ) {
    return this.onboarding.improveDescription(user, dto);
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.startAnalysis(user);
  }

  @Post('selection')
  @HttpCode(HttpStatus.OK)
  saveSelection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ModulesDto,
  ) {
    return this.onboarding.saveSelection(user, dto.modules);
  }

  @Post('provision')
  @HttpCode(HttpStatus.OK)
  provision(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.startProvisioning(user);
  }

  @Get('modules')
  listModules(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.listModules(user);
  }

  @Put('modules')
  setModules(@CurrentUser() user: AuthenticatedUser, @Body() dto: ModulesDto) {
    return this.onboarding.setModules(user, dto.modules);
  }
}
