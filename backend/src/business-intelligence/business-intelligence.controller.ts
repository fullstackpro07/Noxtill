import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { AskBusinessBrainDto } from './dto/ask-business-brain.dto';
import { CreateBiScenarioDto } from './dto/create-bi-scenario.dto';
import { CreateBiDiagnosisHypothesisDto } from './dto/create-bi-diagnosis-hypothesis.dto';
import { ResolveBiDiagnosisHypothesisDto } from './dto/resolve-bi-diagnosis-hypothesis.dto';

@Controller('business-intelligence')
export class BusinessIntelligenceController {
  constructor(private readonly service: BusinessIntelligenceService) {}

  @Get('overview')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user.businessId);
  }

  @Get('brain/answers')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  answers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listBrainAnswers(user.businessId);
  }

  @Get('opportunity-radar')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  opportunityRadar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.opportunityRadar(user.businessId);
  }

  @Get('diagnosis-center')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  diagnoses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listDiagnoses(
      user.businessId,
      category,
      status ?? 'new',
    );
  }

  @Post('diagnosis-center/:insightId/hypotheses')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  createDiagnosisHypothesis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('insightId') insightId: string,
    @Body() dto: CreateBiDiagnosisHypothesisDto,
  ) {
    return this.service.createDiagnosisHypothesis(
      user.businessId,
      user.sub,
      insightId,
      dto.hypothesis,
    );
  }

  @Patch('diagnosis-center/hypotheses/:hypothesisId/resolve')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  resolveDiagnosisHypothesis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('hypothesisId') hypothesisId: string,
    @Body() dto: ResolveBiDiagnosisHypothesisDto,
  ) {
    return this.service.resolveDiagnosisHypothesis(
      user.businessId,
      user.sub,
      hypothesisId,
      dto.reason,
    );
  }

  @Post('brain/ask')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AskBusinessBrainDto,
  ) {
    return this.service.askBusinessBrain(
      user.businessId,
      user.sub,
      dto.question,
    );
  }

  @Get('simulator/context')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  simulatorContext(@CurrentUser() user: AuthenticatedUser) {
    return this.service.simulatorContext(user.businessId);
  }

  @Get('simulator/scenarios')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  simulatorScenarios(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listSimulatorScenarios(user.businessId);
  }

  @Post('simulator/scenarios')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  createSimulatorScenario(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBiScenarioDto,
  ) {
    return this.service.createSimulatorScenario(user.businessId, user.sub, dto);
  }
}
