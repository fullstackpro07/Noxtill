"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_IMPORT_MIME_TYPES = exports.MAX_IMPORT_SIZE_BYTES = exports.EXECUTE_BATCH_SIZE = exports.CUSTOMER_IMPORT_QUEUE = void 0;
exports.CUSTOMER_IMPORT_QUEUE = 'customer-import';
exports.EXECUTE_BATCH_SIZE = 500;
exports.MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
exports.ALLOWED_IMPORT_MIME_TYPES = [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
//# sourceMappingURL=customer-import.constants.js.map