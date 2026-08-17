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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayrollService = void 0;
const common_1 = require("@nestjs/common");
const exceljs_1 = __importDefault(require("exceljs"));
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const commissions_service_1 = require("./commissions.service");
const timesheets_service_1 = require("./timesheets.service");
const payroll_constants_1 = require("./payroll.constants");
const prisma_1 = require("../../generated/prisma");
function round2(value) {
    return Math.round(value * 100) / 100;
}
function hasRecognizedCommissionRule(rule) {
    if (!rule || typeof rule !== 'object')
        return false;
    const type = rule.type;
    return type === 'percent' || type === 'per_service';
}
let PayrollService = class PayrollService {
    tenantPrisma;
    s3;
    commissions;
    timesheets;
    constructor(tenantPrisma, s3, commissions, timesheets) {
        this.tenantPrisma = tenantPrisma;
        this.s3 = s3;
        this.commissions = commissions;
        this.timesheets = timesheets;
    }
    async export(businessId, month) {
        const [commissionRows, timesheetRows, staffRules] = await Promise.all([
            this.commissions.report(month),
            this.timesheets.report(businessId, month),
            this.tenantPrisma.client.businessUser.findMany({
                where: { role: { in: [prisma_1.Role.manager, prisma_1.Role.staff] } },
                select: { id: true, commissionRule: true },
            }),
        ]);
        const timesheetByStaffId = new Map(timesheetRows.map((t) => [t.businessUserId, t]));
        const ruleByStaffId = new Map(staffRules.map((s) => [s.id, s.commissionRule]));
        const warnings = [];
        const rows = [];
        for (const c of commissionRows) {
            if (!hasRecognizedCommissionRule(ruleByStaffId.get(c.businessUserId))) {
                warnings.push(`${c.name} has no commission rule configured — commission calculated as $0`);
            }
            const { deducted, netPay } = await this.netAdvances(c.businessUserId, c.commission, month);
            const timesheet = timesheetByStaffId.get(c.businessUserId);
            rows.push({
                name: c.name,
                role: c.role,
                hoursWorked: timesheet?.hoursWorked ?? 0,
                overtimeHours: timesheet?.overtimeHours ?? 0,
                commission: c.commission,
                advancesDeducted: deducted,
                netPay,
            });
        }
        const workbook = new exceljs_1.default.Workbook();
        const sheet = workbook.addWorksheet(payroll_constants_1.PAYROLL_SHEET_TITLE);
        sheet.columns = payroll_constants_1.PAYROLL_COLUMNS;
        sheet.addRows(rows);
        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        const key = `payroll/${businessId}/payroll-${month}-${Date.now()}.xlsx`;
        const url = await this.s3.uploadAndSign(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { url, warnings };
    }
    async netAdvances(staffUserId, commission, month) {
        const outstanding = await this.tenantPrisma.client.staffAdvance.findMany({
            where: { staffUserId, status: prisma_1.StaffAdvanceStatus.outstanding },
            orderBy: { createdAt: 'asc' },
        });
        let remaining = commission;
        let deducted = 0;
        const toMarkDeducted = [];
        for (const advance of outstanding) {
            const amount = Number(advance.amount);
            if (amount <= remaining) {
                remaining -= amount;
                deducted += amount;
                toMarkDeducted.push(advance.id);
            }
        }
        if (toMarkDeducted.length > 0) {
            await this.tenantPrisma.client.staffAdvance.updateMany({
                where: { id: { in: toMarkDeducted } },
                data: { status: prisma_1.StaffAdvanceStatus.deducted, deductedInMonth: month },
            });
        }
        return {
            deducted: round2(deducted),
            netPay: round2(commission - deducted),
        };
    }
};
exports.PayrollService = PayrollService;
exports.PayrollService = PayrollService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        s3_service_1.S3Service,
        commissions_service_1.CommissionsService,
        timesheets_service_1.TimesheetsService])
], PayrollService);
//# sourceMappingURL=payroll.service.js.map