"use client";
import { useActionState, useState } from "react";
import { saveMultiRecipientDraft } from "./actions";

type Recipient = { id: string; display_name: string; recipient_type: string; status: string };
const field = { width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" as const };
const label = { display: "grid", gap: 6, minWidth: 0 };
type ScopeOption = { id: string; display_name: string };
type ProductOption = { id: string; name: string; sku: string };
export function SaveSplitDraft({ enabled, recipients, stores, suppliers, products }: { enabled: boolean; recipients: Recipient[]; stores: ScopeOption[]; suppliers: ScopeOption[]; products: ProductOption[] }) {
  const [scopeType, setScopeType] = useState("storefront");
  const [scopeType, setScopeType] = useState("storefront");
  const [query, setQuery] = useState("");
  const scopeOptions = scopeType === "storefront" ? stores.map(s => ({ id: s.id, label: s.display_name })) : scopeType === "supplier" ? suppliers.map(s => ({ id: s.id, label: s.display_name })) : products.map(p => ({ id: p.id, label: p.name + " (" + p.sku + ")" }));
  const filtered = recipients.filter(r => (r.display_name + " " + r.recipient_type).toLowerCase().includes(query.toLowerCase()));
  const [state, action, pending] = useActionState(saveMultiRecipientDraft, { ok: false, message: "" });
  const [rows, setRows] = useState([{ id: 1, recipient_id: "", basis_points: "10000" }]);
  const [next, setNext] = useState(2);
  const sum = rows.reduce((n, r) => n + Number(r.basis_points || 0), 0);
  const valid = rows.every(r => /^[0-9]+$/.test(r.basis_points) && Number(r.basis_points) <= 10000);
  return <section className="supplier-panel" style={{ maxWidth: "100%", minWidth: 0, marginTop: 24, overflowWrap: "anywhere" }}>
    <h2 style={{ fontSize: "clamp(1.5rem, 6vw, 2rem)" }}>Save a split draft</h2>
    <p className="notice">Planning only. Saving a draft never activates Bitcoin payouts.</p>
    <label style={label}>Find recipient by name or type<input style={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recipients" /></label>
    {!recipients.length && <p className="notice">No active recipients are available. <a href="/admin/recipients">Manage payout recipients</a> to create one.</p>}
    <form action={action} style={{ display: "grid", gap: 16, marginTop: 16, minWidth: 0 }}>
      <label style={label}>Rule scope<select style={field} name="scopeType" value={scopeType} onChange={e => setScopeType(e.target.value)}><option value="storefront">Storefront</option><option value="supplier">Supplier</option><option value="product">Product</option></select></label>
      <label style={label}>Select {scopeType}<select key={scopeType} style={field} name="scopeId" required defaultValue=""><option value="" disabled>Choose {scopeType}</option>{scopeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      {!scopeOptions.length && <p className="notice">No {scopeType} records available for selection.</p>}
      <label style={label}>Existing draft UUID (optional)<input style={field} name="ruleId" placeholder="Leave blank for a new draft" /></label>
      {rows.map((row, index) => <fieldset key={row.id} style={{ minWidth: 0, width: "100%", boxSizing: "border-box", display: "grid", gap: 12, border: "1px solid #555", borderRadius: 8, padding: 12 }}>
        <legend>Recipient {index + 1}</legend>
        <label style={label}>Recipient<select style={field} required aria-label="Payout recipient" value={row.recipient_id} onChange={e => setRows(all => all.map(r => r.id === row.id ? { ...r, recipient_id: e.target.value } : r))}><option value="">Select recipient</option>{filtered.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.display_name} ({recipient.recipient_type})</option>)}{row.recipient_id && !filtered.some(r => r.id === row.recipient_id) && recipients.filter(r => r.id === row.recipient_id).map(r => <option key={r.id} value={r.id}>{r.display_name} ({r.recipient_type})</option>)}</select></label>
        <label style={label}>Share (basis points; 10000 = 100%)<input style={field} required inputMode="numeric" value={row.basis_points} onChange={e => setRows(all => all.map(r => r.id === row.id ? { ...r, basis_points: e.target.value } : r))} /></label>
        <button type="button" className="button secondary" disabled={rows.length === 1} onClick={() => setRows(all => all.filter(r => r.id !== row.id))}>Remove recipient</button>
      </fieldset>)}
      <p aria-live="polite">Allocated: {sum / 100}% {sum === 10000 && valid ? "✓" : "(must equal 100%)"}</p>
      <button type="button" className="button secondary" disabled={rows.length >= 100} onClick={() => { setRows(all => [...all, { id: next, recipient_id: "", basis_points: "0" }]); setNext(n => n + 1); }}>Add recipient</button>
      <input type="hidden" name="recipients" value={JSON.stringify(rows.map(({ recipient_id, basis_points }) => ({ recipient_id, basis_points: Number(basis_points) })))} />
      <button className="button secondary" type="submit" disabled={!enabled || pending || !valid || sum !== 10000 || !recipients.length || !scopeOptions.length || rows.some(r => !r.recipient_id) || new Set(rows.map(r => r.recipient_id)).size !== rows.length}>{pending ? "Saving…" : "Save draft (no activation)"}</button>
      {!enabled && <p className="notice">Draft saving is disabled in this preview.</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
