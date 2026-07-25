"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_WINDOW_MS = exports.HAIKU_OUTPUT_COST_PER_TOKEN = exports.HAIKU_INPUT_COST_PER_TOKEN = exports.AI_ERROR_CODES = void 0;
exports.AI_ERROR_CODES = {
    RATE_LIMITED: 'AI_RATE_LIMITED',
    COST_CAP_EXCEEDED: 'AI_COST_CAP_EXCEEDED',
};
exports.HAIKU_INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
exports.HAIKU_OUTPUT_COST_PER_TOKEN = 4 / 1_000_000;
exports.RATE_LIMIT_WINDOW_MS = 60_000;
//# sourceMappingURL=ai-infra.constants.js.map