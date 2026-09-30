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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import { Audited } from '../../common/decorators/audited.decorator';
import {
  CreateWorkflowVariableDto,
  ListWorkflowVariablesDto,
  UpdateWorkflowVariableDto,
} from './dto/workflow-variable.dto';
import { WorkflowVariablesService } from './workflow-variables.service';

@Controller('workflows/variables')
@RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
export class WorkflowVariablesController {
  constructor(private readonly variables: WorkflowVariablesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWorkflowVariablesDto,
  ) {
    return this.variables.list(user.businessId, query);
  }

  @Post()
  @Audited('create', 'workflow-variable')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowVariableDto,
  ) {
    return this.variables.create(user.businessId, user.sub, dto);
  }

  @Patch(':id')
  @Audited('update', 'workflow-variable')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowVariableDto,
  ) {
    return this.variables.update(user.businessId, user.sub, id, dto);
  }

  @Delete(':id')
  @Audited('delete', 'workflow-variable')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.variables.remove(user.businessId, id);
  }
}
