import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommerceSupplierClaimStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  AddCommerceSupplierClaimEvidenceDto,
  CommerceSupplierClaimActionDto,
  CreateCommerceSupplierClaimDto,
  RecordCommerceSupplierClaimCommunicationDto,
  RecordCommerceSupplierClaimSettlementDto,
} from './dto/commerce-supplier-claim.dto';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';

@Controller('commerce/supplier-claims')
export class CommerceSupplierClaimsController {
  constructor(private readonly claims: CommerceSupplierClaimsService) {}

  @Get('loss-patterns')
  lossPatterns(@CurrentUser() user: AuthenticatedUser) {
    return this.claims.lossPatterns(user.businessId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: CommerceSupplierClaimStatus,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.claims.list(user.businessId, { status, supplierId });
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceSupplierClaimDto,
  ) {
    return this.claims.create(user.businessId, user.sub, dto);
  }

  @Get(':id/audit')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claims.history(user.businessId, id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.claims.getOne(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/evidence/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddCommerceSupplierClaimEvidenceDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.claims.uploadEvidence(user.businessId, user.sub, id, dto, file);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceSupplierClaimActionDto,
  ) {
    return this.claims.submit(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceSupplierClaimActionDto,
  ) {
    return this.claims.acknowledge(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceSupplierClaimActionDto,
  ) {
    return this.claims.reject(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceSupplierClaimActionDto,
  ) {
    return this.claims.close(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/communications')
  recordCommunication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordCommerceSupplierClaimCommunicationDto,
  ) {
    return this.claims.recordCommunication(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/settlements')
  recordSettlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordCommerceSupplierClaimSettlementDto,
  ) {
    return this.claims.recordSettlement(user.businessId, user.sub, id, dto);
  }
}
