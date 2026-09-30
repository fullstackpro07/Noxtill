import type { WorkflowDataMapping } from './workflow-data-mapper.util';

export type WorkflowAction =
  | {
      type: 'send_customer_message' | 'notify_owner';
      messageBody: string;
    }
  | {
      type: 'add_customer_tag';
      tagName: string;
    }
  | {
      type: 'set_customer_custom_field';
      fieldName: string;
      value: string | number | null;
    }
  | {
      type: 'wait';
      durationMinutes: number;
    }
  | {
      type: 'request_approval';
      title: string;
      description: string;
    }
  | {
      type: 'generate_ai_draft';
      prompt: string;
    }
  | {
      type: 'map_data';
      mappings: WorkflowDataMapping[];
    }
  | {
      type: 'get_variable';
      name: string;
      scope: 'business' | 'workflow';
    };
