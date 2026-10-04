import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmActor, AmContextService, amErr } from './am-context.service';
import { AM_ERRORS, FINAL_ASSET, LEVELS, LOCATION_TYPES } from './am.constants';

/** Categories, locations (below real branches), maintenance teams, PM templates and custom fields. */
@Injectable()
export class AmTaxonomyService {
  constructor(private readonly ctx: AmContextService) {}

  private get db() {
    return this.ctx.db;
  }

  // ── categories ────────────────────────────────────────────────────────

  async saveCategory(
    a: AmActor,
    id: string | null,
    b: {
      name: string;
      code: string;
      parentId?: string;
      criticality?: string;
      templateId?: string;
      warrantyType?: string;
      lifeYears?: number | null;
      description?: string;
    },
  ) {
    this.ctx.need(a, 'edit', 'Managing categories');
    if (!b.name?.trim() || !b.code?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Name and code required.');
    const code = b.code.trim().toUpperCase().slice(0, 24);
    const clash = await this.db.amCategory.findFirst({
      where: { businessId: a.rootId, code, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash)
      throw amErr(
        AM_ERRORS.DUPLICATE,
        `Code ${code} is already used.`,
        HttpStatus.CONFLICT,
      );
    if (b.criticality && !LEVELS.includes(b.criticality as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown criticality.');
    if (b.parentId) {
      if (b.parentId === id)
        throw amErr(AM_ERRORS.INVALID, 'A category can’t be its own parent.');
      const par = await this.db.amCategory.findFirst({
        where: { id: b.parentId, businessId: a.rootId },
      });
      if (!par) throw amErr(AM_ERRORS.INVALID, 'Parent category not found.');
      if (par.parentId)
        throw amErr(
          AM_ERRORS.INVALID,
          'Categories are two levels deep — pick a top-level parent.',
        );
      if (id && (await this.db.amCategory.count({ where: { parentId: id } })))
        throw amErr(
          AM_ERRORS.INVALID,
          'This category has sub-categories, so it must stay top-level.',
        );
    }
    if (
      b.templateId &&
      !(await this.db.amPmTemplate.findFirst({
        where: { id: b.templateId, businessId: a.rootId },
      }))
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'That PM template isn’t in this business.',
      );
    if (b.warrantyType) {
      const cfg = await this.ctx.config(a.rootId);
      if (!cfg.wtypes.includes(b.warrantyType))
        throw amErr(AM_ERRORS.INVALID, 'Unknown warranty type.');
    }
    const data = {
      name: b.name.trim().slice(0, 120),
      code,
      parentId: b.parentId || null,
      criticality: b.criticality || 'Medium',
      templateId: b.templateId || null,
      warrantyType: b.warrantyType || null,
      lifeYears:
        b.lifeYears && b.lifeYears > 0 ? Math.round(b.lifeYears) : null,
      description: b.description?.trim() || null,
    };
    const row = id
      ? await this.db.amCategory.update({
          where: { id: (await this.mustCat(a.rootId, id)).id },
          data,
        })
      : await this.db.amCategory.create({
          data: { businessId: a.rootId, ...data },
        });
    await this.ctx.audit(
      a.rootId,
      a,
      id ? 'Category edited' : 'Category created',
      'category',
      row.id,
      `${row.code} · ${row.name}`,
    );
    return row;
  }

  private async mustCat(rootId: string, id: string) {
    const c = await this.db.amCategory.findFirst({
      where: { id, businessId: rootId },
    });
    if (!c)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Category not found',
        HttpStatus.NOT_FOUND,
      );
    return c;
  }

  async categoryAction(a: AmActor, id: string, act: string, to?: string) {
    this.ctx.need(a, 'edit', 'Managing categories');
    const c = await this.mustCat(a.rootId, id);
    const n = await this.db.amAsset.count({
      where: { businessId: a.rootId, categoryId: id },
    });
    const kids = await this.db.amCategory.count({ where: { parentId: id } });
    if (act === 'Delete') {
      if (n || kids)
        throw amErr(
          AM_ERRORS.CONFLICT,
          `Can’t delete “${c.name}” — ${n} asset(s) and ${kids} sub-categor${kids === 1 ? 'y' : 'ies'} reference it. Deactivate, merge or reassign instead.`,
          HttpStatus.CONFLICT,
        );
      await this.db.amCategory.delete({ where: { id } });
    } else if (act === 'Deactivate' || act === 'Activate') {
      await this.db.amCategory.update({
        where: { id },
        data: { status: act === 'Deactivate' ? 'Inactive' : 'Active' },
      });
    } else if (act === 'Merge') {
      if (!to || to === id)
        throw amErr(AM_ERRORS.INVALID, 'Pick the target category.');
      const t = await this.mustCat(a.rootId, to);
      await this.db.$transaction([
        this.db.amAsset.updateMany({
          where: { businessId: a.rootId, categoryId: id },
          data: { categoryId: t.id },
        }),
        this.db.amCategory.updateMany({
          where: { parentId: id },
          data: { parentId: t.parentId ? t.parentId : t.id },
        }),
        this.db.amCategory.update({
          where: { id },
          data: { status: 'Inactive' },
        }),
      ]);
    } else throw amErr(AM_ERRORS.INVALID, `Unknown action “${act}”.`);
    await this.ctx.audit(
      a.rootId,
      a,
      `Category ${act.toLowerCase()}`,
      'category',
      id,
      `${c.code} · ${c.name}${act === 'Merge' ? ` → ${to}` : ''} · ${n} asset(s)`,
    );
    return { ok: true };
  }

  // ── locations ─────────────────────────────────────────────────────────

  private async mustLoc(rootId: string, id: string) {
    const l = await this.db.amLocation.findFirst({
      where: { id, businessId: rootId },
    });
    if (!l)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Location not found',
        HttpStatus.NOT_FOUND,
      );
    return l;
  }

  /** Parent is either a branch id ("b:<businessId>") or a location id ("l:<id>"). */
  private async parentOf(a: AmActor, parent: string) {
    const [k, pid] = (parent ?? '').split(':');
    if (k === 'b') {
      const g = await this.ctx.branches(a.rootId);
      if (!g.some((x) => x.id === pid))
        throw amErr(AM_ERRORS.INVALID, 'That branch isn’t in this business.');
      return { branchId: pid, parentId: null as string | null };
    }
    if (k === 'l') {
      const l = await this.mustLoc(a.rootId, pid);
      return { branchId: l.branchId, parentId: l.id };
    }
    throw amErr(AM_ERRORS.INVALID, 'Pick the parent location or branch.');
  }

  private async descendants(rootId: string, id: string) {
    const all = await this.db.amLocation.findMany({
      where: { businessId: rootId },
    });
    const out: typeof all = [];
    const walk = (p: string) =>
      all
        .filter((x) => x.parentId === p)
        .forEach((x) => {
          out.push(x);
          walk(x.id);
        });
    walk(id);
    return out;
  }

  async saveLocation(
    a: AmActor,
    id: string | null,
    b: { name: string; code: string; type: string; parent: string },
  ) {
    this.ctx.need(a, 'edit', 'Managing locations');
    if (!b.name?.trim() || !b.code?.trim() || !b.parent)
      throw amErr(AM_ERRORS.INVALID, 'Name, code and parent are required.');
    if (!LOCATION_TYPES.includes(b.type as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown location type.');
    const code = b.code.trim().toUpperCase().slice(0, 40);
    if (
      await this.db.amLocation.findFirst({
        where: {
          businessId: a.rootId,
          code,
          ...(id ? { id: { not: id } } : {}),
        },
      })
    )
      throw amErr(
        AM_ERRORS.DUPLICATE,
        'Code already used.',
        HttpStatus.CONFLICT,
      );
    const par = await this.parentOf(a, b.parent);
    if (id) {
      const cur = await this.mustLoc(a.rootId, id);
      const desc = await this.descendants(a.rootId, id);
      if (par.parentId === id || desc.some((d) => d.id === par.parentId))
        throw amErr(AM_ERRORS.INVALID, 'A location can’t move under itself.');
      const row = await this.db.$transaction(async (tx) => {
        const r = await tx.amLocation.update({
          where: { id },
          data: {
            name: b.name.trim().slice(0, 120),
            code,
            type: b.type,
            ...par,
          },
        });
        if (cur.branchId !== par.branchId) {
          const ids = [id, ...desc.map((d) => d.id)];
          await tx.amLocation.updateMany({
            where: { id: { in: desc.map((d) => d.id) } },
            data: { branchId: par.branchId },
          });
          await tx.amAsset.updateMany({
            where: { businessId: a.rootId, locationId: { in: ids } },
            data: { branchId: par.branchId },
          });
        }
        return r;
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Location edited',
        'location',
        id,
        `${row.code} · ${row.name}`,
      );
      return row;
    }
    const row = await this.db.amLocation.create({
      data: {
        businessId: a.rootId,
        name: b.name.trim().slice(0, 120),
        code,
        type: b.type,
        ...par,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Location created',
      'location',
      row.id,
      `${row.code} · ${row.name}`,
    );
    return row;
  }

  async locationAction(a: AmActor, id: string, act: string, to?: string) {
    this.ctx.need(a, 'edit', 'Managing locations');
    const l = await this.mustLoc(a.rootId, id);
    const desc = await this.descendants(a.rootId, id);
    const ids = [id, ...desc.map((d) => d.id)];
    if (act === 'Move') {
      const cur = await this.parentOf(a, to ?? '');
      if (cur.parentId && ids.includes(cur.parentId))
        throw amErr(AM_ERRORS.INVALID, 'A location can’t move under itself.');
      await this.db.$transaction([
        this.db.amLocation.update({ where: { id }, data: cur }),
        this.db.amLocation.updateMany({
          where: { id: { in: desc.map((d) => d.id) } },
          data: { branchId: cur.branchId },
        }),
        this.db.amAsset.updateMany({
          where: { businessId: a.rootId, locationId: { in: ids } },
          data: { branchId: cur.branchId },
        }),
      ]);
    } else if (act === 'Deactivate') {
      const n = await this.db.amAsset.count({
        where: {
          businessId: a.rootId,
          locationId: { in: ids },
          status: { notIn: FINAL_ASSET },
        },
      });
      if (n)
        throw amErr(
          AM_ERRORS.CONFLICT,
          `Can’t deactivate ${l.name} — ${n} active asset(s) are there. Move or merge them first.`,
          HttpStatus.CONFLICT,
        );
      await this.db.amLocation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'Inactive' },
      });
    } else if (act === 'Activate') {
      await this.db.amLocation.update({
        where: { id },
        data: { status: 'Active' },
      });
    } else if (act === 'Merge') {
      if (!to || ids.includes(to))
        throw amErr(AM_ERRORS.INVALID, 'Pick a target outside this location.');
      const t = await this.mustLoc(a.rootId, to);
      await this.db.$transaction([
        this.db.amAsset.updateMany({
          where: { businessId: a.rootId, locationId: id },
          data: { locationId: t.id, branchId: t.branchId },
        }),
        this.db.amLocation.updateMany({
          where: { parentId: id },
          data: { parentId: t.id, branchId: t.branchId },
        }),
        this.db.amLocation.update({
          where: { id },
          data: { status: 'Inactive' },
        }),
      ]);
    } else throw amErr(AM_ERRORS.INVALID, `Unknown action “${act}”.`);
    await this.ctx.audit(
      a.rootId,
      a,
      `Location ${act.toLowerCase()}`,
      'location',
      id,
      `${l.code} · ${l.name}${to ? ` → ${to}` : ''} · ${desc.length} child location(s)`,
    );
    return { ok: true, moved: desc.length + 1 };
  }

  // ── teams ─────────────────────────────────────────────────────────────

  async saveTeam(
    a: AmActor,
    id: string | null,
    b: { name: string; members: string[] },
  ) {
    this.ctx.need(a, 'settings', 'Managing maintenance teams');
    if (!b.name?.trim()) throw amErr(AM_ERRORS.INVALID, 'Team name required.');
    const people = (await this.ctx.members(a.rootId)).map((p) => p.id);
    const members = [...new Set(b.members ?? [])];
    if (members.some((m) => !people.includes(m)))
      throw amErr(AM_ERRORS.INVALID, 'A member isn’t staff in this business.');
    try {
      const row = await this.db.$transaction(async (tx) => {
        const t = id
          ? await tx.amTeam.update({
              where: { id: (await this.mustTeam(a.rootId, id)).id },
              data: { name: b.name.trim().slice(0, 80) },
            })
          : await tx.amTeam.create({
              data: { businessId: a.rootId, name: b.name.trim().slice(0, 80) },
            });
        await tx.amTeamMember.deleteMany({ where: { teamId: t.id } });
        if (members.length)
          await tx.amTeamMember.createMany({
            data: members.map((userId) => ({ teamId: t.id, userId })),
          });
        return t;
      });
      await this.ctx.audit(
        a.rootId,
        a,
        id ? 'Team edited' : 'Team created',
        'team',
        row.id,
        `${row.name} · ${members.length} member(s)`,
      );
      return row;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw amErr(
          AM_ERRORS.DUPLICATE,
          'A team with that name exists.',
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  private async mustTeam(rootId: string, id: string) {
    const t = await this.db.amTeam.findFirst({
      where: { id, businessId: rootId },
    });
    if (!t)
      throw amErr(AM_ERRORS.NOT_FOUND, 'Team not found', HttpStatus.NOT_FOUND);
    return t;
  }

  async removeTeam(a: AmActor, id: string) {
    this.ctx.need(a, 'settings', 'Managing maintenance teams');
    const t = await this.mustTeam(a.rootId, id);
    const [assets, wos, plans] = await Promise.all([
      this.db.amAsset.count({ where: { businessId: a.rootId, teamId: id } }),
      this.db.amWorkOrder.count({
        where: {
          businessId: a.rootId,
          teamId: id,
          status: { notIn: ['Closed', 'Cancelled'] },
        },
      }),
      this.db.amPmPlan.count({
        where: {
          businessId: a.rootId,
          teamId: id,
          status: { in: ['Active', 'Paused'] },
        },
      }),
    ]);
    if (assets + wos + plans)
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${t.name} is responsible for ${assets} asset(s), ${wos} open work order(s) and ${plans} plan(s) — reassign them first.`,
        HttpStatus.CONFLICT,
      );
    await this.db.amTeam.delete({ where: { id } });
    await this.ctx.audit(a.rootId, a, 'Team removed', 'team', id, t.name);
    return { ok: true };
  }

  // ── PM templates ──────────────────────────────────────────────────────

  async saveTemplate(
    a: AmActor,
    id: string | null,
    b: { name: string; checklist: string[] },
  ) {
    this.ctx.need(a, 'pm', 'Managing PM templates');
    if (!b.name?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Template name required.');
    const checklist = (b.checklist ?? [])
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    try {
      const data = { name: b.name.trim().slice(0, 120), checklist };
      const row = id
        ? await this.db.amPmTemplate.update({
            where: { id: (await this.mustTpl(a.rootId, id)).id },
            data,
          })
        : await this.db.amPmTemplate.create({
            data: { businessId: a.rootId, ...data },
          });
      await this.ctx.audit(
        a.rootId,
        a,
        id ? 'PM template edited' : 'PM template created',
        'template',
        row.id,
        `${row.name} · ${checklist.length} step(s)`,
      );
      return row;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw amErr(
          AM_ERRORS.DUPLICATE,
          'A template with that name exists.',
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  private async mustTpl(rootId: string, id: string) {
    const t = await this.db.amPmTemplate.findFirst({
      where: { id, businessId: rootId },
    });
    if (!t)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Template not found',
        HttpStatus.NOT_FOUND,
      );
    return t;
  }

  async removeTemplate(a: AmActor, id: string) {
    this.ctx.need(a, 'pm', 'Managing PM templates');
    const t = await this.mustTpl(a.rootId, id);
    const used = await this.db.amPmPlan.count({
      where: { templateId: id, status: { in: ['Active', 'Paused'] } },
    });
    if (used)
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${t.name} is used by ${used} active plan(s).`,
        HttpStatus.CONFLICT,
      );
    await this.db.amCategory.updateMany({
      where: { templateId: id },
      data: { templateId: null },
    });
    await this.db.amPmTemplate.delete({ where: { id } });
    await this.ctx.audit(
      a.rootId,
      a,
      'PM template removed',
      'template',
      id,
      t.name,
    );
    return { ok: true };
  }

  // ── custom fields ─────────────────────────────────────────────────────

  async addField(
    a: AmActor,
    b: {
      name: string;
      type: string;
      options?: string[];
      categoryIds?: string[];
    },
  ) {
    this.ctx.need(a, 'settings', 'Managing custom fields');
    if (!b.name?.trim()) throw amErr(AM_ERRORS.INVALID, 'Name required.');
    if (
      ![
        'Text',
        'Number',
        'Date',
        'Dropdown',
        'Yes/No',
        'Staff reference',
      ].includes(b.type)
    )
      throw amErr(AM_ERRORS.INVALID, 'Unknown field type.');
    const options = (b.options ?? []).map((x) => x.trim()).filter(Boolean);
    if (b.type === 'Dropdown' && !options.length)
      throw amErr(AM_ERRORS.INVALID, 'Dropdown fields need options.');
    const cats = b.categoryIds?.length
      ? (
          await this.db.amCategory.findMany({
            where: { id: { in: b.categoryIds }, businessId: a.rootId },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];
    try {
      const row = await this.db.amCustomField.create({
        data: {
          businessId: a.rootId,
          name: b.name.trim().slice(0, 80),
          type: b.type,
          options,
          categoryIds: cats,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Custom field added',
        'field',
        row.id,
        `${row.name} · ${row.type}`,
      );
      return row;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw amErr(
          AM_ERRORS.DUPLICATE,
          'A field with that name exists.',
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async removeField(a: AmActor, id: string) {
    this.ctx.need(a, 'settings', 'Managing custom fields');
    const f = await this.db.amCustomField.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!f)
      throw amErr(AM_ERRORS.NOT_FOUND, 'Field not found', HttpStatus.NOT_FOUND);
    await this.db.amCustomField.delete({ where: { id } });
    await this.ctx.audit(
      a.rootId,
      a,
      'Custom field removed',
      'field',
      id,
      `${f.name} (values kept on assets for history)`,
    );
    return { ok: true };
  }
}
