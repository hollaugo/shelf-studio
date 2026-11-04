import type { StepStatus } from "@/lib/domain/describe";

const BAR: Record<StepStatus, string> = { done: "bg-ok", active: "bg-info animate-bar", wait: "bg-warn", fail: "bg-danger", todo: "bg-line-strong" };

export function Stepper({ steps, statuses, label }: { steps: string[]; statuses: StepStatus[]; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ol aria-label={`Pipeline: ${steps.join(", ")}`} className="flex gap-1">
        {steps.map((s, i) => <li key={s} className={`h-1 flex-1 rounded-sm ${BAR[statuses[i]]}`} />)}
      </ol>
      <div className="text-xs leading-4 text-muted">{label}</div>
    </div>
  );
}

export function CheckDots({ done, total, warn, fail }: { done: number; total: number; warn: number; fail: number }) {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const c = i < done - warn - fail ? "bg-ok" : i < done - fail ? "bg-warn" : i < done ? "bg-danger" : i === done ? "bg-info animate-bar" : "bg-line-dashed";
        return <span key={i} className={`size-2 rounded-full ${c}`} />;
      })}
    </div>
  );
}
