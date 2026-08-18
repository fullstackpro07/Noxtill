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
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './dto/create-workflow.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { WorkflowTriggerKey } from '@prisma/client';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflows.create(user.businessId, dto);
  }

  @Get()
  list(@Query('triggerKey') triggerKey?: WorkflowTriggerKey) {
    return this.workflows.list(triggerKey);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflows.remove(id);
  }

  @Get(':id/runs')
  listRuns(@Param('id') id: string) {
    return this.workflows.listRuns(id);
  }

  @RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
  @Post(':id/test')
  test(@Param('id') id: string) {
    return this.workflows.test(id);
  }
}
