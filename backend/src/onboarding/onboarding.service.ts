import { emailVerificationSkipped } from '../auth/email-verification.flag';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { DEFAULT_WORKING_HOURS } from '../bookings/bookings.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ALWAYS_ON_NAV_KEYS,
  ANALYSIS_STAGES,
  MIN_MODULES,
  MODULES,
  REQ_LABEL,
  SETUP_STAGES,
  catalogPayload,
} from './onboarding.catalog';
import { OnboardingDraft, classifyBusiness, derive } from './onboarding.derive';

export type StageStatus =
  'pending' | 'in_progress' | 'complete' | 'failed' | 'requires_input';

export interface Stage {
  status: StageStatus;
  detail?: string;
}

export interface RunState<R> {
  status: 'running' | 'done' | 'failed' | 'requires_input';
  startedAt: string;
  finishedAt?: string;
  stages: Stage[];
  result?: R;
}

export interface AnalysisResult {
  insights: { label: string; value: string; icon: string }[];
  matched: { id: string; reason: string; fromActivities: boolean }[];
  offerings: string[];
  offeringsSource: 'ai' | 'description' | 'none';
  businessType: string;
}

export interface ProvisionResult {
  modules: string[];
  navKeys: string[];
  draftsCreated: number;
  preview: {
    key: string;
    name: string;
    sub: string;
    icon: string;
    color: string;
    tint: string;
    draft: boolean;
    count?: number;
  }[];
}

export interface OnboardingState {
  screen?: 'step2' | 'step3' | 'step4' | 'step5';
  draft?: OnboardingDraft;
  analysis?: RunState<AnalysisResult>;
  selected?: string[];
  provisioning?: RunState<ProvisionResult>;
}

const DRAFT_MAX_BYTES = 40_000;
const NAV_KEYS_ALLOWED = new Set<string>([
  ...ALWAYS_ON_NAV_KEYS,
  ...MODULES.flatMap((m) => m.navKeys),
]);

/**
 * Auth & Onboarding Steps 2–5. Everything shown in the flow comes from here: the draft answers are
 * persisted server-side (resume on next login), the analysis is re-derived from those answers (the
 * client's view is never trusted), stage statuses are real progress written as each stage runs, and
 * provisioning writes real rows — business profile, enabled modules, draft catalog items.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiInfraService,
  ) {}

  catalog() {
    return catalogPayload();
  }

  // ---------------------------------------------------------------- state

  private async load(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        name: true,
        email: true,
        onboardingState: true,
        onboardingCompletedAt: true,
        enabledModules: true,
      },
    });
    const state = (
      b.onboardingState && typeof b.onboardingState === 'object'
        ? b.onboardingState
        : {}
    ) as OnboardingState;
    return { business: b, state };
  }

  /** Read-modify-write of one or more top-level keys, always against the freshest row. */
  private async patch(businessId: string, patch: Partial<OnboardingState>) {
    const { state } = await this.load(businessId);
    const next = { ...state, ...patch };
    await this.prisma.business.update({
      where: { id: businessId },
      data: { onboardingState: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  private async assertOwnerVerified(user: AuthenticatedUser) {
    if (user.role !== 'owner') {
      throw new AppException(
        'ONBOARDING_OWNER_ONLY',
        'Only the business owner can set up the workspace.',
        HttpStatus.FORBIDDEN,
      );
    }
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { email: true, emailVerifiedAt: true },
    });
    if (u.email && !u.emailVerifiedAt && !emailVerificationSkipped()) {
      throw new AppException(
        'EMAIL_NOT_VERIFIED',
        'Confirm your email to continue setting up your workspace.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async get(user: AuthenticatedUser) {
    const { business, state } = await this.load(user.businessId);
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { email: true, emailVerifiedAt: true },
    });
    return {
      completed: Boolean(business.onboardingCompletedAt),
      emailVerified:
        Boolean(owner.emailVerifiedAt) ||
        !owner.email ||
        emailVerificationSkipped(),
      ownerEmail: owner.email,
      businessName: business.name,
      state,
    };
  }

  async saveDraft(
    user: AuthenticatedUser,
    draft: OnboardingDraft,
    screen?: OnboardingState['screen'],
  ) {
    await this.assertOwnerVerified(user);
    if (JSON.stringify(draft).length > DRAFT_MAX_BYTES) {
      throw new AppException(
        'ONBOARDING_DRAFT_TOO_LARGE',
        'These answers are too long to save.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (draft.desc && draft.desc.length > 500) {
      draft.desc = draft.desc.slice(0, 500);
    }
    await this.patch(user.businessId, {
      draft,
      ...(screen ? { screen } : {}),
    });
    return { saved: true, savedAt: new Date().toISOString() };
  }

  async setScreen(user: AuthenticatedUser, screen: OnboardingState['screen']) {
    await this.assertOwnerVerified(user);
    await this.patch(user.businessId, { screen });
    return { screen };
  }

  // ---------------------------------------------------------------- Improve with AI

  /** Returns a suggestion the owner accepts or rejects — the stored description is never rewritten here. */
  async improveDescription(
    user: AuthenticatedUser,
    p: { description: string; businessName?: string; businessType?: string },
  ) {
    await this.assertOwnerVerified(user);
    const text = p.description.trim();
    if (text.length < 15) {
      throw new AppException(
        'DESCRIPTION_TOO_SHORT',
        'Write a sentence or two first, then AI can polish it.',
        HttpStatus.BAD_REQUEST,
      );
    }
    let suggestion: string;
    try {
      suggestion = await this.ai.complete(
        user.businessId,
        [
          'Rewrite this small-business description so it is clear, specific and friendly.',
          'Keep every fact the owner wrote; do not invent services, prices, locations or claims.',
          'Third person, at most 3 sentences and under 480 characters. Reply with the description only.',
          p.businessName ? `Business name: ${p.businessName}` : '',
          p.businessType ? `Business type: ${p.businessType}` : '',
          `Owner's description: """${text.slice(0, 500)}"""`,
        ]
          .filter(Boolean)
          .join('\n'),
        0.3,
        'onboarding_description',
      );
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.warn(
        `Improve with AI failed: ${err instanceof Error ? err.message : err}`,
      );
      throw new AppException(
        'AI_UNAVAILABLE',
        "AI suggestions aren't available right now — your description is saved as written.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    suggestion = suggestion
      .trim()
      .replace(/^"+|"+$/g, '')
      .slice(0, 500);
    if (!suggestion) {
      throw new AppException(
        'AI_UNAVAILABLE',
        "AI didn't return a suggestion — try again in a moment.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { suggestion };
  }

  // ---------------------------------------------------------------- Step 3: analysis

  async startAnalysis(user: AuthenticatedUser) {
    await this.assertOwnerVerified(user);
    const { state } = await this.load(user.businessId);
    if (state.analysis?.status === 'running') return state.analysis;
    const analysis: RunState<AnalysisResult> = {
      status: 'running',
      startedAt: new Date().toISOString(),
      stages: ANALYSIS_STAGES.map(() => ({ status: 'pending' as const })),
    };
    await this.patch(user.businessId, { analysis, screen: 'step3' });
    void this.runAnalysis(user.businessId, state.draft ?? {}, analysis);
    return analysis;
  }

  private async runAnalysis(
    businessId: string,
    draft: OnboardingDraft,
    run: RunState<AnalysisResult>,
  ) {
    const set = async (i: number, stage: Stage) => {
      run.stages[i] = stage;
      await this.patch(businessId, { analysis: run });
    };
    const stop = async (i: number, detail: string) => {
      run.status = 'requires_input';
      run.finishedAt = new Date().toISOString();
      await set(i, { status: 'requires_input', detail });
    };
    try {
      // 1 — business information
      await set(0, { status: 'in_progress' });
      const basics = draft.basics ?? {};
      if (!basics.bizName || basics.bizName.trim().length < 2) {
        return await stop(0, 'Add your business name in Step 2.');
      }
      if (!basics.countryIso) {
        return await stop(0, 'Choose your country in Step 2.');
      }
      if (!draft.category || !draft.tags?.[0]) {
        return await stop(0, 'Pick your industry and business type in Step 2.');
      }
      await set(0, { status: 'complete' });

      // 2 — description → the products/services it names (used for the Step 5 draft catalog)
      await set(1, { status: 'in_progress' });
      const { offerings, source } = await this.extractOfferings(
        businessId,
        draft.desc ?? '',
      );
      await set(1, {
        status: 'complete',
        detail:
          source === 'none'
            ? 'No description provided'
            : `${offerings.length} product${offerings.length === 1 ? '' : 's'} or service${offerings.length === 1 ? '' : 's'} found`,
      });

      // 3 — activities
      await set(2, { status: 'in_progress' });
      const d = derive(draft);
      if (d.activeActivities.length === 0) {
        return await stop(2, 'Select at least one activity in Step 2.');
      }
      await set(2, {
        status: 'complete',
        detail: `${d.activeActivities.length} activities`,
      });

      // 4 — goals (the requirements the owner kept)
      await set(3, { status: 'in_progress' });
      if (d.matchedIds.length === 0) {
        return await stop(3, 'Tick at least one requirement in Step 2.');
      }
      await set(3, {
        status: 'complete',
        detail: `${d.matchedIds.length} requirements`,
      });

      // 5 — recommendations
      await set(4, { status: 'in_progress' });
      const location = [basics.city?.trim(), basics.countryName?.trim()]
        .filter(Boolean)
        .join(', ');
      const industry =
        draft.category === 'Other Business' && draft.customIndustry?.trim()
          ? draft.customIndustry.trim()
          : draft.category;
      const result: AnalysisResult = {
        businessType: classifyBusiness(d.candidateIds),
        offerings,
        offeringsSource: source,
        matched: MODULES.filter((m) => d.matchedIds.includes(m.id)).map(
          (m) => ({
            id: m.id,
            reason: d.reasonFor[m.id],
            fromActivities: d.candidateIds.includes(m.id),
          }),
        ),
        insights: [
          {
            label: 'Industry',
            value: `${industry} · ${d.bizType}`,
            icon: 'store',
          },
          { label: 'Location', value: location || 'Not provided', icon: 'pin' },
          {
            label: 'Business type',
            value: classifyBusiness(d.candidateIds),
            icon: 'store',
          },
          {
            label: 'Key activities',
            value: d.activeActivities
              .slice(0, 3)
              .map((a) => a.name)
              .join(', '),
            icon: 'list',
          },
          {
            label: 'Primary goals',
            value: d.matchedIds
              .slice(0, 3)
              .map((id) => REQ_LABEL[id])
              .join(', '),
            icon: 'target',
          },
        ],
      };
      run.result = result;
      run.status = 'done';
      run.finishedAt = new Date().toISOString();
      await set(4, {
        status: 'complete',
        detail: `${result.matched.length} modules matched`,
      });
    } catch (err) {
      this.logger.error(
        `Onboarding analysis failed for ${businessId}`,
        err instanceof Error ? err.stack : err,
      );
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      const i = run.stages.findIndex((s) => s.status === 'in_progress');
      if (i >= 0)
        run.stages[i] = {
          status: 'failed',
          detail: 'Something went wrong — try again.',
        };
      await this.patch(businessId, { analysis: run }).catch(() => undefined);
    }
  }

  /** AI first; when AI is unavailable, the owner's own comma/"and" list is used verbatim. */
  private async extractOfferings(
    businessId: string,
    desc: string,
  ): Promise<{
    offerings: string[];
    source: AnalysisResult['offeringsSource'];
  }> {
    const text = desc.trim();
    if (text.length < 10) return { offerings: [], source: 'none' };
    try {
      const raw = await this.ai.complete(
        businessId,
        [
          'List the products or services this business explicitly says it offers.',
          'Only items named in the text — never invent. Short names in Title Case, at most 8.',
          'Reply with a JSON array of strings only, e.g. ["Haircut","Hair Coloring"].',
          `Text: """${text.slice(0, 500)}"""`,
        ].join('\n'),
        0,
        'onboarding_offerings',
      );
      const match = raw.match(/\[[\s\S]*\]/);
      const parsed: unknown = match ? JSON.parse(match[0]) : null;
      if (Array.isArray(parsed)) {
        const offerings = cleanOfferings(
          parsed.filter((x) => typeof x === 'string'),
        );
        return { offerings, source: 'ai' };
      }
    } catch (err) {
      this.logger.warn(
        `Offering extraction via AI unavailable: ${err instanceof Error ? err.message : err}`,
      );
    }
    return { offerings: offeringsFromText(text), source: 'description' };
  }

  // ---------------------------------------------------------------- Step 4: approval

  async saveSelection(user: AuthenticatedUser, modules: string[]) {
    await this.assertOwnerVerified(user);
    const { state } = await this.load(user.businessId);
    const matched = new Set(
      (state.analysis?.result?.matched ?? []).map((m) => m.id),
    );
    if (state.analysis?.status !== 'done') {
      throw new AppException(
        'ANALYSIS_NOT_READY',
        'Finish the analysis in Step 3 first.',
        HttpStatus.CONFLICT,
      );
    }
    const selected = Array.from(new Set(modules)).filter((id) =>
      matched.has(id),
    );
    if (selected.length < MIN_MODULES) {
      throw new AppException(
        'TOO_FEW_MODULES',
        `Choose at least ${MIN_MODULES} modules to create your workspace.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.patch(user.businessId, { selected, screen: 'step4' });
    return { selected };
  }

  // ---------------------------------------------------------------- Step 5: provisioning

  async startProvisioning(user: AuthenticatedUser) {
    await this.assertOwnerVerified(user);
    const { state } = await this.load(user.businessId);
    if (state.provisioning?.status === 'running') return state.provisioning;
    if (!state.selected || state.selected.length < MIN_MODULES) {
      throw new AppException(
        'TOO_FEW_MODULES',
        `Choose at least ${MIN_MODULES} modules in Step 4 first.`,
        HttpStatus.CONFLICT,
      );
    }
    const run: RunState<ProvisionResult> = {
      status: 'running',
      startedAt: new Date().toISOString(),
      stages: SETUP_STAGES.map(() => ({ status: 'pending' as const })),
    };
    await this.patch(user.businessId, { provisioning: run, screen: 'step5' });
    void this.runProvisioning(user.businessId, state, run);
    return run;
  }

  private async runProvisioning(
    businessId: string,
    state: OnboardingState,
    run: RunState<ProvisionResult>,
  ) {
    const set = async (i: number, stage: Stage) => {
      run.stages[i] = stage;
      await this.patch(businessId, { provisioning: run });
    };
    const draft = state.draft ?? {};
    const basics = draft.basics ?? {};
    const selected = state.selected ?? [];
    const approved = MODULES.filter((m) => selected.includes(m.id));
    try {
      // 1 — business profile
      await set(0, { status: 'in_progress' });
      const typeLabel = draft.tags?.[0];
      const type = typeLabel
        ? await this.prisma.businessType.findFirst({
            where: { label: typeLabel },
            select: { id: true },
          })
        : null;
      const dial = basics.phone?.trim()
        ? `${dialFor(basics) ?? ''} ${basics.phone.trim()}`.trim()
        : undefined;
      await this.prisma.business.update({
        where: { id: businessId },
        data: {
          name: basics.bizName?.trim() || undefined,
          email: basics.bizEmail?.trim() || undefined,
          phone: dial,
          website: basics.website?.trim() || undefined,
          country: basics.countryIso || undefined,
          city: basics.city?.trim() || undefined,
          currency: basics.currency || undefined,
          description: draft.desc?.trim() || undefined,
          typeId: type?.id,
        },
      });
      await set(0, { status: 'complete' });

      // 2 — modules → sidebar
      await set(1, { status: 'in_progress' });
      const navKeys = Array.from(
        new Set([...ALWAYS_ON_NAV_KEYS, ...approved.flatMap((m) => m.navKeys)]),
      );
      await this.prisma.business.update({
        where: { id: businessId },
        data: { enabledModules: navKeys },
      });
      await set(1, {
        status: 'complete',
        detail: `${approved.length} modules enabled`,
      });

      // 3 — draft catalog from the description (inactive until the owner prices them)
      await set(2, { status: 'in_progress' });
      const wantsCatalog = selected.some((id) =>
        ['products', 'pos', 'bookings', 'inventory'].includes(id),
      );
      const offerings = state.analysis?.result?.offerings ?? [];
      let draftsCreated = 0;
      if (wantsCatalog && offerings.length) {
        const serviceBased = selected.includes('bookings');
        const existing = await this.prisma.product.findMany({
          where: { businessId, name: { in: offerings } },
          select: { name: true },
        });
        const have = new Set(existing.map((e) => e.name.toLowerCase()));
        const toCreate = offerings.filter((o) => !have.has(o.toLowerCase()));
        if (toCreate.length) {
          const res = await this.prisma.product.createMany({
            data: toCreate.map((name) => ({
              businessId,
              name,
              kind: serviceBased ? 'service' : 'product',
              active: false,
            })),
          });
          draftsCreated = res.count;
        }
      }
      await set(2, {
        status: 'complete',
        detail: wantsCatalog
          ? `${draftsCreated} draft item${draftsCreated === 1 ? '' : 's'} created`
          : 'No catalog module selected',
      });

      // 4 — settings
      await set(3, { status: 'in_progress' });
      const b = await this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { workingHours: true, currency: true },
      });
      const hoursEmpty =
        !b.workingHours ||
        (typeof b.workingHours === 'object' &&
          Object.keys(b.workingHours).length === 0);
      if (hoursEmpty) {
        await this.prisma.business.update({
          where: { id: businessId },
          data: {
            workingHours: DEFAULT_WORKING_HOURS,
          },
        });
      }
      await set(3, { status: 'complete', detail: `Currency ${b.currency}` });

      // 5 — finalize
      await set(4, { status: 'in_progress' });
      const preview: ProvisionResult['preview'] = [];
      if (draftsCreated > 0) {
        preview.push({
          key: 'catalog',
          name: 'Product & service catalog',
          sub: 'Drafted from your description — hidden until you set prices',
          icon: 'tag',
          color: '#0F766E',
          tint: '#CCFBF1',
          draft: true,
          count: draftsCreated,
        });
      }
      if (selected.includes('bookings')) {
        preview.push({
          key: 'hours',
          name: 'Business hours',
          sub: 'Mon–Fri 09:00–17:00 to start — edit anytime',
          icon: 'clock',
          color: '#2563EB',
          tint: '#DBEAFE',
          draft: true,
        });
      }
      for (const m of approved) {
        preview.push({
          key: m.id,
          name: m.name,
          sub: m.readyCopy,
          icon: m.icon,
          color: m.color,
          tint: m.tint,
          draft: false,
        });
      }
      run.result = {
        modules: approved.map((m) => m.id),
        navKeys,
        draftsCreated,
        preview,
      };
      await this.prisma.business.update({
        where: { id: businessId },
        data: { onboardingCompletedAt: new Date() },
      });
      run.status = 'done';
      run.finishedAt = new Date().toISOString();
      await set(4, { status: 'complete', detail: 'Workspace ready' });
    } catch (err) {
      this.logger.error(
        `Onboarding provisioning failed for ${businessId}`,
        err instanceof Error ? err.stack : err,
      );
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      const i = run.stages.findIndex((s) => s.status === 'in_progress');
      if (i >= 0)
        run.stages[i] = {
          status: 'failed',
          detail: 'Something went wrong — try again.',
        };
      await this.patch(businessId, { provisioning: run }).catch(
        () => undefined,
      );
    }
  }

  // ---------------------------------------------------------------- modules after onboarding

  async listModules(user: AuthenticatedUser) {
    const { business } = await this.load(user.businessId);
    const navKeys = Array.isArray(business.enabledModules)
      ? (business.enabledModules as string[])
      : [];
    return {
      curated: navKeys.length > 0,
      navKeys,
      modules: MODULES.map(
        ({ id, name, desc, icon, color, tint, navKeys: k }) => ({
          id,
          name,
          desc,
          icon,
          color,
          tint,
          enabled:
            navKeys.length === 0 || k.every((key) => navKeys.includes(key)),
        }),
      ),
    };
  }

  /** Add or remove modules anytime (owner only). An empty selection is refused. */
  async setModules(user: AuthenticatedUser, moduleIds: string[]) {
    if (user.role !== 'owner') {
      throw new AppException(
        'MODULES_OWNER_ONLY',
        'Only the business owner can change which modules are active.',
        HttpStatus.FORBIDDEN,
      );
    }
    const chosen = MODULES.filter((m) => moduleIds.includes(m.id));
    if (chosen.length === 0) {
      throw new AppException(
        'TOO_FEW_MODULES',
        'Keep at least one module active.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const navKeys = Array.from(
      new Set([...ALWAYS_ON_NAV_KEYS, ...chosen.flatMap((m) => m.navKeys)]),
    ).filter((k) => NAV_KEYS_ALLOWED.has(k));
    await this.prisma.business.update({
      where: { id: user.businessId },
      data: { enabledModules: navKeys },
    });
    return this.listModules(user);
  }
}

function dialFor(basics: NonNullable<OnboardingDraft['basics']>) {
  return basics.dialCode && /^\+\d{1,4}$/.test(basics.dialCode)
    ? basics.dialCode
    : undefined;
}

export function cleanOfferings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const name = raw
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.;:]+$/, '');
    if (name.length < 2 || name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.charAt(0).toUpperCase() + name.slice(1));
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * No-AI fallback: takes the owner's own list after an "offer/offering/sell/provide" verb —
 * "offering haircuts, hair coloring, facials and bridal makeup" → 4 items. Nothing is invented.
 */
export function offeringsFromText(text: string): string[] {
  const m = text.match(
    /\b(?:offer(?:s|ing)?|sell(?:s|ing)?|provid(?:e|es|ing)|serv(?:e|es|ing))\s+([^.]+)/i,
  );
  if (!m) return [];
  const list = m[1]
    .split(/,|\band\b|&/i)
    .map((s) => s.trim())
    .filter((s) => s && s.split(' ').length <= 4);
  return list.length >= 2 ? cleanOfferings(list) : [];
}
