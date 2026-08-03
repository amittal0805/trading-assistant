"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, MutualFund } from "@/lib/store";
import { fmtMoney, fmtNum, fmtPct, pnlClass } from "@/lib/format";
import { PageTitle, StatCard, Field, NumInput } from "@/components/ui";
import { Plus, Trash2, Pencil, X } from "lucide-react";

const EMPTY = {
  name: "",
  category: "Direct - Growth",
  nav: "" as number | "",
  navChangePct: "" as number | "",
  units: "" as number | "",
  avgBuyNav: "" as number | "",
  currentInvestment: "" as number | "",
  currentValue: "" as number | "",
};

export default function Funds() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { mutualFunds, addFund, updateFund, removeFund } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const totals = useMemo(() => {
    const invested = mutualFunds.reduce((a, f) => a + f.currentInvestment, 0);
    const value = mutualFunds.reduce((a, f) => a + f.currentValue, 0);
    const day = mutualFunds.reduce((a, f) => a + (f.navChangePct ? (f.currentValue * f.navChangePct) / 100 : 0), 0);
    return { invested, value, pl: value - invested, plPct: invested ? ((value - invested) / invested) * 100 : 0, day };
  }, [mutualFunds]);

  if (!mounted) return null;

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY });
    setFormOpen(true);
  };
  const openEdit = (f: MutualFund) => {
    setEditId(f.id);
    setForm({
      name: f.name,
      category: f.category,
      nav: f.nav,
      navChangePct: f.navChangePct ?? "",
      units: f.units,
      avgBuyNav: f.avgBuyNav,
      currentInvestment: f.currentInvestment,
      currentValue: f.currentValue,
    });
    setFormOpen(true);
  };

  const save = () => {
    if (!form.name.trim() || form.currentValue === "" || form.currentInvestment === "") return;
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "Direct - Growth",
      nav: Number(form.nav) || 0,
      navChangePct: form.navChangePct === "" ? undefined : Number(form.navChangePct),
      units: Number(form.units) || 0,
      avgBuyNav: Number(form.avgBuyNav) || 0,
      currentInvestment: Number(form.currentInvestment),
      currentValue: Number(form.currentValue),
    };
    if (editId) updateFund(editId, payload);
    else addFund(payload);
    setFormOpen(false);
    setForm({ ...EMPTY });
    setEditId(null);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageTitle title="Mutual Funds" subtitle="Your fund holdings, value and returns" />
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Fund
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Invested" value={fmtMoney(totals.invested)} sub={`${mutualFunds.length} funds`} />
        <StatCard label="Current Value" value={fmtMoney(totals.value)} sub={`Day ${fmtMoney(totals.day, "INR", 0)}`} />
        <StatCard label="Total Returns" value={fmtMoney(totals.pl)} pnl={totals.pl} sub={fmtPct(totals.plPct)} />
        <StatCard label="Return %" value={fmtPct(totals.plPct)} pnl={totals.pl} sub="on invested" />
      </div>

      {formOpen && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">{editId ? "Edit fund" : "Add fund"}</h2>
            <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setFormOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Field label="Fund name">
                <input className="input" value={form.name} placeholder="e.g. Parag Parikh Flexi Cap" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Category">
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Current NAV (₹)">
              <NumInput value={form.nav} onChange={(v) => setForm({ ...form, nav: v })} />
            </Field>
            <Field label="NAV change %">
              <NumInput value={form.navChangePct} onChange={(v) => setForm({ ...form, navChangePct: v })} />
            </Field>
            <Field label="Units">
              <NumInput value={form.units} onChange={(v) => setForm({ ...form, units: v })} />
            </Field>
            <Field label="Avg Buy NAV (₹)">
              <NumInput value={form.avgBuyNav} onChange={(v) => setForm({ ...form, avgBuyNav: v })} />
            </Field>
            <Field label="Current Investment (₹)">
              <NumInput value={form.currentInvestment} onChange={(v) => setForm({ ...form, currentInvestment: v })} />
            </Field>
            <Field label="Current Value (₹)">
              <NumInput value={form.currentValue} onChange={(v) => setForm({ ...form, currentValue: v })} />
            </Field>
            <div className="flex items-end">
              <button className="btn-primary w-full" onClick={save}>{editId ? "Save" : "Add"}</button>
            </div>
          </div>
        </div>
      )}

      {mutualFunds.length === 0 ? (
        <div className="card text-sm text-zinc-500">No funds yet. Add one with the button above.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mutualFunds.map((f) => {
            const ret = f.currentValue - f.currentInvestment;
            const retPct = f.currentInvestment ? (ret / f.currentInvestment) * 100 : 0;
            return (
              <div key={f.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold leading-snug">{f.name}</h3>
                    <span className="inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-accent/10 text-accent mt-1">
                      {f.category}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted">NAV</div>
                    <div className="font-mono text-sm">{fmtNum(f.nav, 2)}</div>
                    {f.navChangePct != null && (
                      <div className={`text-[11px] font-mono ${pnlClass(f.navChangePct)}`}>{fmtPct(f.navChangePct)}</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                  <div>
                    <div className="text-[11px] text-muted">Current Value</div>
                    <div className="font-mono">{fmtMoney(f.currentValue, "INR", 0)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Returns</div>
                    <div className={`font-mono ${pnlClass(ret)}`}>{fmtMoney(ret, "INR", 0)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Return %</div>
                    <div className={`font-mono ${pnlClass(ret)}`}>{fmtPct(retPct)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Invested</div>
                    <div className="font-mono">{fmtMoney(f.currentInvestment, "INR", 0)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Units</div>
                    <div className="font-mono">{fmtNum(f.units, 3)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Avg Buy NAV</div>
                    <div className="font-mono">{fmtNum(f.avgBuyNav, 2)}</div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-3">
                  <button className="text-zinc-500 hover:text-accent" onClick={() => openEdit(f)} title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button className="text-zinc-600 hover:text-loss" onClick={() => removeFund(f.id)} title="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
