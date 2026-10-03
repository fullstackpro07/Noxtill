import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, WorkflowTriggerKey } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowTriggerService } from './workflow-trigger.service';

export const WORKFLOW_ENDPOINT_ERROR_CODES = {
  NOT_FOUND: 'WORKFLOW_ENDPOINT_NOT_FOUND',
  WRONG_TRIGGER: 'WORKFLOW_ENDPOINT_WRONG_TRIGGER',
  UNKNOWN_TOKEN: 'WORKFLOW_ENDPOINT_UNKNOWN_TOKEN',
  PAYLOAD_TOO_LARGE: 'WORKFLOW_ENDPOINT_PAYLOAD_TOO_LARGE',
  PAYLOAD_INVALID: 'WORKFLOW_ENDPOINT_PAYLOAD_INVALID',
} as const;

/** Largest JSON body accepted and stored per delivery. */
export const MAX_WEBHOOK_BODY_BYTES = 32 * 1024;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Inbound webhook endpoints (Automations spec area 9). Each inbound-webhook workflow gets a secret
 * URL; only the token's hash is stored and the full URL is shown once. Deliveries are logged,
 * de-duplicated (Idempotency-Key header, else a body hash) and can be replayed. Authenticated
 * management goes through TenantPrismaService; the public receiver resolves the business from the
 * token alone and uses PrismaService with that id.
 */
@Injectable()
export class WorkflowEndpointsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly trigger: WorkflowTriggerService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async list(businessId: string) {
    const workflows = await this.db.workflow.findMany({
      where: {
        businessId,
        triggerKey: WorkflowTriggerKey.inbound_webhook,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        active: true,
        endpoint: {
          select: {
            id: true,
            tokenHint: true,
            enabled: true,
            rotatedAt: true,
            lastReceivedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return workflows;
  }

  private async inboundWorkflow(businessId: string, workflowId: string) {
    const workflow = await this.db.workflow.findFirst({
      where: { id: workflowId, businessId, archivedAt: null },
      select: { id: true, triggerKey: true },
    });
    if (!workflow) {
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.NOT_FOUND,
        'Workflow not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (workflow.triggerKey !== WorkflowTriggerKey.inbound_webhook) {
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.WRONG_TRIGGER,
        'Only workflows with the "Inbound webhook" trigger can have a webhook URL.',
        HttpStatus.CONFLICT,
      );
    }
    return workflow;
  }

  /** Creates the endpoint or rotates its token. The returned token is never retrievable again. */
  async issueToken(businessId: string, workflowId: string) {
    await this.inboundWorkflow(businessId, workflowId);
    const token = randomBytes(24).toString('base64url');
    const data = {
      tokenHash: hashToken(token),
      tokenHint: token.slice(-4),
      enabled: true,
    };
    const existing = await this.db.workflowEndpoint.findUnique({
      where: { workflowId },
      select: { id: true },
    });
    const endpoint = existing
      ? await this.db.workflowEndpoint.update({
          where: { workflowId },
          data: { ...data, rotatedAt: new Date() },
        })
      : await this.db.workflowEndpoint.create({
          data: { ...data, businessId, workflowId },
        });
    return { endpointId: endpoint.id, token, rotated: Boolean(existing) };
  }

  async setEnabled(businessId: string, workflowId: string, enabled: boolean) {
    await this.inboundWorkflow(businessId, workflowId);
    const endpoint = await this.db.workflowEndpoint.findUnique({
      where: { workflowId },
    });
    if (!endpoint) {
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.NOT_FOUND,
        'Create the webhook URL first.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.db.workflowEndpoint.update({
      where: { workflowId },
      data: { enabled },
      select: { id: true, enabled: true },
    });
  }

  async deliveries(businessId: string, workflowId?: string) {
    return this.db.workflowEndpointDelivery.findMany({
      where: {
        businessId,
        ...(workflowId ? { endpoint: { workflowId } } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      include: { endpoint: { select: { workflowId: true } } },
    });
  }

  /** Public receiver: resolves the business from the token, never from the caller. */
  async receive(
    token: string,
    rawBody: unknown,
    idempotencyKey: string | undefined,
  ) {
    const endpoint = await this.prisma.workflowEndpoint.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        businessId: true,
        workflowId: true,
        enabled: true,
      },
    });
    if (!endpoint || !endpoint.enabled) {
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.UNKNOWN_TOKEN,
        'Unknown or disabled webhook URL.',
        HttpStatus.NOT_FOUND,
      );
    }
    const body =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : null;
    const serialized = JSON.stringify(rawBody ?? null);
    const payloadBytes = Buffer.byteLength(serialized);
    const dedupeKey =
      idempotencyKey?.trim().slice(0, 150) ||
      `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
    const receivedAt = new Date();
    await this.prisma.workflowEndpoint.update({
      where: { id: endpoint.id },
      data: { lastReceivedAt: receivedAt },
    });
    const log = (
      status: string,
      extra: {
        payload?: Prisma.InputJsonValue;
        runId?: string | null;
        error?: string;
      },
    ) =>
      this.prisma.workflowEndpointDelivery.create({
        data: {
          businessId: endpoint.businessId,
          endpointId: endpoint.id,
          status,
          dedupeKey,
          payloadBytes,
          payload: extra.payload,
          runId: extra.runId ?? null,
          error: extra.error ?? null,
          receivedAt,
        },
      });

    if (payloadBytes > MAX_WEBHOOK_BODY_BYTES) {
      await log('payload_rejected', {
        error: `Body is ${payloadBytes} bytes; the limit is ${MAX_WEBHOOK_BODY_BYTES}.`,
      });
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.PAYLOAD_TOO_LARGE,
        `The JSON body must be at most ${MAX_WEBHOOK_BODY_BYTES} bytes.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (!body) {
      await log('payload_rejected', { error: 'Body is not a JSON object.' });
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.PAYLOAD_INVALID,
        'Send a JSON object as the request body.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const previous = await this.prisma.workflowEndpointDelivery.findFirst({
      where: {
        endpointId: endpoint.id,
        dedupeKey,
        status: 'accepted',
        replayOfId: null,
      },
      select: { id: true, runId: true },
    });
    if (previous) {
      const duplicate = await log('duplicate', {
        payload: body as Prisma.InputJsonValue,
        runId: previous.runId,
      });
      return {
        deliveryId: duplicate.id,
        status: 'duplicate',
        runId: previous.runId,
      };
    }
    return this.accept(endpoint, body, receivedAt, log);
  }

  private async accept(
    endpoint: { businessId: string; workflowId: string },
    body: Record<string, unknown>,
    receivedAt: Date,
    log: (
      status: string,
      extra: {
        payload?: Prisma.InputJsonValue;
        runId?: string | null;
        error?: string;
      },
    ) => Promise<{ id: string }>,
    replayOfId?: string,
  ) {
    const delivery = await log('accepted', {
      payload: body as Prisma.InputJsonValue,
    });
    if (replayOfId) {
      await this.prisma.workflowEndpointDelivery.update({
        where: { id: delivery.id },
        data: { replayOfId },
      });
    }
    try {
      const runId = await this.trigger.runInbound(
        endpoint.businessId,
        endpoint.workflowId,
        delivery.id,
        body,
        receivedAt,
      );
      await this.prisma.workflowEndpointDelivery.update({
        where: { id: delivery.id },
        data: runId ? { runId } : { status: 'workflow_inactive' },
      });
      return {
        deliveryId: delivery.id,
        status: runId ? 'accepted' : 'workflow_inactive',
        runId,
      };
    } catch (error) {
      await this.prisma.workflowEndpointDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          error:
            error instanceof Error ? error.message.slice(0, 500) : 'Run failed',
        },
      });
      return { deliveryId: delivery.id, status: 'failed', runId: null };
    }
  }

  /** Re-runs a logged delivery's stored body as a new delivery (marked as a replay). */
  async replay(businessId: string, deliveryId: string) {
    const original = await this.db.workflowEndpointDelivery.findFirst({
      where: { id: deliveryId, businessId },
      include: {
        endpoint: { select: { businessId: true, workflowId: true, id: true } },
      },
    });
    if (!original || !original.payload) {
      throw new AppException(
        WORKFLOW_ENDPOINT_ERROR_CODES.NOT_FOUND,
        'That delivery has no stored body to replay.',
        HttpStatus.NOT_FOUND,
      );
    }
    const body = original.payload as Record<string, unknown>;
    const receivedAt = new Date();
    const log = (
      status: string,
      extra: {
        payload?: Prisma.InputJsonValue;
        runId?: string | null;
        error?: string;
      },
    ) =>
      this.prisma.workflowEndpointDelivery.create({
        data: {
          businessId,
          endpointId: original.endpoint.id,
          status,
          dedupeKey: `replay:${original.id}:${receivedAt.getTime()}`,
          payloadBytes: original.payloadBytes,
          payload: extra.payload,
          runId: extra.runId ?? null,
          error: extra.error ?? null,
          receivedAt,
        },
      });
    return this.accept(original.endpoint, body, receivedAt, log, original.id);
  }
}
