import type { Role } from "./types";

export type Action = "run" | "refine" | "submit" | "review" | "publish" | "edit_settings" | "view_metrics";

const MATRIX: Record<Action, Role[]> = {
  run: ["producer", "owner"],
  refine: ["producer", "owner"],
  submit: ["producer", "owner"],
  review: ["reviewer"],
  publish: ["producer", "owner"],
  edit_settings: ["owner"],
  view_metrics: ["owner"],
};

export function can(role: Role, action: Action) {
  return MATRIX[action].includes(role);
}
