import type {
  HubCategory,
  HubConnectKind,
  HubCredentialField,
  HubDirection,
  HubSyncMode,
} from './hub.catalog';

export type HubStatus =
  'connected' | 'needs_attention' | 'paused' | 'not_connected';

export type AttentionCode =
  | 'auth_failed'
  | 'auth_expired'
  | 'token_expiring'
  | 'sync_failing'
  | 'conflicts_pending'
  | 'records_failed';

export interface AttentionReason {
  code: AttentionCode;
  /** Short line shown on the connection ("Token expires in 6 days"). */
  text: string;
  severity: 'critical' | 'high' | 'medium';
}

export interface HubToken {
  state: 'valid' | 'expiring' | 'expired' | 'not_applicable';
  label: string;
  expiresAt: string | null;
}

export interface HubProviderCard {
  key: string;
  name: string;
  initials: string;
  category: HubCategory;
  benefit: string;
  direction: HubDirection;
  modules: string[];
  permissions: string;
  connectKind: HubConnectKind;
  credentialFields: HubCredentialField[];
  workspaceHref: string | null;
  /** True when the platform's OAuth/API credentials for this provider are not configured. */
  setupRequired: boolean;
  status: HubStatus;
  connectedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  records: number | null;
  recordsUnit: string;
  syncMode: HubSyncMode;
  syncNote: string;
  errorsToday: number;
  token: HubToken;
  attention: AttentionReason[];
  externalAccountName: string | null;
  canPause: boolean;
  canSync: boolean;
}

export type FindingSeverity = 'critical' | 'high' | 'medium';

export interface AdvisorFinding {
  key: string;
  severity: FindingSeverity;
  icon: string;
  providerKey: string | null;
  finding: string;
  why: string;
  affectedModules: string[];
  recordsAffected: string;
  primaryAction: {
    label: string;
    kind: 'reconnect' | 'resolve' | 'fix-mapping' | 'open' | 'retry' | 'revoke';
    /** Where the UI sends the owner (tab path or provider drawer). */
    target: string;
  };
}

export interface HubHealth {
  headline: string;
  allHealthy: boolean;
  needsAttention: number;
  connected: number;
  healthy: number;
  paused: number;
  available: number;
  syncErrorsToday: number;
  syncErrorsAcrossConnections: number;
}
