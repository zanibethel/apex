# Configurable payout allocation engine — implementation pass

This PR adds a pure, side-effect-free integer-satoshi allocation function and rule precedence selector, with tests. It accepts recipient IDs and basis points as data; no platform, Lily, Tierra, or supplier identities/percentages are hardcoded.

**Not connected** to admin UI, Supabase, orders, checkout, BTCPay or Prism. No automatic payouts or production behavior.

Limitations for next pass: percentages only; fixed-dollar deductions, per-line mixed-cart aggregation, verified wallet destinations, settlement fees, schema/RLS, admin approvals and snapshots still need implementation. The allocation function returns strings to avoid JSON BigInt issues. Rule selector expects already-authorized, validated rule rows and fails closed on same-scope overlap. Before production, enforce database constraints and independently verify payment processor capability.
