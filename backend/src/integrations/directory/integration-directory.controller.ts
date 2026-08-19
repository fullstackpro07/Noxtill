import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { IntegrationDirectoryService } from './integration-directory.service';

@Controller('integrations/directory')
export class IntegrationDirectoryController {
  constructor(private readonly directory: IntegrationDirectoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.directory.list(user.businessId);
  }
}
