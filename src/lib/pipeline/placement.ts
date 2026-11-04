export type Placement = { centerX: number; baselineY: number; heightFrac: number; lightFrom: "left" | "right" | "top" | "front" };
export type Rect = { left: number; top: number; width: number; height: number };

export const DEFAULT_PLACEMENT: Placement = { centerX: 0.5, baselineY: 0.8, heightFrac: 0.58, lightFrom: "left" };

export function sceneRect(cw: number, ch: number, W: number, H: number, p: Placement): Rect {
  const height = Math.round(H * p.heightFrac), width = Math.round((cw / ch) * height);
  return { left: Math.round(p.centerX * W - width / 2), top: Math.round(p.baselineY * H - height), width, height };
}
