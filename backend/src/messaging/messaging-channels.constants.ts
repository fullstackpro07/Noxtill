export const MESSAGE_CHANNELS = ['whatsapp', 'sms', 'email'] as const;
export type MessageChannelValue = (typeof MESSAGE_CHANNELS)[number];

export const TEMPLATE_APPROVAL_STATUSES = [
  'approved',
  'pending',
  'rejected',
] as const;
export type TemplateApprovalStatus =
  (typeof TEMPLATE_APPROVAL_STATUSES)[number];

export interface TemplateApprovalEntry {
  status: TemplateApprovalStatus;
  reason?: string;
}
