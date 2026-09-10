export const MASTER_ADMIN_EMAIL = 'ux.siddharth@gmail.com';
export const SUPER_ADMIN_EMAILS = [MASTER_ADMIN_EMAIL];

export function normalizeEmail(email?: string | null): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

export function isMasterAdmin(email?: string | null): boolean {
  return normalizeEmail(email) === MASTER_ADMIN_EMAIL;
}