import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PpContextService, num, ppErr } from './pp-context.service';
import { CandIn, PpRecruitService } from './pp-recruit.service';
import { PP_ERRORS } from './pp.constants';
import { FormDataDto } from './dto/pp.dto';

const ALLOWED = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];

/**
 * Public careers page: published vacancies of one business group and the apply form. Postings
 * never include budget refs, internal notes, approval comments, or the pay range unless the
 * vacancy was published with it marked public. Applications become candidates (never CRM leads).
 */
@Public()
@Controller('public/careers')
export class PeoplePublicController {
  constructor(
    private readonly ctx: PpContextService,
    private readonly recruit: PpRecruitService,
  ) {}

  private async root(slug: string) {
    const b = await this.ctx.db.business.findUnique({
      where: { slug },
      select: { id: true, parentId: true },
    });
    if (!b) throw ppErr(PP_ERRORS.NOT_FOUND, 'Careers page not found', 404);
    const rootId = b.parentId ?? b.id;
    const cfg = await this.ctx.config(rootId);
    if (!cfg.recruiting.careersEnabled)
      throw ppErr(
        PP_ERRORS.NOT_FOUND,
        'This business isn’t hiring through Noxtill right now.',
        404,
      );
    return { rootId, cfg };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':slug')
  async page(@Param('slug') slug: string) {
    const { rootId, cfg } = await this.root(slug);
    const [biz, group, jobs] = await Promise.all([
      this.ctx.business(rootId),
      this.ctx.branches(rootId),
      this.ctx.db.ppJob.findMany({
        where: { businessId: rootId, status: 'Published' },
        orderBy: { publishedAt: 'desc' },
      }),
    ]);
    return {
      business: biz.name,
      intro: cfg.recruiting.careersIntro,
      currency: biz.currency,
      jobs: jobs.map((j) => ({
        id: j.id,
        slug: j.slug,
        title: j.title,
        department: j.department,
        location: group.find((g) => g.id === j.branchId)?.name ?? biz.name,
        address:
          group.find((g) => g.id === j.branchId)?.address ??
          biz.address ??
          null,
        workMode: j.workMode,
        employmentType: j.employmentType,
        description: j.description ?? '',
        pay:
          j.compPublic && (j.compMin != null || j.compMax != null)
            ? {
                min: j.compMin != null ? num(j.compMin) : null,
                max: j.compMax != null ? num(j.compMax) : null,
              }
            : null,
        postedAt: j.publishedAt,
      })),
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':slug/apply')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1048576 } }),
  )
  async apply(
    @Param('slug') slug: string,
    @Body() b: FormDataDto,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    const { rootId } = await this.root(slug);
    let i: CandIn;
    try {
      i = JSON.parse(b.data) as CandIn;
    } catch {
      throw ppErr(PP_ERRORS.INVALID, 'Malformed form data.');
    }
    if (i.consent !== 'Given')
      throw ppErr(
        PP_ERRORS.INVALID,
        'Please agree to the privacy notice so we can process your application.',
      );
    const job = await this.ctx.db.ppJob.findFirst({
      where: { businessId: rootId, id: i.jobId ?? '', status: 'Published' },
    });
    if (!job) throw ppErr(PP_ERRORS.INVALID, 'This vacancy is no longer open.');
    if (
      f &&
      !ALLOWED.includes((f.originalname.split('.').pop() ?? '').toLowerCase())
    )
      throw ppErr(
        PP_ERRORS.INVALID,
        `Resume must be one of: ${ALLOWED.join(', ')}.`,
      );
    const r = await this.recruit.createCand(
      null,
      rootId,
      {
        name: i.name,
        email: i.email,
        phone: i.phone,
        jobId: job.id,
        source: 'Careers page',
        consent: 'Given',
        availability: i.availability,
        expectedComp: i.expectedComp,
      },
      f
        ? {
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            buffer: f.buffer,
          }
        : null,
      true,
    );
    return { ok: true, reference: r.number };
  }
}
