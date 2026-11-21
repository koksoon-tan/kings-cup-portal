// Mirror of functions/src/common.ts – keep in sync.
export type Role = "superadmin" | "admin" | "ops" | "sales";
export const ROLES: Role[] = ["superadmin", "admin", "ops", "sales"];
export type Area =
  | "staff" | "settings" | "decks" | "inventory" | "orders"
  | "customers" | "codes" | "corporates" | "invoices" | "samples";

export const PERMISSIONS: Record<Area, Role[]> = {
  staff: ["superadmin"],
  settings: ["superadmin", "admin"],
  decks: ["superadmin", "admin"],
  inventory: ["superadmin", "admin", "ops"],
  orders: ["superadmin", "admin", "ops"],
  customers: ["superadmin", "admin", "ops", "sales"],
  codes: ["superadmin", "admin", "ops"],
  corporates: ["superadmin", "admin", "sales"],
  invoices: ["superadmin", "admin", "sales"],
  samples: ["superadmin", "admin", "ops", "sales"],
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  superadmin: "Everything, including staff accounts",
  admin: "Everything except staff accounts",
  ops: "Inventory, orders, customers and serial codes",
  sales: "Corporates, samples, invoices and customers",
};

export function canAccess(role: Role | null, area: Area) {
  return !!role && PERMISSIONS[area].includes(role);
}
