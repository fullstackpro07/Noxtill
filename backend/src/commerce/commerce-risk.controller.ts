import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommerceRiskCaseStatus, CommerceRiskRuleKey } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CommerceComplianceDocumentFieldsDto,
  CreateCommerceComplianceDocumentDto,
  SetCommerceMarketEligibilityDto,
  SetCommerceRiskCaseStatusDto,
  UpdateCommerceRiskRuleDto,
} from './dto/commerce-risk.dto';
import { CommerceRiskService } from './commerce-risk.service';

@Controller('commerce/risk-compliance')
export class CommerceRiskController {
  constructor(private readonly risk: CommerceRiskService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.summary(user.businessId);
  }

  @Get('rules')
  rules(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.rules(user.businessId);
  }

  @Get('cases')
  cases(
    @CurrentUser() user: AuthenticatedUser,
    @Query(
      'status',
      new ParseEnumPipe(CommerceRiskCaseStatus, { optional: true }),
    )
    status?: CommerceRiskCaseStatus,
  ) {
    return this.risk.listCases(user.businessId, status);
  }

  @Get('documents')
  documents(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.listDocuments(user.businessId);
  }

  @Get('eligibility')
  eligibility(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.listEligibility(user.businessId);
  }

  @Get('audit/:entityType/:entityId')
  audit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.risk.auditLog(user.businessId, entityType, entityId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('checks/run')
  runChecks(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.runChecks(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('rules/:key')
  updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key', new ParseEnumPipe(CommerceRiskRuleKey))
    key: CommerceRiskRuleKey,
    @Body() dto: UpdateCommerceRiskRuleDto,
  ) {
    return this.risk.updateRule(user.businessId, user.sub, key, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('cases/:id/status')
  setCaseStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetCommerceRiskCaseStatusDto,
  ) {
    return this.risk.setCaseStatus(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('documents')
  createDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceComplianceDocumentDto,
  ) {
    return this.risk.createDocument(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('documents/:id')
  updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceComplianceDocumentFieldsDto,
  ) {
    return this.risk.updateDocument(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('documents/:id/archive')
  archiveDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.risk.archiveDocument(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Put('eligibility')
  setEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetCommerceMarketEligibilityDto,
  ) {
    return this.risk.setEligibility(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Delete('eligibility/:id')
  removeEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.risk.removeEligibility(user.businessId, user.sub, id);
  }
}
