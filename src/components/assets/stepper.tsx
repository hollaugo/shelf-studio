import type { StepStatus } from "@/lib/domain/describe";

const BAR: Record<StepStatus, string> = { done: "bg-ok", active: "bg-info animate-bar", wait: "bg-warn", fail: "bg-danger", todo: "bg-line-strong" };

export function Stepper({ steps, statuses, label }: { steps: string[]; statuses: StepStatus[]; label: string }) {
  return (
    <ol aria-label={`Pipeline: ${steps.join(", ")}. ${label}`} title={label} className="flex gap-1">
      {steps.map((s, i) => <li key={s} className={`h-1 flex-1 rounded-sm ${BAR[statuses[i]]}`} />)}
    </ol>
  );
}
