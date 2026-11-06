import { randomUUID } from "node:crypto";
import Link from "next/link";
import { supplierHeldOrderHref } from "@/lib/supplier/held-order-record.mjs";
import {
  type parseHeldShipmentPlans,
  SHIPMENT_REVIEW_LABELS,
  SHIPMENT_REVIEW_REASONS,
  shipmentReviewActions,
} from "@/lib/supplier/held-shipment-plans.mjs";
import { HeldShipmentPlanTransition } from "./held-shipment-plan-transition";

const central = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
});

export function HeldShipmentPlanHistory({ review, storeId, orderId, actorId, lines }: {
  review: NonNullable<ReturnType<typeof parseHeldShipmentPlans>>;
  storeId: string;
  orderId: string;
  actorId: string;
  lines: readonly { id: string; title: string; variant: string }[];
}) {
  const baseHref = supplierHeldOrderHref(storeId, orderId);
  const titles = new Map(lines.map(({ id, title, variant }) => [id, variant ? `${title} · ${variant}` : title]));

  return <section className="apex-orders-line-review" aria-labelledby="shipment-plan-history">
    <h3 id="shipment-plan-history">Shipment plan history</h3>
    <p className="notice">Cancelling a plan makes its units available to plan again and keeps its history.</p>
    {review.plans.length === 0 && <p>No review plans on this page.</p>}
    <div className="apex-orders-line-list">
      {review.plans.map((plan) => {
        const actions = shipmentReviewActions(plan.state);
        const total = plan.allocations.reduce((count, { quantity }) => count + quantity, 0);
        return <details className="apex-orders-line apex-orders-plan" key={plan.shipment_id}>
          <summary>
            <strong>{SHIPMENT_REVIEW_LABELS[plan.state]}</strong>
            <span>{total} {total === 1 ? "unit" : "units"} · Revision {plan.revision}</span>
          </summary>
          <p className="notice">Shipment plan ID <strong>{plan.shipment_id}</strong></p>
          <ul>
            {plan.allocations.map(({ line_id, quantity }) => <li key={line_id}>
              {quantity} × {titles.get(line_id)}
            </li>)}
          </ul>
          <h4>Review activity</h4>
          {plan.events.length < plan.revision && <p className="notice">
            Showing the latest {plan.events.length} of {plan.revision} entries.
          </p>}
          <ol>
            {plan.events.map((event) => <li key={event.revision}>
              <strong>{SHIPMENT_REVIEW_REASONS[event.reason as keyof typeof SHIPMENT_REVIEW_REASONS]}</strong>
              <small>
                {event.actor_id === actorId ? "You" : "Supplier teammate"} · {" "}
                <time dateTime={event.occurred_at}>{central.format(new Date(event.occurred_at))} CT</time>
              </small>
            </li>)}
          </ol>
          {actions.length > 0 && <HeldShipmentPlanTransition
            key={plan.revision} storeId={storeId} orderId={orderId} shipmentId={plan.shipment_id}
            revision={plan.revision} requestId={randomUUID()} actions={actions}
          />}
        </details>;
      })}
    </div>
    {baseHref && (review.page > 0 || review.hasMore) && <nav className="actions" aria-label="Shipment plan pages">
      {review.page > 0 && <Link className="button secondary" href={`${baseHref}&plans=${review.page - 1}`}>
        Newer plans
      </Link>}
      {review.hasMore && <Link className="button secondary" href={`${baseHref}&plans=${review.page + 1}`}>
        Older plans
      </Link>}
    </nav>}
  </section>;
}
