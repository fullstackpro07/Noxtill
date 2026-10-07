import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { WebsiteFormsService } from './website-forms.service';
import { WebsitePublicService } from './website-public.service';
import { PublicFormSubmitDto, RenderQueryDto } from './website.dto';

/** Visitor-facing endpoints for the hosted site. No auth; each resolves its business explicitly. */
@Controller('public/website')
export class WebsitePublicController {
  constructor(
    private readonly publicSite: WebsitePublicService,
    private readonly forms: WebsiteFormsService,
  ) {}

  @Public()
  @Get(':slug')
  render(@Param('slug') slug: string, @Query() query: RenderQueryDto) {
    return this.publicSite.render(slug, query.path ?? '/', query.q);
  }

  @Public()
  @Get('forms/:token')
  async form(@Param('token') token: string) {
    const form = await this.forms.publicForm(token);
    if (!form) throw new NotFoundException('Form not available');
    return form;
  }

  // Each accepted submission writes a CRM customer, so allow far fewer than the global 120/min.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('forms/:token/submit')
  submit(@Param('token') token: string, @Body() dto: PublicFormSubmitDto) {
    return this.forms.submit(token, dto);
  }
}
