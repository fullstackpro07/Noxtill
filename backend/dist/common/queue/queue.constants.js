"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_QUEUE = exports.dlqName = exports.DEFAULT_JOB_OPTIONS = void 0;
exports.DEFAULT_JOB_OPTIONS = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: false,
};
const dlqName = (queueName) => `${queueName}-dlq`;
exports.dlqName = dlqName;
exports.DEMO_QUEUE = 'demo';
//# sourceMappingURL=queue.constants.js.map