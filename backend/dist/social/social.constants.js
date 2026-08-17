"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.META_FAMILY_PLATFORMS = exports.SOCIAL_WEBHOOK_QUEUE = exports.SOCIAL_ANALYTICS_QUEUE = exports.SOCIAL_PUBLISH_QUEUE = exports.SOCIAL_ERROR_CODES = void 0;
exports.SOCIAL_ERROR_CODES = {
    NOT_TOKEN_BASED: 'SOCIAL_NOT_TOKEN_BASED',
    INVALID_CREDENTIAL: 'SOCIAL_INVALID_CREDENTIAL',
    INVALID_OAUTH_STATE: 'SOCIAL_INVALID_OAUTH_STATE',
    ACCOUNT_NOT_CONNECTED: 'SOCIAL_ACCOUNT_NOT_CONNECTED',
    POST_NOT_FOUND: 'SOCIAL_POST_NOT_FOUND',
    POST_ALREADY_PUBLISHED: 'SOCIAL_POST_ALREADY_PUBLISHED',
    INBOX_ITEM_NOT_FOUND: 'SOCIAL_INBOX_ITEM_NOT_FOUND',
    MEDIA_ASSET_NOT_FOUND: 'SOCIAL_MEDIA_ASSET_NOT_FOUND',
};
exports.SOCIAL_PUBLISH_QUEUE = 'social-post-publish';
exports.SOCIAL_ANALYTICS_QUEUE = 'social-analytics-pull';
exports.SOCIAL_WEBHOOK_QUEUE = 'social-webhook-events';
exports.META_FAMILY_PLATFORMS = [
    'facebook',
    'instagram',
    'threads',
];
//# sourceMappingURL=social.constants.js.map