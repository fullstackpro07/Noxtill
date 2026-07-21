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
var BookingRemindersProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingRemindersProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const send_gate_service_1 = require("../../messaging/send-gate.service");
const booking_reminders_constants_1 = require("./booking-reminders.constants");
const prisma_1 = require("../../../generated/prisma");
let BookingRemindersProcessor = BookingRemindersProcessor_1 = class BookingRemindersProcessor extends bullmq_1.WorkerHost {
    prisma;
    sendGate;
    logger = new common_1.Logger(BookingRemindersProcessor_1.name);
    constructor(prisma, sendGate) {
        super();
        this.prisma = prisma;
        this.sendGate = sendGate;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        const now = job.data?.now ? new Date(job.data.now) : new Date();
        return this.runReminders(now);
    }
    async runReminders(now = new Date()) {
        const windowMs = booking_reminders_constants_1.BOOKING_REMINDER_WINDOW_MIN * 60 * 1000;
        let sent = 0;
        for (const hours of booking_reminders_constants_1.BOOKING_REMINDER_HOUR_OFFSETS) {
            const dueAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
            const appointments = await this.prisma.appointment.findMany({
                where: {
                    status: {
                        in: [prisma_1.AppointmentStatus.booked, prisma_1.AppointmentStatus.confirmed],
                    },
                    startsAt: { gte: dueAt, lt: new Date(dueAt.getTime() + windowMs) },
                },
                include: { service: true },
            });
            for (const appointment of appointments) {
                await this.sendGate
                    .send({
                    businessId: appointment.businessId,
                    customerId: appointment.customerId,
                    templateKey: 'booking_reminder',
                    variables: {
                        serviceName: appointment.service.name,
                        dateTime: appointment.startsAt.toISOString(),
                    },
                })
                    .catch(() => undefined);
                sent += 1;
            }
        }
        this.logger.debug(`Booking reminders sent for ${sent} appointment(s)`);
    }
};
exports.BookingRemindersProcessor = BookingRemindersProcessor;
exports.BookingRemindersProcessor = BookingRemindersProcessor = BookingRemindersProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(booking_reminders_constants_1.BOOKING_REMINDERS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService])
], BookingRemindersProcessor);
//# sourceMappingURL=booking-reminders.processor.js.map