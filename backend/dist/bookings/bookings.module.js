"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const public_booking_service_1 = require("./public-booking.service");
const appointments_service_1 = require("./appointments.service");
const public_booking_controller_1 = require("./public-booking.controller");
const public_appointment_controller_1 = require("./public-appointment.controller");
const appointments_controller_1 = require("./appointments.controller");
const booking_reminders_scheduler_1 = require("./jobs/booking-reminders.scheduler");
const booking_reminders_processor_1 = require("./jobs/booking-reminders.processor");
const booking_reminders_constants_1 = require("./jobs/booking-reminders.constants");
const messaging_module_1 = require("../messaging/messaging.module");
const reviews_module_1 = require("../reviews/reviews.module");
let BookingsModule = class BookingsModule {
};
exports.BookingsModule = BookingsModule;
exports.BookingsModule = BookingsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: booking_reminders_constants_1.BOOKING_REMINDERS_QUEUE }),
            messaging_module_1.MessagingModule,
            reviews_module_1.ReviewsModule,
        ],
        controllers: [
            public_booking_controller_1.PublicBookingController,
            public_appointment_controller_1.PublicAppointmentController,
            appointments_controller_1.AppointmentsController,
        ],
        providers: [
            public_booking_service_1.PublicBookingService,
            appointments_service_1.AppointmentsService,
            booking_reminders_scheduler_1.BookingRemindersScheduler,
            booking_reminders_processor_1.BookingRemindersProcessor,
        ],
        exports: [public_booking_service_1.PublicBookingService, appointments_service_1.AppointmentsService],
    })
], BookingsModule);
//# sourceMappingURL=bookings.module.js.map