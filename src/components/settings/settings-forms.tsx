"use client";

import { useState, useTransition } from "react";
import { Button, Notice, Panel } from "@/components/ui";

const fieldCls = "mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg disabled:text-muted";

function useSave(key: string) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (value: unknown) => start(async () => {
    setMessage(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    setMessage(res.ok ? { ok: true, text: "Saved. New checks and prompts use this from now on." } : { ok: false, text: (await res.json()).error });
  });
  return { pending, message, save };
}

export type LegalRule = { id: string; rule: string; severity: "fail" | "warn" };

export function LegalRulesForm({ initial, canEdit }: { initial: LegalRule[]; canEdit: boolean }) {
  const [rules, setRules] = useState(initial);
  const { pending, message, save } = useSave("legal_rules");
  return (
    <Panel title="LEGAL RULES">
      <p className="mb-3 text-body">The pre-compliance review and the copy agent check everything against these. They&apos;re starting defaults for your legal team to replace, not legal advice.</p>
      <ul className="flex flex-col gap-2.5">
        {rules.map((r, i) => (
          <li key={r.id} className="rounded-[10px] border border-line-soft p-3">
            <label htmlFor={`rule-${r.id}`} className="sr-only">Rule {i + 1}</label>
            <textarea id={`rule-${r.id}`} rows={2} disabled={!canEdit} value={r.rule} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, rule: e.target.value } : x)))} className={`${fieldCls} mt-0 resize-y`} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                If it&apos;s broken
                <select disabled={!canEdit} value={r.severity} onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, severity: e.target.value as LegalRule["severity"] } : x)))} className="rounded-lg border border-line-strong bg-well px-2 py-1.5 text-[13px] text-fg disabled:text-muted">
                  <option value="fail">Block submission</option>
                  <option value="warn">Reviewer confirms</option>
                </select>
              </label>
              {canEdit && <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}>Remove rule</button>}
            </div>
          </li>
        ))}
      </ul>
      {message && <div className="mt-3"><Notice tone={message.ok ? "info" : "danger"} title={message.text} /></div>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setRules([...rules, { id: `rule_${Date.now()}`, rule: "", severity: "warn" }])}>Add a rule</Button>
          <Button variant="primary" pending={pending} disabled={rules.some((r) => r.rule.trim().length < 3)} onClick={() => save(rules)}>Save legal rules</Button>
        </div>
      )}
    </Panel>
  );
}

type Guide = {
  brandEssence: string;
  palette?: { name: string; hex: string; usage: string }[];
  typography?: { display?: { description?: string; googleFontMatch?: string }; body?: { description?: string; googleFontMatch?: string } };
  photography?: Record<string, string[]>;
  textOnImage?: string[];
  voice?: { traits?: string[]; avoid?: string[] };
};

const lines = (v?: string[]) => (v ?? []).join("\n");
const split = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export function StyleGuideForm({ initial, canEdit }: { initial: Guide; canEdit: boolean }) {
  const [g, setG] = useState(initial);
  const { pending, message, save } = useSave("style_guide");
  const photo = (key: string, label: string) => (
    <div key={key}>
      <label htmlFor={`photo-${key}`} className="text-xs text-muted">{label}. One rule per line</label>
      <textarea id={`photo-${key}`} rows={4} disabled={!canEdit} value={lines(g.photography?.[key])} onChange={(e) => setG({ ...g, photography: { ...g.photography, [key]: e.target.value.split("\n") } })} onBlur={(e) => setG({ ...g, photography: { ...g.photography, [key]: split(e.target.value) } })} className={`${fieldCls} resize-y`} />
    </div>
  );
  return (
    <Panel title="STYLE GUIDE · DERIVED FROM VERDA'S IMAGES">
      <p className="mb-3 text-body">Prompts, text overlays, the copy agent and the pre-compliance review all read from this.</p>
      <label htmlFor="essence" className="text-xs text-muted">Brand essence</label>
      <textarea id="essence" rows={2} disabled={!canEdit} value={g.brandEssence} onChange={(e) => setG({ ...g, brandEssence: e.target.value })} className={`${fieldCls} resize-y`} />
      <div className="mt-4">
        <div className="text-xs text-muted">Palette</div>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {g.palette?.map((c) => (
            <li key={c.hex} className="flex items-start gap-2.5 rounded-[10px] border border-line-soft p-2.5">
              <span aria-hidden="true" className="size-8 flex-none rounded-lg border border-line-strong" style={{ background: c.hex }} />
              <span className="min-w-0"><span className="block font-medium">{c.name} <span className="font-mono text-xs text-muted">{c.hex}</span></span><span className="block text-xs leading-4 text-muted">{c.usage}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-line-soft p-3"><div className="text-xs text-muted">Display type</div><div className="mt-1 font-display text-2xl tracking-[0.2em]">VERDA</div><p className="mt-1 text-xs leading-4 text-muted">{g.typography?.display?.googleFontMatch}</p></div>
        <div className="rounded-[10px] border border-line-soft p-3"><div className="text-xs text-muted">Body type</div><div className="mt-1 font-brand text-xl">Daily Hydrating Shampoo</div><p className="mt-1 text-xs leading-4 text-muted">{g.typography?.body?.googleFontMatch}</p></div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {photo("lighting", "Lighting")}
        {photo("settings", "Settings")}
        {photo("composition", "Composition")}
        {photo("avoid", "Avoid")}
        <div>
          <label htmlFor="textrules" className="text-xs text-muted">Text on images. One rule per line</label>
          <textarea id="textrules" rows={4} disabled={!canEdit} value={lines(g.textOnImage)} onChange={(e) => setG({ ...g, textOnImage: e.target.value.split("\n") })} onBlur={(e) => setG({ ...g, textOnImage: split(e.target.value) })} className={`${fieldCls} resize-y`} />
        </div>
        <div>
          <label htmlFor="voice" className="text-xs text-muted">Voice. One trait per line</label>
          <textarea id="voice" rows={4} disabled={!canEdit} value={lines(g.voice?.traits)} onChange={(e) => setG({ ...g, voice: { ...g.voice, traits: e.target.value.split("\n") } })} onBlur={(e) => setG({ ...g, voice: { ...g.voice, traits: split(e.target.value) } })} className={`${fieldCls} resize-y`} />
        </div>
      </div>
      {message && <div className="mt-3"><Notice tone={message.ok ? "info" : "danger"} title={message.text} /></div>}
      {canEdit && <div className="mt-3"><Button variant="primary" pending={pending} onClick={() => save(g)}>Save style guide</Button></div>}
    </Panel>
  );
}
