"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPORT_KINDS = exports.EXPORTS_QUEUE = void 0;
exports.isExportKind = isExportKind;
exports.EXPORTS_QUEUE = 'account-zip-export';
exports.EXPORT_KINDS = [
    'sales',
    'customers',
    'credit',
    'stock',
    'expenses',
];
function isExportKind(value) {
    return exports.EXPORT_KINDS.includes(value);
}
//# sourceMappingURL=exports.constants.js.map