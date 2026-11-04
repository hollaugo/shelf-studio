"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Button, Chip, Notice, Panel, Spinner } from "@/components/ui";
import { LIMITS, validateListing, type Listing } from "@/lib/agent/channel-rules";
import { CHANNEL_LABEL, type Asset, type Channel } from "@/lib/domain/types";

function Field({ label, value, limit, hint }: { label: string; value: string; limit?: number; hint?: string }) {
  const over = limit !== undefined && value.length > limit;
  return (
    <div className="border-t border-line-soft py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs tracking-[0.04em] text-muted">{label}</span>
        {limit !== undefined && <span className={`text-xs ${over ? "text-danger" : "text-muted"}`}>{value.length} / {limit}</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-body">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ListingView({ listing, channel }: { listing: Listing; channel: Channel }) {
  const limit = LIMITS[channel];
  const violations = useMemo(() => validateListing(channel, listing), [channel, listing]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {violations.length === 0 ? <Chip tone="ok">Passes every {CHANNEL_LABEL[channel]} rule</Chip> : violations.map((v, i) => <Chip key={i} tone={v.severity === "fail" ? "danger" : "warn"}>{v.field}: {v.detail}</Chip>)}
      </div>
      <Field label="TITLE" value={listing.title} limit={limit.title} />
      {listing.itemHighlights && <Field label="ITEM HIGHLIGHTS" value={listing.itemHighlights} limit={limit.highlights} />}
      {listing.shortDescription && <Field label="SHORT DESCRIPTION" value={listing.shortDescription} limit={limit.shortDescription} />}
      {listing.metaTitle && <Field label="META TITLE · SEO" value={listing.metaTitle} limit={limit.metaTitle} />}
      {listing.metaDescription && <Field label="META DESCRIPTION · SEO" value={listing.metaDescription} limit={limit.metaDescription} />}
      <div className="border-t border-line-soft py-3">
        <div className="text-xs tracking-[0.04em] text-muted">{channel === "walmart" ? "KEY FEATURES" : "BULLETS"} · {listing.bullets.length}</div>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 text-body">
          {listing.bullets.map((b, i) => <li key={i}>{b} <span className={`text-xs ${b.length > limit.bullet ? "text-danger" : "text-muted"}`}>({b.length}/{limit.bullet})</span></li>)}
        </ul>
      </div>
      <Field label="DESCRIPTION" value={listing.description} limit={limit.description} />
      {listing.searchTerms && <Field label="BACKEND SEARCH TERMS" value={listing.searchTerms} hint="Not shown to shoppers." />}
      {listing.faq && (
        <div className="border-t border-line-soft py-3">
          <div className="text-xs tracking-[0.04em] text-muted">FAQ · AEO</div>
          <dl className="mt-1 space-y-2">
            {listing.faq.map((f, i) => <div key={i}><dt className="font-semibold">{f.question}</dt><dd className="text-body">{f.answer}</dd></div>)}
          </dl>
        </div>
      )}
      <Field label="ALT TEXT" value={listing.altText} />
    </div>
  );
}

const TOOL_LABEL: Record<string, [string, string]> = {
  "tool-load_channel_skill": ["Reading the channel's rules", "Read the channel's rules"],
  "tool-validate_listing": ["Validating against the rules", "Validated"],
  "tool-save_listing": ["Saving the listing", "Saved"],
};

function LiveDraft({ input }: { input: Partial<Listing> }) {
  const rows: [string, string | undefined][] = [["Title", input.title], ["Item highlights", input.itemHighlights], ["Short description", input.shortDescription], ["Meta title", input.metaTitle], ["Meta description", input.metaDescription]];
  return (
    <div className="my-2 space-y-2">
      {rows.filter(([, v]) => v).map(([label, v]) => <div key={label}><span className="text-xs text-muted">{label}</span><p className="text-body">{v}</p></div>)}
      {!!input.bullets?.length && <div><span className="text-xs text-muted">Bullets</span><ul className="list-disc pl-5 text-body">{input.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
      {input.description && <div><span className="text-xs text-muted">Description</span><p className="whitespace-pre-wrap text-body">{input.description}</p></div>}
      {!!input.faq?.length && <div><span className="text-xs text-muted">FAQ</span>{input.faq.map((f, i) => <p key={i} className="text-body"><b>{f?.question}</b> {f?.answer}</p>)}</div>}
    </div>
  );
}

function Activity({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (part.type === "text") return <p key={i} className="whitespace-pre-wrap text-body">{part.text}</p>;
        const label = TOOL_LABEL[part.type];
        if (!label) return null;
        const tool = part as { state: string; input?: Partial<Listing>; output?: { passed?: boolean; saved?: boolean; violations?: { field: string; detail: string; severity: string }[] } };
        const finished = tool.state === "output-available";
        if (tool.state === "input-streaming" && tool.input && part.type === "tool-validate_listing") return <LiveDraft key={i} input={tool.input} />;
        const problems = tool.output?.violations?.filter((v) => v.severity === "fail") ?? [];
        return (
          <div key={i} className="my-2 rounded-lg border border-line-soft bg-well px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              {finished ? <span aria-hidden="true" className={problems.length ? "text-warn" : "text-ok"}>●</span> : <span className="text-info"><Spinner /></span>}
              {finished ? label[1] : label[0]}
              {finished && part.type === "tool-validate_listing" && <span>{problems.length ? `· ${problems.length} to fix` : "· all rules pass"}</span>}
            </span>
            {problems.map((p, n) => <span key={n} className="mt-1 block text-xs text-warn">{p.field}: {p.detail}</span>)}
            {part.type === "tool-validate_listing" && tool.input && <LiveDraft input={tool.input} />}
          </div>
        );
      })}
    </>
  );
}

/** `compact` shows only live progress, for when the page preview is already showing the finished listing. */
export function CopyStudio({ asset, canWrite, compact, startSignal = 0, onRunningChange }: { asset: Asset; canWrite: boolean; compact?: boolean; startSignal?: number; onRunningChange?: (running: boolean) => void }) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: asset.id,
    transport: new DefaultChatTransport({ api: `/api/assets/${asset.id}/copy` }),
    onFinish: () => router.refresh(),
  });
  const running = status === "submitted" || status === "streaming";
  const agent = messages.filter((m) => m.role === "assistant");
  const listing = asset.content as Listing | null;
  useEffect(() => { if (running) end.current?.scrollIntoView({ block: "nearest" }); }, [messages, running]);
  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);

  const canStart = canWrite && !running && (asset.state === "draft" || asset.state === "failed");
  const start = () => { setMessages([]); sendMessage({ text: `Write the ${CHANNEL_LABEL[asset.channel]} listing.` }); };
  // The card and the preview can start the agent too, so there's one way to watch it write.
  const started = useRef(startSignal);
  useEffect(() => {
    if (startSignal === started.current) return;
    started.current = startSignal;
    if (canStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new signal should start the agent
  }, [startSignal]);
  const background = asset.state === "generating" && !running;
  if (compact && !running && !background && asset.state !== "failed") return null;

  return (
    <Panel title={<span className="flex items-center justify-between gap-3">PRODUCT COPY · {CHANNEL_LABEL[asset.channel].toUpperCase()} {running && <Chip tone="info" spin>Agent writing</Chip>}</span>}>
      {error && <div className="mb-3"><Notice title="The agent stopped early">{error.message}</Notice></div>}
      {asset.state === "failed" && !running && <div className="mb-3"><Notice title="This listing wasn't finished">{asset.failure_message}</Notice></div>}
      {agent.length > 0 && (
        <div className="mb-4 max-h-[420px] overflow-y-auto rounded-[10px] border border-line-soft bg-table p-4">
          {agent.map((m) => <Activity key={m.id} message={m} />)}
          <div ref={end} />
        </div>
      )}
      {background && <p className="flex items-center gap-2 text-info"><Spinner size={14} /> The agent is writing this listing from approved product data. It appears here when it&apos;s done.</p>}
      {listing && !running && !compact && <ListingView listing={listing} channel={asset.channel} />}
      {canStart && (
        <div>
          <p className="mb-3 text-body">The agent loads {CHANNEL_LABEL[asset.channel]}&apos;s rules, writes the listing from approved product data, then validates and corrects it before saving.</p>
          <Button variant="primary" onClick={start}>{asset.state === "failed" ? "Try again" : "Write with agent"}</Button>
        </div>
      )}
      {!canStart && !listing && !running && asset.state === "draft" && <p className="text-muted">Switch to Producer to write this listing.</p>}
    </Panel>
  );
}
