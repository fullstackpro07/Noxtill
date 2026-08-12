"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const dashboard_service_1 = require("./dashboard.service");
const dashboard_controller_1 = require("./dashboard.controller");
const health_score_service_1 = require("./health-score.service");
const health_score_controller_1 = require("./health-score.controller");
const health_score_snapshot_scheduler_1 = require("./jobs/health-score-snapshot.scheduler");
const health_score_snapshot_processor_1 = require("./jobs/health-score-snapshot.processor");
const ai_insights_service_1 = require("./ai-insights.service");
const ai_insights_controller_1 = require("./ai-insights.controller");
const ai_insights_scheduler_1 = require("./jobs/ai-insights.scheduler");
const ai_insights_processor_1 = require("./jobs/ai-insights.processor");
const dashboard_constants_1 = require("./dashboard.constants");
const widgets_module_1 = require("../widgets/widgets.module");
const profit_module_1 = require("../profit/profit.module");
const ai_module_1 = require("../ai/ai.module");
const action_center_service_1 = require("./action-center.service");
const action_center_controller_1 = require("./action-center.controller");
let DashboardModule = class DashboardModule {
};
exports.DashboardModule = DashboardModule;
exports.DashboardModule = DashboardModule = __decorate([
    (0, common_1.Module)({
        imports: [
            widgets_module_1.WidgetsModule,
            profit_module_1.ProfitModule,
            ai_module_1.AiModule,
            bullmq_1.BullModule.registerQueue({ name: dashboard_constants_1.HEALTH_SCORE_SNAPSHOT_QUEUE }, { name: dashboard_constants_1.AI_INSIGHTS_QUEUE }),
        ],
        controllers: [
            dashboard_controller_1.DashboardController,
            health_score_controller_1.HealthScoreController,
            ai_insights_controller_1.AiInsightsController,
            action_center_controller_1.ActionCenterController,
        ],
        providers: [
            dashboard_service_1.DashboardService,
            health_score_service_1.HealthScoreService,
            health_score_snapshot_scheduler_1.HealthScoreSnapshotScheduler,
            health_score_snapshot_processor_1.HealthScoreSnapshotProcessor,
            ai_insights_service_1.AiInsightsService,
            ai_insights_scheduler_1.AiInsightsScheduler,
            ai_insights_processor_1.AiInsightsProcessor,
            action_center_service_1.ActionCenterService,
        ],
    })
], DashboardModule);
//# sourceMappingURL=dashboard.module.js.map