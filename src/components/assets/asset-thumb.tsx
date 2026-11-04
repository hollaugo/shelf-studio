import { Spinner } from "@/components/ui";
import { Img } from "@/components/ui/image";
import type { AssetView } from "@/lib/data/detail";

const FRAME = "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px]";

function Overlay({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "danger" }) {
  return <span className={`absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-xs leading-4 ${tone === "danger" ? "bg-danger-bg text-danger" : "bg-canvas text-fg"}`}>{children}</span>;
}

function Silhouette({ stroke = "#55555c" }: { stroke?: string }) {
  return (
    <svg width="74" height="136" viewBox="0 0 60 110" fill="none" stroke={stroke} strokeWidth="1.5" aria-hidden="true">
      <rect x="20" y="4" width="20" height="18" rx="3" />
      <rect x="8" y="24" width="44" height="82" rx="16" />
    </svg>
  );
}

export function AssetThumb({ item, frontUrl, cutoutUrl }: { item: AssetView; frontUrl: string | null; cutoutUrl: string | null }) {
  const { view, asset, url, sceneUrl, drawnPack } = item;
  const alt = asset.alt_text ?? asset.shot_key;
  const hero = asset.shot_key === "hero";

  switch (view.thumb) {
    case "empty":
      return <div className={`${FRAME} border border-dashed border-line-dashed bg-placeholder text-xs text-muted`}>Not generated</div>;
    case "locked":
      return (
        <div className={`${FRAME} flex-col gap-2 border border-dashed border-line-dashed bg-placeholder text-xs text-muted`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Waiting for Lifestyle
        </div>
      );
    case "skeleton":
      return <div className={`${FRAME} bg-control`}><Silhouette stroke="#333338" /><Overlay>{asset.state === "compositing" ? "Rendering on white" : "Waiting to start"}</Overlay></div>;
    case "generating":
      return <div className={`${FRAME} shimmer`}>{frontUrl ? <Img src={frontUrl} alt="" contain className="absolute inset-0 opacity-15" sizes="160px" /> : <Silhouette />}<Overlay>{drawnPack ? (asset.shot_key === "claim_card" ? "Drawing the card" : "Drawing the image") : asset.shot_key === "claim_card" || (asset.refine as { engine?: string } | null)?.engine === "model" ? "Drawing the text" : (asset.refine as { action?: string } | null)?.action === "edit_video" ? "Editing with Aleph" : asset.shot_key === "video" ? "Animating Lifestyle" : "Scene only, no product"}</Overlay></div>;
    case "compositing":
      if (drawnPack) return <div className={`${FRAME} bg-control`}>{sceneUrl && <Img src={sceneUrl} alt="" className="absolute inset-0" />}<Overlay>Finishing the image</Overlay></div>;
      return (
        <div className={`${FRAME} bg-control`}>
          {sceneUrl && <Img src={sceneUrl} alt="" className="absolute inset-0 blur-sm brightness-90" />}
          {cutoutUrl && <Img src={cutoutUrl} alt="Real packshot being placed on the scene" contain className="relative h-3/5 w-1/2" sizes="160px" />}
          <Overlay>Placing real packshot</Overlay>
        </div>
      );
    case "failed":
      return (
        <div className={`${FRAME} border border-danger-bg bg-danger-well`}>
          <span className="flex w-full flex-col gap-2 p-4 text-danger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5" /><path d="M12 18v.5" /></svg>
            <span className="font-semibold">{view.failure?.title}</span>
            {view.failure?.code && <span className="break-words font-mono text-xs text-body">{view.failure.code}</span>}
          </span>
        </div>
      );
    case "copy":
      return <CopyThumb content={asset.content as { title?: string } | null} />;
    case "checking":
    case "blocked":
    case "dimmed":
    case "image":
    default:
      if (asset.shot_key === "video" && url)
        return <div className={`${FRAME} bg-canvas`}><video src={url} muted autoPlay playsInline loop preload="metadata" aria-label={alt} className="h-full" /></div>;
      return (
        <div className={`${FRAME} ${hero ? "bg-white" : "bg-control"}`}>
          {url ? <Img src={url} alt={alt} contain className={`absolute inset-0 ${view.thumb === "dimmed" ? "opacity-40" : view.thumb === "blocked" ? "opacity-55" : ""}`} /> : frontUrl && <Img src={frontUrl} alt="" contain className="absolute inset-0" />}
          {view.thumb === "checking" && <Overlay><Spinner /> Running checks</Overlay>}
        </div>
      );
  }
}

function CopyThumb({ content }: { content: { title?: string } | null }) {
  return (
    <div className={`${FRAME} items-start justify-start bg-well p-4`}>
      {content?.title ? <span className="line-clamp-6 text-[13px] leading-[18px] text-body">{content.title}</span> : <span className="text-xs text-muted">Product copy will appear here</span>}
    </div>
  );
}
