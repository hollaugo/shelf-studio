import type { ButtonHTMLAttributes, ReactNode } from "react";

export type Tone = "neutral" | "plain" | "info" | "warn" | "danger" | "ok" | "solid";

const TONE: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral",
  plain: "bg-neutral-bg text-fg",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  ok: "bg-ok-bg text-ok",
  solid: "bg-ok text-canvas",
};

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" className="flex-none animate-spin-slow">
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

export function Chip({ tone = "neutral", spin, children }: { tone?: Tone; spin?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs leading-4 ${TONE[tone]}`}>
      {spin && <Spinner />}
      {children}
    </span>
  );
}

export function CoverageChip({ channel, label, tone }: { channel: string; label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs leading-4 ${TONE[tone]}`}>
      <span className={tone === "solid" ? "font-medium" : "text-body"}>{channel}</span>
      {label}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "card" | "cardPrimary"; pending?: boolean };

const VARIANT = {
  primary: "rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas enabled:hover:bg-white",
  secondary: "rounded-[10px] border border-line-strong bg-raised px-4 py-2.5 font-medium text-fg enabled:hover:bg-control",
  card: "flex-1 rounded-lg border border-line-strong bg-control p-2 text-[13px] text-fg enabled:hover:border-muted",
  cardPrimary: "flex-1 rounded-lg bg-fg p-2 text-[13px] font-semibold text-canvas enabled:hover:bg-white",
};

export function Button({ variant = "secondary", pending, className = "", children, disabled, ...props }: ButtonProps) {
  return (
    <button type="button" disabled={disabled || pending} className={`inline-flex items-center justify-center gap-2 disabled:cursor-default disabled:opacity-60 ${VARIANT[variant]} ${className}`} {...props}>
      {pending && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Panel({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="mb-3.5 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex-[1_1_200px] rounded-[14px] border border-line bg-raised px-5 py-4">
      <div className="text-xs leading-4 tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold leading-8">{value}</div>
      {note && <div className="mt-1.5 text-xs leading-4 text-muted">{note}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-bold leading-10 tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line-soft py-2.5">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`shimmer block rounded-md ${className}`} />;
}

export function Notice({ tone = "danger", title, children }: { tone?: "danger" | "warn" | "info"; title: string; children?: ReactNode }) {
  const cls = { danger: "border-danger-bg bg-danger-well text-danger", warn: "border-warn-bg bg-[#1d1809] text-warn", info: "border-info-bg bg-info-bg/40 text-info" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-[10px] border p-3.5 ${cls}`}>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-0.5 text-[13px] text-body">{children}</div>}
    </div>
  );
}
