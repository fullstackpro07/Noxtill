export declare const DEFAULT_JOB_OPTIONS: {
    attempts: number;
    backoff: {
        type: "exponential";
        delay: number;
    };
    removeOnComplete: number;
    removeOnFail: boolean;
};
export declare const dlqName: (queueName: string) => string;
export declare const DEMO_QUEUE = "demo";
export interface DemoJobData {
    shouldFail?: boolean;
}
export interface DeadLetterJobData {
    originalJobId: string;
    data: DemoJobData;
    failedReason?: string;
}
