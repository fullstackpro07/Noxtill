"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
function toMessage(value, fallback) {
    return typeof value === 'string' ? value : fallback;
}
let HttpExceptionFilter = class HttpExceptionFilter {
    logger = new common_1.Logger('ExceptionFilter');
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const { status, body } = this.normalize(exception);
        if (status >= 500) {
            this.logger.error(exception instanceof Error ? exception.stack : exception);
        }
        response.status(status).json({ error: body });
    }
    normalize(exception) {
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                return {
                    status,
                    body: { code: this.codeFromStatus(status), message: res },
                };
            }
            const resObj = res;
            if (typeof resObj.code === 'string') {
                return {
                    status,
                    body: {
                        code: resObj.code,
                        message: toMessage(resObj.message, resObj.code),
                    },
                };
            }
            if (Array.isArray(resObj.message)) {
                return {
                    status,
                    body: {
                        code: 'VALIDATION_ERROR',
                        message: 'Request validation failed',
                        fields: this.groupFieldErrors(resObj.message),
                    },
                };
            }
            return {
                status,
                body: {
                    code: this.codeFromStatus(status),
                    message: toMessage(resObj.message, 'Request failed'),
                },
            };
        }
        return {
            status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
        };
    }
    codeFromStatus(status) {
        return common_1.HttpStatus[status] ?? 'ERROR';
    }
    groupFieldErrors(messages) {
        const fields = {};
        for (const msg of messages) {
            const [field] = msg.split(' ');
            fields[field] = fields[field] ?? [];
            fields[field].push(msg);
        }
        return fields;
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = __decorate([
    (0, common_1.Catch)()
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map