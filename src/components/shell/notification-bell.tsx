"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Note = { id: string; title: string; body: string | null; href: string | null; read_at: string | null };

export function NotificationBell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/notifications").then((r) => r.json()).then((b) => { if (live) setNotes(b.notifications); }).catch(() => undefined);
    load();
    const t = setInterval(load, 10_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const unread = notes.filter((n) => !n.read_at).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && unread) {
      fetch("/api/notifications", { method: "POST" });
      setTimeout(() => setNotes((all) => all.map((n) => ({ ...n, read_at: n.read_at ?? "now" }))), 1500);
    }
  };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-raised text-fg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warn px-1 text-center text-[11px] font-semibold leading-4 text-canvas">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[14px] border border-line-strong bg-raised p-2 shadow-xl">
          {notes.length === 0 ? <p className="p-3 text-[13px] text-muted">Nothing yet.</p> : notes.map((n) => (
            <Link key={n.id} href={n.href ?? "#"} onClick={() => setOpen(false)} className="block rounded-lg p-2.5 hover:bg-control">
              <span className={`block text-[13px] ${n.read_at ? "text-body" : "font-semibold text-fg"}`}>{n.title}</span>
              {n.body && <span className="block text-xs leading-4 text-muted">{n.body}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
