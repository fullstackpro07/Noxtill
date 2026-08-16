export interface WorkflowAction {
    type: 'send_customer_message' | 'notify_owner';
    messageBody: string;
}
