import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ProjectPortalService } from './project-portal.service';
import {
  DecisionDto,
  PortalMessageDto,
  PortalTokenDto,
} from './dto/projects.dto';

/**
 * Public client portal. No staff auth: the invite token (then a short-lived session) identifies
 * the client and the one project they may see. Every response is the client-safe view.
 */
@Public()
@Controller('portal/projects')
export class ProjectPortalPublicController {
  constructor(private readonly portal: ProjectPortalService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('redeem')
  redeem(@Body() dto: PortalTokenDto) {
    return this.portal.redeem(dto.token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  verify(@Body() dto: PortalTokenDto) {
    return this.portal.verify(dto.token, dto.code ?? '');
  }

  @Get('view')
  view(@Headers('x-portal-session') session?: string) {
    return this.portal.publicView(session);
  }

  @Post('approvals/:id/decide')
  decide(
    @Headers('x-portal-session') session: string | undefined,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.portal.publicDecide(session, id, dto.decision, dto.comment);
  }

  @Get('files/:id/download')
  download(
    @Headers('x-portal-session') session: string | undefined,
    @Param('id') id: string,
  ) {
    return this.portal.publicDownload(session, id);
  }

  @Post('messages')
  message(
    @Headers('x-portal-session') session: string | undefined,
    @Body() dto: PortalMessageDto,
  ) {
    return this.portal.publicMessage(session, dto.body);
  }
}
