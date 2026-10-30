"use client";
import { useActionState, useState } from "react";
import { saveMultiRecipientDraft } from "./actions";

export function SaveSplitDraft({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(saveMultiRecipientDraft, { ok: false, message: "" });
  const [rows, setRows] = useState([{ id: 1, recipient_id: "", basis_points: "10000" }]);
  const [next, setNext] = useState(2);
  const sum = rows.reduce((n, r) => n + Number(r.basis_points || 0), 0);
  const valid = rows.every(r => /^[0-9]+$/.test(r.basis_points) && Number(r.basis_points) <= 10000);
  return <section className="supplier-panel" style={{ maxWidth: "none", marginTop: 24 }}>
    <h2>Save a split draft</h2>
    <p className="notice">Only available after an approved database migration and feature enablement. Never activates Bitcoin payouts.</p>
    <form action={action}>
      <label>Rule scope<br /><select name="scopeType"><option value="storefront">Storefront</option><option value="supplier">Supplier</option><option value="product">Product</option></select></label>
      <label>Existing scope UUID<br /><input name="scopeId" required placeholder="Storefront, supplier, or product UUID" /></label>
      <label>Existing draft UUID (optional for revisions)<br /><input name="ruleId" placeholder="Leave blank for a new draft" /></label>
      {rows.map(row => <div key={row.id} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label>Recipient UUID<br /><input required value={row.recipient_id} onChange={e => setRows(all => all.map(r => r.id === row.id ? { ...r, recipient_id: e.target.value } : r))} /></label>
        <label>Basis points (10000 = 100%)<br /><input required inputMode="numeric" value={row.basis_points} onChange={e => setRows(all => all.map(r => r.id === row.id ? { ...r, basis_points: e.target.value } : r))} /></label>
        <button type="button" className="button secondary" disabled={rows.length === 1} onClick={() => setRows(all => all.filter(r => r.id !== row.id))}>Remove</button>
      </div>)}
      <p>Allocated: {sum / 100}% {sum === 10000 && valid ? "✓" : "(must equal 100%)"}</p>
      <button type="button" className="button secondary" disabled={rows.length >= 100} onClick={() => { setRows(all => [...all, { id: next, recipient_id: "", basis_points: "0" }]); setNext(n => n + 1); }}>Add recipient</button>
      <input type="hidden" name="recipients" value={JSON.stringify(rows.map(({ recipient_id, basis_points }) => ({ recipient_id, basis_points: Number(basis_points) })))} />
      <p><button className="button secondary" type="submit" disabled={!enabled || pending || !valid || sum !== 10000}>{pending ? "Saving…" : "Save draft (no activation)"}</button></p>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  </section>;
}
