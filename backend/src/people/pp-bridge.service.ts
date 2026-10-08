import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CtActor } from '../contracts/ct-context.service';
import { CtDocsService } from '../contracts/ct-docs.service';
import { CtEsignService } from '../contracts/ct-esign.service';
import { CtFilesService, Upload } from '../contracts/ct-files.service';
import { ProjectTasksService } from '../projects/project-tasks.service';
import { EmailService } from '../messaging/channels/email.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { S3Service } from '../common/storage/s3.service';
import { PpActor, PpContextService, ppErr } from './pp-context.service';
import { PP_ERRORS } from './pp.constants';

export interface Sent {
  ok: boolean;
  error: string | null;
}

/**
 * Hand-offs to the modules that own the real thing: documents and eSign live in Contracts (People
 * files resumes, offer letters, certificates and exit letters there, linked to “People & Payroll”),
 * tasks live in Projects & Tasks, candidate email goes through the configured email provider, and
 * payslip PDFs are rendered by the shared PDF renderer.
 */
@Injectable()
export class PpBridgeService {
  private readonly log = new Logger(PpBridgeService.name);

  constructor(
    private readonly ctx: PpContextService,
    private readonly docs: CtDocsService,
    private readonly esign: CtEsignService,
    private readonly files: CtFilesService,
    private readonly tasks: ProjectTasksService,
    private readonly email: EmailService,
    private readonly pdf: PdfRendererService,
    private readonly s3: S3Service,
  ) {}

  /** People acts in Contracts on the HR user's behalf, for People-owned records only. */
  private ct(a: PpActor): CtActor {
    return {
      userId: a.userId,
      name: a.name,
      roleLabel: `${a.roleLabel} via People & Payroll`,
      owner: a.owner,
      rootId: a.rootId,
      businessId: a.businessId,
      upload: true,
      documents: true,
      delete: false,
      manage: true,
      approve: false,
      terminate: false,
      evidence: false,
      compliance: false,
      value: false,
      restricted: true,
      export: false,
      settings: false,
      branches: null,
      contracts: true,
      user: a.user,
    };
  }

  /** Files a document in Contracts › Documents, linked to a People record. */
  async fileDoc(
    a: PpActor,
    o: {
      title: string;
      type: string;
      linkId: string;
      file?: Upload | null;
      text?: { name: string; body: string };
      sensitivity?: string;
      expiresOn?: string | null;
      description?: string;
    },
  ) {
    const stored = o.file
      ? await this.files.store(a.rootId, null, o.file)
      : o.text
        ? await this.files.storeText(a.rootId, o.text.name, o.text.body)
        : null;
    if (!stored) throw ppErr(PP_ERRORS.INVALID, 'Nothing to file.');
    const [d] = await this.docs.create(
      this.ct(a),
      {
        title: o.title.slice(0, 250),
        type: o.type,
        linkModule: 'People & Payroll',
        linkId: o.linkId,
        sensitivity: o.sensitivity ?? 'Confidential',
        expiresOn: o.expiresOn ?? null,
        description: o.description,
      },
      [],
      undefined,
      { stored, status: 'Ready', note: 'Filed from People & Payroll' },
    );
    return d;
  }

  async docLink(a: PpActor, docId: string) {
    return this.docs.download(this.ct(a), docId);
  }

  /** Prepares and sends a Noxtill eSign request for a Contracts document. */
  async sign(
    a: PpActor,
    docId: string,
    signer: { name: string; email: string },
    deadline: string,
  ) {
    const r = await this.esign.prepare(this.ct(a), {
      docId,
      signers: [{ name: signer.name, email: signer.email, role: 'Employee' }],
      order: 'Sequential',
      deadline,
      send: true,
    });
    const req = await this.esign.load(a.rootId, r.number);
    return {
      id: req?.id ?? null,
      number: r.number,
      status: req?.status ?? 'Prepared',
      failed: !!req?.signers.some((s) => s.status === 'Delivery Failed'),
    };
  }

  async signStatus(rootId: string, id: string) {
    const r = await this.esign.load(rootId, id);
    if (!r) return null;
    const s = r.signers[0];
    return {
      status: r.status,
      signer: s?.status ?? null,
      viewedAt: s?.viewedAt ?? null,
      signedAt: s?.signedAt ?? null,
      declineReason: s?.declineReason ?? null,
    };
  }

  async voidSign(a: PpActor, id: string, reason: string) {
    try {
      await this.esign.void(this.ct(a), id, reason);
    } catch (e) {
      this.log.warn(`void ${id}: ${(e as Error).message}`);
    }
  }

  /** A real task in Projects & Tasks (the configured People project in the current business). */
  async task(
    a: PpActor,
    projectId: string | null,
    title: string,
    assigneeUserId: string | null,
    due: string | null,
    ref: string,
  ) {
    if (!projectId)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        'NOT_CONFIGURED — choose a Projects & Tasks project for HR tasks in People settings › Checklists & tasks.',
        HttpStatus.BAD_REQUEST,
      );
    const p = await this.ctx.db.project.findFirst({
      where: { id: projectId },
      select: { businessId: true, name: true },
    });
    if (!p)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        'The HR tasks project no longer exists — pick another in People settings.',
      );
    if (p.businessId !== a.user.businessId)
      throw ppErr(
        PP_ERRORS.INVALID,
        `The HR tasks project “${p.name}” belongs to another branch — switch to that branch to create tasks.`,
      );
    const bu = assigneeUserId
      ? await this.ctx.db.businessUser.findFirst({
          where: {
            userId: assigneeUserId,
            businessId: a.user.businessId,
            active: true,
          },
          select: { id: true },
        })
      : null;
    const t = await this.tasks.create(a.user, {
      projectId,
      title: title.slice(0, 255),
      assigneeId: bu?.id ?? null,
      dueDate: due,
      description: `From People & Payroll · ${ref}`,
    });
    return { id: t.id, number: t.number };
  }

  async taskStates(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await this.ctx.db.projectTask.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    return new Map(rows.map((r) => [r.id, r.status]));
  }

  async mail(
    businessId: string,
    to: string,
    text: string,
    templateKey: string,
  ): Promise<Sent> {
    try {
      await this.email.send({
        to,
        text,
        templateKey,
        locale: 'en',
        businessId,
      });
      return { ok: true, error: null };
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string };
      return {
        ok: false,
        error: err.response?.status
          ? `email provider returned ${err.response.status}`
          : (err.message ?? 'email failed'),
      };
    }
  }

  async renderPdf(html: string) {
    return this.pdf.renderPdf(html);
  }

  async upload(key: string, buf: Buffer, mime: string) {
    return this.s3.uploadAndSign(key, buf, mime);
  }

  async signed(key: string) {
    return this.s3.getSignedDownloadUrl(key, 300);
  }
}
