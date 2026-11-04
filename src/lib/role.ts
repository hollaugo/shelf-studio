import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@/lib/domain/types";

const ROLES: Role[] = ["producer", "reviewer", "owner"];

/** Demo roles, set by the switcher in the header. Everyone shares one demo sign-in, so this is not access control. */
export async function getRole(): Promise<Role> {
  const value = (await cookies()).get("role")?.value;
  return ROLES.includes(value as Role) ? (value as Role) : "producer";
}
