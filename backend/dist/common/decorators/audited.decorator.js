"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Audited = exports.AUDIT_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.AUDIT_KEY = 'audit';
const Audited = (action, entity) => (0, common_1.SetMetadata)(exports.AUDIT_KEY, { action, entity });
exports.Audited = Audited;
//# sourceMappingURL=audited.decorator.js.map