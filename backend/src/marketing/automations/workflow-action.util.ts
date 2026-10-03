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
    }
  | {
      /** Starts another active workflow of this business that uses the sub_workflow trigger. */
      type: 'run_workflow';
      workflowId: string;
    };

/** A workflow started by "Run another workflow" may itself start at most this many nested levels. */
export const MAX_SUB_WORKFLOW_DEPTH = 3;
