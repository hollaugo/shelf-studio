import { Chip } from "@/components/ui";
import type { AssetView } from "@/lib/data/detail";
import { SHOT_LABEL } from "@/lib/domain/types";
import { AssetThumb } from "./asset-thumb";
import { CheckDots, Stepper } from "./stepper";

const STATUS = { muted: "text-muted", info: "text-info", warn: "text-warn", danger: "text-danger", ok: "text-ok" };

export function AssetCard({ item, selected, onOpen, frontUrl, cutoutUrl, actions }: { item: AssetView; selected?: boolean; onOpen?: () => void; frontUrl: string | null; cutoutUrl: string | null; actions?: React.ReactNode }) {
  const { view, asset, meta } = item;
  return (
    <article className={`flex flex-col gap-3 rounded-2xl border bg-surface p-3.5 ${selected ? "border-info" : "border-line"}`}>
      <button type="button" onClick={onOpen} aria-label={`Open ${SHOT_LABEL[asset.shot_key]}`} className="block w-full text-left">
        <AssetThumb item={item} frontUrl={frontUrl} cutoutUrl={cutoutUrl} />
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{SHOT_LABEL[asset.shot_key]}{asset.version > 1 && <span className="ml-1.5 text-xs font-normal text-muted">v{asset.version}</span>}</div>
          <div className="text-xs leading-4 text-muted">{meta}</div>
        </div>
        <Chip tone={view.chip.tone} spin={view.chip.spin}>{view.chip.label}</Chip>
      </div>
      <Stepper steps={view.steps} statuses={view.statuses} label={view.stepLabel} />
      {view.dots && <CheckDots {...view.dots} />}
      {view.status && <div className={`text-xs leading-4 ${STATUS[view.statusTone]}`}>{view.status}</div>}
      {actions && <div className="mt-auto flex flex-col gap-2">{actions}</div>}
    </article>
  );
}
