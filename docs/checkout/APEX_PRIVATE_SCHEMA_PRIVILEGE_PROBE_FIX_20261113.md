# Apex production checkout diagnostic: private-schema privilege lookup fix

Checkpoint November 13, 2026, after PR #344.

## Observed failure

The signed-in platform-admin dashboard showed:
- Server-only configuration: **Validated**
- PostgreSQL connection: **Connected**
- Restricted login and executor permissions: **Needs review**
- Checkout: **Still disabled**

Supabase PostgreSQL logs for the actual restricted login, with SQLSTATE
`42501`, identify `permission denied for schema apex_internal` while
executing the first read-only privilege-check SELECT.

The cause is **the diagnostic**, not excess or missing grants:
`has_table_privilege(current_user,'apex_internal.retail_order_holds','SELECT')`
implicitly resolves the name to a relation. PostgreSQL performs that
qualified-name lookup under the restricted login, which intentionally
lacks `USAGE` on the private `apex_internal` schema. The lookup
throws before the ACL test can return false.

## Fix

Resolve the table OID via `pg_catalog.pg_class` joined to
`pg_catalog.pg_namespace`, then call the OID overload of
`has_table_privilege` with the current user and `'SELECT'`.

This checks whether the restricted role can read the target table
without requiring schema-name resolution or exposing private rows.
A missing/renamed table resolves to NULL and still fails the strict
`===false` assertion: no false positive.

**Do not grant `USAGE` on `apex_internal` to
`apex_retail_checkout_app` to fix this.** That would weaken the
deliberate private-schema boundary. No database migration or grant
change is required.

## Verification

- Production metadata readback confirms app role
  `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS` and role membership
  with SET allowed and inherited privileges disabled.
- The role has no `USAGE` on `apex_internal`, and its table
  privilege check using the OID overload returns false.
- Real `pg` TCP integration CI now calls the exact production
  `verifyRestrictedRetailConnectionV1` as
  `apex_retail_checkout_app` in disposable PostgreSQL before
  synthetic-order tests; no mocked result replaces this test.
- Admin-only page continues to run read-only `SELECT`,
  `BEGIN READ ONLY`, `SET LOCAL ROLE`, and `ROLLBACK`.
- Next operator action is to open
  `https://apexanabolics.co/admin/checkout-db-connection`
  again after production deployment and confirm whether it
  reports **Connection verified**.

## Unchanged invariants

- No privilege/grant changes, migrations, credential rotation or
  customer data access.
- Production order engine gate **OFF**, public handoff HTTP **503**.
- No customer orders, stock holds, BTCPay invoices, shipping handoffs
  or supplier payouts authorized by the diagnostic.
