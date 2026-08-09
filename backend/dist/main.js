"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const MIN_SECRET_LENGTH = 22;
const PLACEHOLDER_SECRETS = new Set(['your-secret', 'your-refresh-secret']);
function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
        const value = process.env[name];
        const problem = !value
            ? 'is not set'
            : PLACEHOLDER_SECRETS.has(value)
                ? 'is still the dev placeholder value'
                : value.length < MIN_SECRET_LENGTH
                    ? `is only ${value.length} chars (spec §6 requires ≥${MIN_SECRET_LENGTH})`
                    : null;
        if (!problem)
            continue;
        const message = `${name} ${problem} — refusing to sign real sessions with a weak secret.`;
        if (isProd) {
            throw new Error(message);
        }
        console.warn(`⚠️  ${message}`);
    }
}
async function bootstrap() {
    validateEnv();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.use((0, helmet_1.default)());
    const corsAllowlist = (process.env.CORS_ALLOWLIST ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim());
    app.enableCors({ origin: corsAllowlist, credentials: true });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.setGlobalPrefix('api/v1');
    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
//# sourceMappingURL=main.js.map