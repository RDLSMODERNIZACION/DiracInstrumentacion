import type { Role, User } from "./types";

export const ROLE_PERMS: Record<Role, Record<string, boolean>> = {
  operador: { canAck: true, canCommentAlarm: true, canCommand: false, canEditSetpoints: false, canShelve: false, canManageUsers: false },
  supervisor:{ canAck: true, canCommentAlarm: true, canCommand: true,  canEditSetpoints: true,  canShelve: true,  canManageUsers: false },
  mantenimiento:{ canAck: true, canCommentAlarm: true, canCommand: true,  canEditSetpoints: false, canShelve: false, canManageUsers: false },
  admin:{ canAck: true, canCommentAlarm: true, canCommand: true,  canEditSetpoints: true,  canShelve: true,  canManageUsers: true },
};

export type Perm = keyof (typeof ROLE_PERMS)["operador"];

export function hasPerm(user: User, perm: Perm) {
  return !!ROLE_PERMS[user.role][perm];
}
