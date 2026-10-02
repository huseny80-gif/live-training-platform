// Registered, active staff accounts can manage the platform profile.
// Participant join tokens are never instructor accounts.
export function canEditAbout(account: { role: string; isActive: boolean } | null) {
  return Boolean(account?.isActive && ["ADMIN", "INSTRUCTOR"].includes(account.role));
}
