import { Chip } from "@/components/ui";
import type { AssetView } from "@/lib/data/detail";
import { SHOT_LABEL } from "@/lib/domain/types";
import { AssetThumb } from "./asset-thumb";
import { Stepper } from "./stepper";

const STATUS = { muted: "text-muted", info: "text-info", warn: "text-warn", danger: "text-danger", ok: "text-ok" };

export function AssetCard({ item, selected, onOpen, frontUrl, cutoutUrl, actions }: { item: AssetView; selected?: boolean; onOpen?: () => void; frontUrl: string | null; cutoutUrl: string | null; actions?: React.ReactNode }) {
  const { view, asset, meta } = item;
  return (
    <article className={`relative flex flex-col gap-2 rounded-xl border bg-surface p-2.5 ${selected ? "border-info" : "border-line"}`}>
      <button type="button" onClick={onOpen} aria-label={`Open ${SHOT_LABEL[asset.shot_key]}`} className="block w-full text-left">
        <AssetThumb item={item} frontUrl={frontUrl} cutoutUrl={cutoutUrl} />
      </button>
      <span className="pointer-events-none absolute left-4 top-4"><Chip tone={view.chip.tone} spin={view.chip.spin}>{view.chip.label}</Chip></span>
      <div className="min-w-0" title={meta}>
        <div className="truncate text-[13px] font-semibold">{SHOT_LABEL[asset.shot_key]}{asset.version > 1 && <span className="ml-1 text-xs font-normal text-muted">v{asset.version}</span>}</div>
        <div className="truncate text-xs leading-4 text-muted">{meta}</div>
      </div>
      <Stepper steps={view.steps} statuses={view.statuses} label={view.stepLabel} />
      {view.status && <div className={`line-clamp-2 text-xs leading-4 ${STATUS[view.statusTone]}`}>{view.status}</div>}
      {actions && <div className="mt-auto flex flex-col gap-1.5">{actions}</div>}
    </article>
  );
}
