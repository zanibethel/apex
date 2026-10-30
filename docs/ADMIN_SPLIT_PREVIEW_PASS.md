# Admin multi-recipient preview pass

Admin-only route: /admin/splits/configure. This page is a **local browser calculator**, not a persisted configuration editor. It uses percentage-only rules and integer satoshis with deterministic remainder handling; the user enters recipients and shares. No preset recipients or percentages are imposed.

Existing /admin/splits continues to use the earlier two-party draft model and displays a 90/10 planning fallback; this pass does **not** replace that legacy path. A follow-up must retire the legacy two-way form and connect this editor to a secure server-authorized draft CRUD API and schema after the migration is validated.

No live database changes, no wallet management, no settlement, no checkout activation.
