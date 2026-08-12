"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionCenterService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const dashboard_constants_1 = require("./dashboard.constants");
const prisma_1 = require("../../generated/prisma");
function encodeId(type, entityId) {
    return `${type}:${entityId}`;
}
function decodeId(id) {
    const separator = id.indexOf(':');
    return {
        type: id.slice(0, separator),
        entityId: id.slice(separator + 1),
    };
}
const SNOOZE_DURATIONS_MS = {
    '1h': () => 60 * 60 * 1000,
    tomorrow: () => 24 * 60 * 60 * 1000,
    next_week: () => 7 * 24 * 60 * 60 * 1000,
};
let ActionCenterService = class ActionCenterService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async list(businessId, role, businessUserId, filters) {
        const raw = await this.gatherRawItems(businessId, role, businessUserId);
        const states = await this.tenantPrisma.client.actionItemState.findMany({
            where: { businessId },
        });
        const stateByKey = new Map(states.map((s) => [encodeId(s.type, s.entityId), s]));
        const now = new Date();
        const items = raw
            .filter((item) => filters.priority ? item.priority === filters.priority : true)
            .filter((item) => (filters.type ? item.type === filters.type : true))
            .map((item) => {
            const id = encodeId(item.type, item.entityId);
            const state = stateByKey.get(id);
            return { id, item, state };
        })
            .filter(({ state }) => {
            if (!state)
                return true;
            if (state.status === prisma_1.ActionItemStatus.snoozed) {
                return state.snoozedUntil ? state.snoozedUntil <= now : false;
            }
            return false;
        })
            .map(({ id, item }) => ({
            id,
            type: item.type,
            priority: item.priority,
            title: item.title,
            reason: item.reason,
            ageMs: now.getTime() - item.occurredAt.getTime(),
            occurredAt: item.occurredAt,
            deepLink: item.deepLink,
        }))
            .sort((a, b) => {
            const priorityRank = {
                urgent: 0,
                normal: 1,
                low: 2,
            };
            const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
            return byPriority !== 0 ? byPriority : b.ageMs - a.ageMs;
        });
        const completedThisWeek = await this.tenantPrisma.client.actionItemState.count({
            where: {
                businessId,
                status: prisma_1.ActionItemStatus.completed,
                updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            },
        });
        return {
            items,
            counts: {
                urgent: items.filter((i) => i.priority === 'urgent').length,
                open: items.length,
                completedThisWeek,
            },
        };
    }
    async complete(businessId, id) {
        return this.setStatus(businessId, id, prisma_1.ActionItemStatus.completed);
    }
    async dismiss(businessId, id) {
        return this.setStatus(businessId, id, prisma_1.ActionItemStatus.dismissed);
    }
    async snooze(businessId, id, dto) {
        const snoozedUntil = new Date(Date.now() + SNOOZE_DURATIONS_MS[dto.duration]());
        return this.setStatus(businessId, id, prisma_1.ActionItemStatus.snoozed, snoozedUntil);
    }
    async setStatus(businessId, id, status, snoozedUntil) {
        const { type, entityId } = decodeId(id);
        if (!Object.values(prisma_1.ActionItemType).includes(type)) {
            throw new common_1.NotFoundException('Action item not found');
        }
        return this.tenantPrisma.client.actionItemState.upsert({
            where: { businessId_type_entityId: { businessId, type, entityId } },
            create: { businessId, type, entityId, status, snoozedUntil },
            update: { status, snoozedUntil: snoozedUntil ?? null },
        });
    }
    async gatherRawItems(businessId, role, businessUserId) {
        if (role === prisma_1.Role.staff) {
            return this.complaintItems(businessId, businessUserId);
        }
        const [complaints, lowStock, overdueCredit, unrepliedReviews] = await Promise.all([
            this.complaintItems(businessId, null),
            this.lowStockItems(businessId),
            this.overdueCreditItems(businessId),
            this.unrepliedReviewItems(businessId),
        ]);
        return [...complaints, ...lowStock, ...overdueCredit, ...unrepliedReviews];
    }
    async complaintItems(businessId, assignedToOnly) {
        const rows = await this.tenantPrisma.client.privateFeedback.findMany({
            where: {
                businessId,
                status: { not: prisma_1.FeedbackStatus.resolved },
                ...(assignedToOnly ? { assignedTo: assignedToOnly } : {}),
            },
            include: { customer: true },
        });
        return rows.map((row) => ({
            type: prisma_1.ActionItemType.complaint,
            entityId: row.id,
            priority: row.stars <= 2 ? prisma_1.ActionItemPriority.urgent : prisma_1.ActionItemPriority.normal,
            title: `${row.stars}★ complaint${row.customer ? ` from ${row.customer.name}` : ''}`,
            reason: row.message ?? 'No comment left',
            occurredAt: row.createdAt,
            deepLink: '/reviews',
        }));
    }
    async lowStockItems(businessId) {
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC
    `;
        return rows.map((row) => ({
            type: prisma_1.ActionItemType.low_stock,
            entityId: row.id,
            priority: row.stock_qty <= 0
                ? prisma_1.ActionItemPriority.urgent
                : prisma_1.ActionItemPriority.normal,
            title: row.name,
            reason: `${row.stock_qty} left (threshold ${row.low_stock_threshold})`,
            occurredAt: new Date(),
            deepLink: '/inventory',
        }));
    }
    async overdueCreditItems(businessId) {
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding, v.last_entry_at
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0 AND v.days_outstanding >= ${dashboard_constants_1.CREDIT_NOTABLE_OVERDUE_DAYS}
      ORDER BY v.days_outstanding DESC
    `;
        return rows.map((row) => ({
            type: prisma_1.ActionItemType.overdue_credit,
            entityId: row.customer_id,
            priority: row.days_outstanding >= dashboard_constants_1.CREDIT_NOTABLE_OVERDUE_DAYS * 2
                ? prisma_1.ActionItemPriority.urgent
                : prisma_1.ActionItemPriority.normal,
            title: `${row.name} — ${Number(row.balance)} owed`,
            reason: `${row.days_outstanding} days overdue`,
            occurredAt: row.last_entry_at,
            deepLink: '/credit',
        }));
    }
    async unrepliedReviewItems(businessId) {
        const rows = await this.tenantPrisma.client.externalReview.findMany({
            where: { businessId, repliedAt: null },
        });
        return rows.map((row) => ({
            type: prisma_1.ActionItemType.unreplied_review,
            entityId: row.id,
            priority: row.stars <= 2 ? prisma_1.ActionItemPriority.urgent : prisma_1.ActionItemPriority.low,
            title: `${row.stars}★ review${row.author ? ` from ${row.author}` : ''} on ${row.platform}`,
            reason: row.text ?? 'No text left',
            occurredAt: row.createdAt,
            deepLink: '/reviews',
        }));
    }
};
exports.ActionCenterService = ActionCenterService;
exports.ActionCenterService = ActionCenterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], ActionCenterService);
//# sourceMappingURL=action-center.service.js.map