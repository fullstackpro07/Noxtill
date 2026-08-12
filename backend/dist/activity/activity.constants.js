"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVITY_HISTORY_BACKFILL = void 0;
exports.activityChannel = activityChannel;
function activityChannel(businessId) {
    return `activity:${businessId}`;
}
exports.ACTIVITY_HISTORY_BACKFILL = 50;
//# sourceMappingURL=activity.constants.js.map