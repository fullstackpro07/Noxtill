"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUploadedFile = validateUploadedFile;
const app_exception_1 = require("../filters/app.exception");
const common_1 = require("@nestjs/common");
async function validateUploadedFile(file, rules) {
    if (file.size > rules.maxSizeBytes) {
        throw new app_exception_1.AppException('FILE_TOO_LARGE', `File exceeds the ${Math.floor(rules.maxSizeBytes / 1024 / 1024)}MB limit`, common_1.HttpStatus.BAD_REQUEST);
    }
    const { fileTypeFromBuffer } = await import('file-type');
    const sniffed = await fileTypeFromBuffer(file.buffer);
    const detectedMime = sniffed?.mime ?? file.mimetype;
    if (!rules.allowedMimeTypes.includes(detectedMime)) {
        throw new app_exception_1.AppException('UNSUPPORTED_FILE_TYPE', `File type "${detectedMime}" is not allowed here`, common_1.HttpStatus.BAD_REQUEST);
    }
}
//# sourceMappingURL=file-validation.util.js.map