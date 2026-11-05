# Track 1 — optional shipping public quote parser

Customer cart quote interpretation now matches the already-existing shipping-only calculation engine:
- `charge_shipping=true`: positive saved envelope/medium charges, optional non-null minimum, free-shipping code or a saved subtotal threshold.
- `charge_shipping=false`: exactly zero charges and `free_shipping_min_subtotal_cents=null`. This shows `Free` without falsely implying a promotion.
- All quotes remain informational and return `canPlaceOrder=false`, `canPay=false`. The configured strictly-over-$200 policy remains `20001` cents where present; no sales tax is added.
- Any contradictory settings fail closed; no client-provided shipping amount is trusted.

**Remaining hosted backend dependency:** The current public RPC `public.get_public_cart_quote_source(jsonb,text)` still explicitly requires `charge_shipping=true` and a non-null free-shipping minimum before it will return a quote. This PR does **not** change that privileged `SECURITY DEFINER` function or the hosted schema; it makes the public parser and UI ready for optional shipping. A separately reviewed, migration-based replacement must retain existing supplier/product authorizations, release gates, public data minimization, read-only behavior, and deny-all default. Verify both fee-on and fee-off in isolated PostgreSQL, plus the hosted gate remaining false, before migrating.

Live commerce, invoice generation, tax calculation and fulfillment are out of scope. Never treat a successful informational quote as an authorized purchase.
