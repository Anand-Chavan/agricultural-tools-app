export type Permission =
  | 'dashboard:read'
  | 'products:read'
  | 'products:write'
  | 'products:cost'
  | 'inventory:read'
  | 'inventory:adjust'
  | 'purchases:read'
  | 'purchases:write'
  | 'purchases:receive'
  | 'purchases:pay'
  | 'customers:read'
  | 'customers:write'
  | 'sales:read'
  | 'sales:write'
  | 'sales:issue'
  | 'sales:pay'
  | 'sales:void'
  | 'sales:return'
  | 'reports:read'
  | 'users:manage'
  | 'settings:manage'
  | 'audit:read';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Admin: [
    'dashboard:read',
    'products:read',
    'products:write',
    'products:cost',
    'inventory:read',
    'inventory:adjust',
    'purchases:read',
    'purchases:write',
    'purchases:receive',
    'purchases:pay',
    'customers:read',
    'customers:write',
    'sales:read',
    'sales:write',
    'sales:issue',
    'sales:pay',
    'sales:void',
    'sales:return',
    'reports:read',
    'users:manage',
    'settings:manage',
    'audit:read',
  ],
  Manager: [
    'dashboard:read',
    'products:read',
    'products:write',
    'products:cost',
    'inventory:read',
    'inventory:adjust',
    'purchases:read',
    'purchases:write',
    'purchases:receive',
    'purchases:pay',
    'customers:read',
    'customers:write',
    'sales:read',
    'sales:write',
    'sales:issue',
    'sales:pay',
    'sales:void',
    'sales:return',
    'reports:read',
    'audit:read',
  ],
  Sales: [
    'dashboard:read',
    'products:read',
    'customers:read',
    'customers:write',
    'sales:read',
    'sales:write',
    'sales:issue',
    'sales:pay',
    'sales:return',
    'reports:read',
  ],
  Inventory: [
    'dashboard:read',
    'products:read',
    'products:write',
    'products:cost',
    'inventory:read',
    'inventory:adjust',
    'purchases:read',
    'purchases:write',
    'purchases:receive',
    'purchases:pay',
    'reports:read',
  ],
  'Read-only': [
    'dashboard:read',
    'products:read',
    'inventory:read',
    'purchases:read',
    'customers:read',
    'sales:read',
    'reports:read',
  ],
};

export function hasPermission(
  permissions: string[] | undefined,
  required: Permission | Permission[],
): boolean {
  if (!permissions?.length) return false;
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((p) => permissions.includes(p));
}
