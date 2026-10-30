"use client";

import { useMemo, useState } from "react";

type Row = { key: number; label: string; basisPoints: string };
type Result = { label: string; amount: bigint; percentage: number };

function calculate(amount: string, rows: Row[]): Result[] {
  if (!/^\d+$/.test(amount)) throw new Error("Enter a whole number of satoshis.");
  const sats = BigInt(amount);
  if (sats > BigInt('2100000000000000')) throw new Error("Amount exceeds the Bitcoin supply.");
  if (!rows.length || rows.length > 100) throw new Error("Add between 1 and 100 recipients.");
  const names = new Set<string>();
  let sum = 0;
  const parts = rows.map(row => {
    const name = row.label.trim();
    if (!name || names.has(name.toLowerCase())) throw new Error("Each recipient needs a unique name.");
    names.add(name.toLowerCase());
    if (!/^\d+(\.\d{1,2})?$/.test(row.basisPoints)) throw new Error("Enter percentages with at most two decimal places.");
    const [whole, decimal = ""] = row.basisPoints.split(".");
    const bp = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (!Number.isSafeInteger(bp) || bp > 10000) throw new Error("Percentages must be between 0 and 100.");
    sum += bp;
    const weighted = sats * BigInt(bp);
    return { key: row.key, label: name, percentage: bp / 100, amount: weighted / BigInt(10000), remainder: weighted % BigInt(10000) };
  });
  if (sum !== 10000) throw new Error("Split percentages must total exactly 100%.");
  let leftover = sats - parts.reduce((n, p) => n + p.amount, BigInt(0));
  for (const p of [...parts].sort((a, b) => a.remainder === b.remainder ? a.key - b.key : a.remainder > b.remainder ? -1 : 1)) {
    if (!leftover) break;
    p.amount += BigInt(1);
    leftover -= BigInt(1);
  }
  return parts.map(({ label, amount, percentage }) => ({ label, amount, percentage }));
}

export function MultiSplitPreview() {
  const [rows, setRows] = useState<Row[]>([{ key: 1, label: "", basisPoints: "100" }]);
  const [nextId, setNextId] = useState(2);
  const [amount, setAmount] = useState("1000000");
  const preview = useMemo(() => {
    try { return { data: calculate(amount, rows), error: "" }; }
    catch (error) { return { data: [] as Result[], error: error instanceof Error ? error.message : "Invalid split" }; }
  }, [amount, rows]);
  function update(key: number, field: "label" | "basisPoints", value: string) {
    setRows(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  }
  return <section className="supplier-panel" style={{ maxWidth: "none" }}>
    <h2>Draft allocation calculator</h2>
    <p>Enter recipient labels and their percentage shares. This calculator uses synthetic values only; no wallet addresses are required.</p>
    <label htmlFor="preview-sats">Example order amount (satoshis)</label>
    <input id="preview-sats" type="text" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} />
    {rows.map(row => <div key={row.key} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
      <label>Recipient<br /><input aria-label="Recipient name" value={row.label} onChange={event => update(row.key, "label", event.target.value)} placeholder="Recipient name" /></label>
      <label>Share (%)<br /><input aria-label="Recipient percentage" inputMode="decimal" value={row.basisPoints} onChange={event => update(row.key, "basisPoints", event.target.value)} /></label>
      <button className="button secondary" type="button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove</button>
    </div>)}
    <p style={{ marginTop: 16 }}><button className="button secondary" type="button" disabled={rows.length >= 100} onClick={() => { setRows(current => [...current, { key: nextId, label: "", basisPoints: "0" }]); setNextId(value => value + 1); }}>Add recipient</button></p>
    {preview.error ? <p role="alert" className="notice">{preview.error}</p> : <>
      <h3>Preview only</h3>
      <ul className="supplier-stores">{preview.data.map(row => <li key={row.label}><span>{row.label} ({row.percentage}%)</span><strong>{row.amount.toString()} sats</strong></li>)}</ul>
      <p>Total: {amount} sats</p>
    </>}
    <p className="notice">No save, publish, settlement, or transfer operation is available on this page.</p>
  </section>;
}
