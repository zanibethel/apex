"use client";

import { useMemo, useState } from "react";

type Row = { key: number; label: string; basisPoints: string };
type Result = { label: string; amount: bigint; percentage: number };

function calculate(amount: string, rows: Row[]): Result[] {
  if (!/^\d+$/.test(amount)) throw new Error("Enter a whole number of satoshis.");
  const sats = BigInt(amount);
  if (sats > BigInt("2100000000000000")) throw new Error("Amount exceeds the Bitcoin supply.");
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

const field = { width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const };
const labelStyle = { display: "grid", gap: 6, minWidth: 0 };
export function MultiSplitPreview() {
  const [rows, setRows] = useState<Row[]>([{ key: 1, label: "", basisPoints: "100" }]);
  const [nextId, setNextId] = useState(2);
  const [amount, setAmount] = useState("1000000");
  const preview = useMemo(() => {
    try { return { data: calculate(amount, rows), error: "" }; }
    catch (error) { return { data: [] as Result[], error: error instanceof Error ? error.message : "Invalid split" }; }
  }, [amount, rows]);
  function update(key: number, fieldName: "label" | "basisPoints", value: string) {
    setRows(current => current.map(row => row.key === key ? { ...row, [fieldName]: value } : row));
  }
  return <section className="supplier-panel" style={{ maxWidth: "100%", minWidth: 0, overflowWrap: "anywhere" }}>
    <h2 style={{ fontSize: "clamp(1.5rem, 6vw, 2rem)" }}>Draft allocation calculator</h2>
    <p className="notice">Preview how an example order would be allocated. No wallet or transfer is involved.</p>
    <label style={labelStyle} htmlFor="preview-sats">Example order amount (satoshis)<input style={field} id="preview-sats" type="text" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    {rows.map((row, index) => <fieldset key={row.key} className="apex-recipient-card">
      <legend>Recipient {index + 1}</legend>
      <div className="apex-recipient-fields"><label style={labelStyle}>Recipient name<input style={field} aria-label="Recipient name" value={row.label} onChange={event => update(row.key, "label", event.target.value)} placeholder="Recipient name" /></label>
      <label style={labelStyle}>Share (%)<input style={field} aria-label="Recipient percentage" inputMode="decimal" value={row.basisPoints} onChange={event => update(row.key, "basisPoints", event.target.value)} /></label>
      </div><button className="button secondary" type="button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove recipient</button>
    </fieldset>)}
    <p style={{ marginTop: 16 }}><button className="button secondary" type="button" disabled={rows.length >= 100} onClick={() => { setRows(current => [...current, { key: nextId, label: "", basisPoints: "0" }]); setNextId(value => value + 1); }}>Add recipient</button></p>
    <div className="apex-allocation-summary"><strong>Allocation preview</strong><span>{preview.error ? "Needs attention" : "100% allocated ✓"}</span></div>
    {!preview.error && <div className="apex-allocation-bar" role="img" aria-label={preview.data.map(row => `${row.label}: ${row.percentage}%`).join(", ")}>{preview.data.filter(row => row.percentage > 0).map((row, index) => <span key={row.label} style={{ width: `${row.percentage}%`, background: `hsl(${(330 + index * 63) % 360} 55% 62%)` }} title={`${row.label}: ${row.percentage}%`} />)}</div>}
    {preview.error ? <p role="alert" className="notice">{preview.error}</p> : <>
      <h3>Estimated distribution</h3>
      <ul className="supplier-stores">{preview.data.map(row => <li key={row.label}><span>{row.label} ({row.percentage}%)</span><strong>{row.amount.toString()} sats</strong></li>)}</ul>
      <p>Total: {amount} sats</p>
    </>}
    <p className="notice">No save, publish, settlement, or transfer operation is available on this page.</p>
  </section>;
}
