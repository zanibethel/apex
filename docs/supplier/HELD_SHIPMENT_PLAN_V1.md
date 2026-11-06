# Supplier shipment review plans v1

The order detail at `/supplier/orders/[orderId]?store=[storeId]` uses the original immutable held order and purchase lines. A confirmed supplier owner or manager can save plans for quantities on those lines. The ledger uses `held_review` as its permanent scope. Any future operational shipment requires a separate authorization contract and scope.

## Data and request contract

| Record | Identity and purpose |
| --- | --- |
| `held_shipment_plan_revisions` | Original order ID and store/supplier tuple. Serializes writes for the order and advances once per accepted command. |
| `held_shipment_plans` | Generated shipment UUID, original order and store IDs, current review state, and revision. |
| `held_shipment_plan_allocations` | Shipment UUID and original purchased-line UUID, with positive integer quantity. Both foreign keys verify the same order and store. |
| `held_shipment_plan_events` | Shipment UUID and revision, store-scoped request UUID, authenticated actor UUID, server timestamp, previous and next states, and reason code. Revision 1 records the creation idempotency key. |

The read RPC `get_supplier_held_shipment_plans_v1` takes the original store and order IDs and a zero-based page. It returns `schema_version: 1`, `scope: held_review`, `shipping_enabled: false`, the current order review revision, purchased and planned quantities per original line, and up to ten plans per page. It projects the ten latest events per plan and retains the full history in the database. Remaining quantity equals purchased quantity minus allocations on all active plans, including those on other pages.

The write RPC `save_supplier_held_shipment_plan_v1` takes `p_store_id`, `p_order_id`, and `p_request_id`. Creation includes `p_allocations` as `{line_id, quantity}` entries and passes `null` for `p_shipment_id`, `p_expected_revision`, `p_to_state`, and `p_reason`. A change passes `null` for `p_allocations` and includes the shipment ID, the displayed plan revision, the target state, and an allowed reason. An identical retry by the same actor returns its original shipment ID and revision. A changed request under the same store key, a stale revision, or insufficient unplanned units yields a conflict. The order-level lock also protects cancellation and forces a retry when a repeatable-read transaction sees an older snapshot.

| From | To | Audit reason |
| --- | --- | --- |
| New plan | Queued | `plan_created` |
| Queued | Under review | `review_started` |
| Under review | Exception | `review_issue` |
| Exception | Under review | `review_reopened` |
| Queued, under review, or exception | Cancelled | `quantity_correction` or `plan_no_longer_needed` |

Cancelled is terminal. To correct quantities, cancel the plan and create a fresh one. The original allocation and cancellation event remain in the ledger. Packing, label ready, shipped, and delivered are reserved states. Database constraints reject them for this scope. Direct table access is denied, and the public RPCs run as invoker with membership-checked implementations in `apex_internal`.

## Reporting and future tracking event v1

Daily reports and cumulative exports retain the original order ID and purchase timestamp from the order snapshot. Future exports can join an order to multiple shipment IDs and each shipment to its original line IDs. A report date, row number, or tracking number cannot replace the original order ID. Review plans stay outside operational fulfillment counts and email attachments.

Proposed internal event payload for an independently authorized shipment

```json
{
  "schema_version": 1,
  "event_type": "tracking_recorded",
  "event_id": "00000000-0000-4000-8000-000000000001",
  "store_id": "00000000-0000-4000-8000-000000000002",
  "original_order_id": "00000000-0000-4000-8000-000000000003",
  "shipment_id": "00000000-0000-4000-8000-000000000004",
  "shipment_revision": 4,
  "carrier": "USPS",
  "tracking_number": "TEST0000000001",
  "actor_id": "00000000-0000-4000-8000-000000000005",
  "occurred_at": "2026-11-06T18:00:00.000Z"
}
```

The future server adapter derives `actor_id` from the authenticated supplier or trusted integration and assigns the timestamp in UTC. The event UUID serves as the replay key. Normalize the tracking number to uppercase alphanumeric characters and validate it against the selected carrier. Use `USPS`, `UPS`, `FEDEX`, or `DHL` as carrier codes. Duplicate events must agree on the immutable shipment and event payload. A separately verified carrier event is required for delivery observations. This PR defines the contract only. No tracking writer, carrier request, address access, or email/CSV mutation is wired to it.
