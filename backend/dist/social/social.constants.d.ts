export declare const SOCIAL_ERROR_CODES: {
    readonly NOT_TOKEN_BASED: "SOCIAL_NOT_TOKEN_BASED";
    readonly INVALID_CREDENTIAL: "SOCIAL_INVALID_CREDENTIAL";
    readonly INVALID_OAUTH_STATE: "SOCIAL_INVALID_OAUTH_STATE";
    readonly ACCOUNT_NOT_CONNECTED: "SOCIAL_ACCOUNT_NOT_CONNECTED";
    readonly POST_NOT_FOUND: "SOCIAL_POST_NOT_FOUND";
    readonly POST_ALREADY_PUBLISHED: "SOCIAL_POST_ALREADY_PUBLISHED";
    readonly INBOX_ITEM_NOT_FOUND: "SOCIAL_INBOX_ITEM_NOT_FOUND";
    readonly MEDIA_ASSET_NOT_FOUND: "SOCIAL_MEDIA_ASSET_NOT_FOUND";
};
export declare const SOCIAL_PUBLISH_QUEUE = "social-post-publish";
export declare const SOCIAL_ANALYTICS_QUEUE = "social-analytics-pull";
export declare const SOCIAL_WEBHOOK_QUEUE = "social-webhook-events";
export declare const META_FAMILY_PLATFORMS: readonly ["facebook", "instagram", "threads"];
