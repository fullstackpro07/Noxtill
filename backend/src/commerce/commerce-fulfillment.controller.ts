import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommerceFulfillmentNodeStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CreateCommerceFulfillmentNodeDto,
  DisableCommerceFulfillmentNodeDto,
  UpdateCommerceFulfillmentNodeDto,
  UpsertCommerceFulfillmentMappingDto,
} from './dto/commerce-fulfillment.dto';
import { CommerceFulfillmentService } from './commerce-fulfillment.service';

@Controller('commerce/fulfillment-network')
export class CommerceFulfillmentController {
  constructor(private readonly fulfillment: CommerceFulfillmentService) {}

  @Get('nodes')
  listNodes(@CurrentUser() user: AuthenticatedUser) {
    return this.fulfillment.listNodes(user.businessId);
  }

  @Get('branches')
  branches(@CurrentUser() user: AuthenticatedUser) {
    return this.fulfillment.branches(user.businessId);
  }

  @Get('coverage')
  coverage(@CurrentUser() user: AuthenticatedUser) {
    return this.fulfillment.coverage(user.businessId);
  }

  @Get('audit')
  audit(
    @CurrentUser() user: AuthenticatedUser,
    @Query('nodeId') nodeId?: string,
  ) {
    return this.fulfillment.audit(user.businessId, nodeId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('nodes')
  createNode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceFulfillmentNodeDto,
  ) {
    return this.fulfillment.createNode(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('nodes/:id')
  updateNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommerceFulfillmentNodeDto,
  ) {
    return this.fulfillment.updateNode(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('nodes/:id/disable')
  disableNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisableCommerceFulfillmentNodeDto,
  ) {
    return this.fulfillment.setNodeStatus(
      user.businessId,
      user.sub,
      id,
      CommerceFulfillmentNodeStatus.disabled,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('nodes/:id/enable')
  enableNode(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.fulfillment.setNodeStatus(
      user.businessId,
      user.sub,
      id,
      CommerceFulfillmentNodeStatus.active,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('mappings')
  upsertMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCommerceFulfillmentMappingDto,
  ) {
    return this.fulfillment.upsertMapping(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Delete('mappings/:id')
  removeMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.fulfillment.removeMapping(user.businessId, user.sub, id);
  }
}
