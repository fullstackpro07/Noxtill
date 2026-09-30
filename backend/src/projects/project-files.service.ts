import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { S3Service } from '../common/storage/s3.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsContextService } from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import {
  FILE_ALLOWED_MIME,
  FILE_MAX_BYTES,
  PROJECT_ERRORS,
} from './projects.constants';

export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const ACCESS = ['client_shared', 'internal', 'private'];

@Injectable()
export class ProjectFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
    private readonly s3: S3Service,
  ) {}

  /** Project files the actor may see: private files only with "View private files" or your own. */
  async list(actor: AuthenticatedUser) {
    const L = await this.loader.load(actor);
    const visible = new Set(L.projects.map((p) => p.id));
    const files = await this.prisma.projectFile.findMany({
      where: { businessId: this.ctx.businessId(), archivedAt: null },
      include: { versions: { orderBy: { n: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    const canPrivate = L.acc.can['View private files'];
    return files
      .filter((f) => visible.has(f.projectId))
      .filter(
        (f) =>
          f.access !== 'private' ||
          canPrivate ||
          f.versions.some((v) => v.uploadedById === actor.sub),
      )
      .map((f) => this.row(f));
  }

  private row(f: {
    id: string;
    projectId: string;
    name: string;
    ext: string;
    folder: string;
    access: string;
    pinned: boolean;
    linkType: string;
    linkId: string | null;
    updatedAt: Date;
    versions: Array<{
      n: number;
      note: string;
      uploadedBy: string;
      createdAt: Date;
      sizeBytes: number;
      mimeType: string;
    }>;
  }) {
    const cur = f.versions[0];
    return {
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      ext: f.ext,
      folder: f.folder,
      access: f.access,
      pinned: f.pinned,
      linkType: f.linkType,
      linkId: f.linkId,
      by: cur?.uploadedBy ?? '—',
      size: cur?.sizeBytes ?? 0,
      mime: cur?.mimeType ?? '',
      version: cur?.n ?? 1,
      modified: (cur?.createdAt ?? f.updatedAt).toISOString(),
      versions: f.versions.map((v) => ({
        n: v.n,
        note: v.note,
        by: v.uploadedBy,
        when: v.createdAt.toISOString(),
        size: v.sizeBytes,
      })),
    };
  }

  async upload(
    actor: AuthenticatedUser,
    file: UploadedFileLike | undefined,
    input: {
      projectId: string;
      folder?: string;
      access?: string;
      linkType?: string;
      linkId?: string;
      fileId?: string;
      note?: string;
    },
  ) {
    await this.perms.assert(actor, 'Manage files');
    if (!file)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Choose a file to upload.',
        HttpStatus.BAD_REQUEST,
      );
    await validateUploadedFile(file, {
      allowedMimeTypes: FILE_ALLOWED_MIME,
      maxSizeBytes: FILE_MAX_BYTES,
    });
    const name = (file.originalname || 'file')
      .replace(/[\\/]/g, '_')
      .slice(0, 255);
    const extRaw = (
      name.includes('.') ? name.split('.').pop()! : 'FILE'
    ).toUpperCase();
    const ext = extRaw.slice(0, 10);
    const who = await this.ctx.actorName(actor);
    const key = `projects/${this.ctx.businessId()}/${randomUUID()}${name.includes('.') ? '.' + extRaw.toLowerCase().slice(0, 10) : ''}`;

    if (input.fileId) {
      const existing = await this.file(input.fileId);
      const last = await this.prisma.projectFileVersion.findFirst({
        where: { fileId: existing.id },
        orderBy: { n: 'desc' },
      });
      await this.s3.upload(key, file.buffer, file.mimetype);
      await this.ctx.db.projectFileVersion.create({
        data: {
          businessId: this.ctx.businessId(),
          fileId: existing.id,
          n: (last?.n ?? 0) + 1,
          note: (input.note || 'New version').slice(0, 255),
          storageKey: key,
          mimeType: file.mimetype.slice(0, 120),
          sizeBytes: file.size,
          uploadedById: actor.sub,
          uploadedBy: who,
        },
      });
      await this.ctx.db.projectFile.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
      await this.ctx.activity(
        actor,
        'file.uploaded',
        `uploaded a new version of ${existing.name}`,
        { projectId: existing.projectId },
      );
      return { id: existing.id };
    }

    const p = await this.loader.project(input.projectId);
    await this.s3.upload(key, file.buffer, file.mimetype);
    const created = await this.ctx.db.projectFile.create({
      data: {
        businessId: this.ctx.businessId(),
        projectId: p.id,
        name,
        ext,
        folder: (input.folder || 'Uploads').slice(0, 60),
        access: ACCESS.includes(input.access ?? '')
          ? input.access!
          : 'internal',
        linkType: ['project', 'task', 'milestone'].includes(
          input.linkType ?? '',
        )
          ? input.linkType!
          : 'project',
        linkId: input.linkId || null,
        versions: {
          create: {
            businessId: this.ctx.businessId(),
            n: 1,
            note: (input.note || 'Uploaded').slice(0, 255),
            storageKey: key,
            mimeType: file.mimetype.slice(0, 120),
            sizeBytes: file.size,
            uploadedById: actor.sub,
            uploadedBy: who,
          },
        },
      },
    });
    await this.ctx.activity(
      actor,
      'file.uploaded',
      `uploaded ${name} to ${p.name}`,
      { projectId: p.id },
    );
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: p.id },
      select: { businessUserId: true },
    });
    for (const m of members)
      await this.ctx.notifyPerson(
        m.businessUserId,
        'File uploaded',
        { title: `New file on ${p.name}`, body: name, link: '/projects/files' },
        actor.sub,
      );
    return { id: created.id };
  }

  async file(id: string) {
    const f = await this.prisma.projectFile.findUnique({ where: { id } });
    if (!f || f.archivedAt)
      throw new AppException(
        PROJECT_ERRORS.FILE_NOT_FOUND,
        'File not found',
        HttpStatus.NOT_FOUND,
      );
    await this.loader.project(f.projectId);
    return f;
  }

  async restore(actor: AuthenticatedUser, id: string, n: number) {
    await this.perms.assert(actor, 'Manage files');
    const f = await this.file(id);
    const versions = await this.prisma.projectFileVersion.findMany({
      where: { fileId: id },
      orderBy: { n: 'desc' },
    });
    const src = versions.find((v) => v.n === n);
    if (!src)
      throw new AppException(
        PROJECT_ERRORS.FILE_NOT_FOUND,
        `Version ${n} not found`,
        HttpStatus.NOT_FOUND,
      );
    const who = await this.ctx.actorName(actor);
    await this.ctx.db.projectFileVersion.create({
      data: {
        businessId: this.ctx.businessId(),
        fileId: id,
        n: versions[0].n + 1,
        note: `Restored from v${n}`,
        storageKey: src.storageKey,
        mimeType: src.mimeType,
        sizeBytes: src.sizeBytes,
        uploadedById: actor.sub,
        uploadedBy: who,
      },
    });
    await this.ctx.activity(
      actor,
      'file.updated',
      `restored ${f.name} from v${n}`,
      { projectId: f.projectId },
    );
    return { ok: true };
  }

  async setAccess(actor: AuthenticatedUser, id: string, access: string) {
    await this.perms.assert(actor, 'Manage files');
    if (!ACCESS.includes(access))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Unknown access level.',
        HttpStatus.BAD_REQUEST,
      );
    const f = await this.file(id);
    await this.ctx.db.projectFile.update({ where: { id }, data: { access } });
    await this.ctx.activity(
      actor,
      'file.updated',
      `changed access on ${f.name} to ${access === 'client_shared' ? 'Client shared' : access === 'private' ? 'Private' : 'Internal'}`,
      { projectId: f.projectId },
    );
    await this.ctx.auditLog(
      'project_file.access_changed',
      'ProjectFile',
      id,
      { access: f.access },
      { access },
    );
    return { ok: true };
  }

  /** Folder and what the file is linked to (the project, one of its tasks, or a milestone). */
  async setMeta(
    actor: AuthenticatedUser,
    id: string,
    input: { folder?: string; linkType?: string; linkId?: string | null },
  ) {
    await this.perms.assert(actor, 'Manage files');
    const f = await this.file(id);
    const data: { folder?: string; linkType?: string; linkId?: string | null } =
      {};
    if (input.folder !== undefined) {
      const folder = input.folder.trim().slice(0, 60);
      if (!folder)
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Folder name can’t be empty.',
          HttpStatus.BAD_REQUEST,
        );
      data.folder = folder;
    }
    if (input.linkType !== undefined) {
      if (input.linkType === 'project') {
        data.linkType = 'project';
        data.linkId = null;
      } else if (input.linkType === 'task' || input.linkType === 'milestone') {
        const ok =
          input.linkType === 'task'
            ? await this.prisma.projectTask.count({
                where: { id: input.linkId ?? '', projectId: f.projectId },
              })
            : await this.prisma.projectMilestone.count({
                where: { id: input.linkId ?? '', projectId: f.projectId },
              });
        if (!ok)
          throw new AppException(
            PROJECT_ERRORS.INVALID,
            'Link the file to a task or milestone on the same project.',
            HttpStatus.BAD_REQUEST,
          );
        data.linkType = input.linkType;
        data.linkId = input.linkId!;
      }
    }
    await this.ctx.db.projectFile.update({ where: { id }, data });
    await this.ctx.activity(actor, 'file.updated', `updated ${f.name}`, {
      projectId: f.projectId,
    });
    return { ok: true };
  }

  async togglePin(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Manage files');
    const f = await this.file(id);
    await this.ctx.db.projectFile.update({
      where: { id },
      data: { pinned: !f.pinned },
    });
    return { pinned: !f.pinned };
  }

  async archive(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Manage files');
    const f = await this.file(id);
    await this.ctx.db.projectFile.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.ctx.activity(actor, 'file.archived', `archived ${f.name}`, {
      projectId: f.projectId,
    });
    return { ok: true };
  }

  async downloadUrl(actor: AuthenticatedUser, id: string, n?: number) {
    const f = await this.file(id);
    const acc = await this.perms.access(actor);
    const v = await this.prisma.projectFileVersion.findFirst({
      where: { fileId: id, ...(n ? { n } : {}) },
      orderBy: { n: 'desc' },
    });
    if (!v)
      throw new AppException(
        PROJECT_ERRORS.FILE_NOT_FOUND,
        'File has no stored version',
        HttpStatus.NOT_FOUND,
      );
    if (
      f.access === 'private' &&
      !acc.can['View private files'] &&
      v.uploadedById !== actor.sub
    ) {
      throw new AppException(
        PROJECT_ERRORS.FORBIDDEN,
        'This file is private.',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      url: await this.s3.getSignedDownloadUrl(v.storageKey, 3600),
      name: f.name,
    };
  }
}
