import { ActivityEventType, WorkflowTriggerKey } from '../../../generated/prisma';
export declare function mapActivityEventToTriggerKey(type: ActivityEventType, description: string): WorkflowTriggerKey | null;
