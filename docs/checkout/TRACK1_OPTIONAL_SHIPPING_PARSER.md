# Track 1 — optional shipping public quote parser

Customer cart quote interpretation now matches the already-existing shipping-only calculation engine:
- `charge_shipping=true`: positive saved envelope/medium charges, optional non-null minimum, free-shipping code or a saved subtotal threshold.
- `charge_shipping=false`: exactly zero charges and `free_shipping_min_subtotal_cents=null`. This shows `Free` without falsely implying a promotion.
- All quotes remain informational and return `canPlaceOrder=false`, `canPay=false`. The configured strictly-over-$200 policy remains `20001` cents where present; no sales tax is added.
- Any contradictory settings fail closed; no client-provided shipping amount is trusted.

**Resolved backend dependency (November 5):** [PR #260](https://github.com/zanibethel/apex/pull/260) installed a replacement public RPC that preserves all product/supplier authorization, holds, read-only outputs and disabled checkout flags while allowing `charge_shipping=false` and a null minimum. The merged SQL passed exact-head Node, Next build, isolated PostgreSQL positive/negative tests, and Vercel preview, and was applied to hosted Supabase as migration `20261105095126 apex_public_cart_optional_shipping_quote`. A hosted readback confirmed the new predicate, global release gate **false**, 0 orders and 0 invoices. Actual customer quote requests remain unavailable until separate public release approval.

Live commerce, invoice generation, tax calculation and fulfillment are out of scope. Never treat a successful informational quote as an authorized purchase.
