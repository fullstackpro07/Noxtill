import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsContextService } from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { PROJECT_ERRORS } from './projects.constants';

/** Comments & Activity: project comments (with @mentions) merged with the system event feed. */
@Injectable()
export class ProjectActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
  ) {}

  async feed(actor: AuthenticatedUser) {
    const L = await this.loader.load(actor);
    const visible = new Set(L.projects.map((p) => p.id));
    const me = L.acc.personId;
    const myName = L.people.find((p) => p.id === me)?.name ?? '';
    const [events, comments] = await Promise.all([
      this.prisma.projectActivity.findMany({
        where: {
          businessId: this.ctx.businessId(),
          event: { not: 'system.daily' },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      this.prisma.projectComment.findMany({
        where: { businessId: this.ctx.businessId() },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    const tasks = new Map(L.tasks.map((t) => [t.id, t]));
    const projectName = new Map(L.projects.map((p) => [p.id, p.name]));
    const items = [
      ...comments
        .filter((c) => visible.has(c.projectId))
        .map((c) => ({
          id: 'c:' + c.id,
          kind: 'comment' as const,
          who: c.authorName + (c.portalAuthor ? ' (client)' : ''),
          what: `commented on ${c.taskId ? (tasks.get(c.taskId)?.title ?? 'a task') : (projectName.get(c.projectId) ?? 'a project')}`,
          body: c.body,
          ev: 'comment.created',
          when: c.createdAt.toISOString(),
          projectId: c.projectId,
          taskId: c.taskId,
          edited: !!c.editedAt,
          mentionsMe:
            !!me &&
            ((Array.isArray(c.mentions) &&
              (c.mentions as string[]).includes(me)) ||
              (!!myName && c.body.includes('@' + myName))),
        })),
      ...events
        .filter(
          (e) =>
            (!e.projectId || visible.has(e.projectId)) &&
            e.event !== 'comment.created',
        )
        .map((e) => ({
          id: 'e:' + e.id,
          kind: 'event' as const,
          who: e.actorName,
          what: e.text,
          body: '',
          ev: e.event,
          when: e.createdAt.toISOString(),
          projectId: e.projectId,
          taskId: e.taskId,
          edited: false,
          mentionsMe: false,
        })),
    ].sort((a, b) => b.when.localeCompare(a.when));
    return {
      items: items.slice(0, 300),
      people: L.people
        .filter((p) => p.active && p.id !== me)
        .map((p) => p.name),
    };
  }

  async post(actor: AuthenticatedUser, projectId: string, body: string) {
    const p = await this.loader.project(projectId);
    const text = (body ?? '').trim();
    if (!text)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Write an update first.',
        HttpStatus.BAD_REQUEST,
      );
    const name = await this.ctx.actorName(actor);
    const people = await this.ctx.people();
    const mentioned = people.filter(
      (x) => x.active && text.includes('@' + x.name),
    );
    await this.ctx.db.projectComment.create({
      data: {
        businessId: this.ctx.businessId(),
        projectId,
        authorUserId: actor.sub,
        authorName: name,
        body: text.slice(0, 5000),
        mentions: mentioned.map((m) => m.id),
      },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { lastActivityAt: new Date() },
    });
    for (const m of mentioned)
      await this.ctx.notifyPerson(
        m.id,
        'Mentioned',
        {
          title: `${name} mentioned you on ${p.name}`,
          body: text.slice(0, 140),
          link: '/projects/activity',
        },
        actor.sub,
      );
    return {
      ok: true,
      notified: mentioned.filter((m) => m.userId !== actor.sub).length,
    };
  }
}
