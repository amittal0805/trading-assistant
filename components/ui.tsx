"use client";

import { ReactNode } from "react";
import { pnlClass } from "@/lib/format";

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  pnl,
}: {
  label: string;
  value: string;
  sub?: string;
  pnl?: number;
}) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold mt-1 font-mono ${pnl !== undefined ? pnlClass(pnl) : ""}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      className="input font-mono"
      value={value}
      step={step ?? "any"}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    />
  );
}

export function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-border/60 last:border-0">
      <span className="text-muted">{k}</span>
      <span className={`font-mono ${cls ?? ""}`}>{v}</span>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="card text-center py-10 text-sm text-zinc-500">{text}</div>
  );
}
