# Critical-path risk register — 2026-10-29

Public high-level tracking only. Do not publish names, wallet addresses, contracts or sensitive technical credentials.

| ID | Risk | Likelihood / impact | Owner & timing | Mitigation / stop condition |
|---|---|---|---|---|
| R1 | BTCPay/Prism cannot safely or reliably automate the desired 90/10 two-wallet payout | Unknown / critical | Developer + appropriate payment/security reviewer; viability review W1, feasibility evidence W2, test proof W4 | Separate funds entitlement from confirmed payout; confirm signer/custody and actual test transactions; select alternate compliant arrangement or stop real payout integration if unresolved |
| R2 | Funding, ownership or supplier catalog inputs arrive late | Possible / high | Partners; W0 | Start six-week clock after prerequisites; use mock data and defer billable infrastructure until authorized |
| R3 | Product/merchant authorization and possible financial-services obligations cannot be cleared in six weeks | Unknown / critical | Supplier/business advisers; initiate W0/W1 and track continuously | Keep demo/test mode separate from live checkout; never bypass external approval |
| R4 | Overbuilding/polish exceeds 42–84h capacity | Likely / high | Developer + partners; review every W7 | Freeze MVP; defer product finder, multi-supplier features, advanced promos; one PR-sized task per session |
| R5 | Refunds or network fees make 90/10 claims financially incorrect | Possible / high | Developer + signatories; W1 term decision and W3/4 tests | Define fee payer, satoshi rounding and commission base in agreement; ledger refund adjustment; no assumed fixed Bitcoin network charge |
| R6 | Public repository leaks sensitive partner/customer or wallet information | Possible / critical | Developer; every PR | No private contracts or screenshots; secret scan; restricted credentials in server-only secrets and offline wallet controls |
| R7 | Domain/brand rights or partner commercial terms are unresolved | Possible / high | Founding partners; W0–W2 | Document ownership, exclusive first supplier use and termination; name/domain must be confirmed before public launch |
| R8 | Flash-sale request distracts from essential checkout testing | Possible / medium | Developer + partners; Week 3 decision | Single-rule sale only after core gate green; otherwise defer and keep site usable without it |
| R9 | Hosting/storage sizing or backup recovery insufficient | Possible / high | Developer; W1 sizing + W5 restore test | Verify pruned Bitcoin node requirements, backups/recovery, resources, alerting and operating budget |

## Red flag policy
Any unknown that affects customer money, user authorization, product legality, or wallet signing is a **release blocker** until verified. No ship-by-date exception.
