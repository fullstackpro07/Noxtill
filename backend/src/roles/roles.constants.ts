export const CUSTOM_ROLE_ERROR_CODES = {
  NOT_FOUND: 'custom_role.not_found',
  DUPLICATE_NAME: 'custom_role.duplicate_name',
  UNKNOWN_CAPABILITY: 'custom_role.unknown_capability',
  IN_USE: 'custom_role.in_use',
} as const;

/** Staff module v2 — Roles & Permissions system-role overrides (UPD-BE-STAFF-01). */
export const SYSTEM_ROLE_OVERRIDE_ERROR_CODES = {
  UNKNOWN_CAPABILITY: 'system_role_override.unknown_capability',
  /// `owner` can never be overridden (see `CapabilitiesService.resolve`) — this is the 400 a
  /// caller gets if they try anyway, rather than the write silently doing nothing.
  OWNER_NOT_OVERRIDABLE: 'system_role_override.owner_not_overridable',
} as const;
