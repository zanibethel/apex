/**
 * Integer-cent discount math for the Apex checkout quote engine.
 * This is not an order/payment implementation. Trusted checkout must reprice
 * actual line items on the server and reserve/redemption-update atomically.
 */
export function quoteDiscount(code, subtotalCents, now = new Date()) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    return { eligible: false, discountCents: 0, totalCents: 0, reason: "Invalid subtotal" };
  }
  const rejected = reason => ({ eligible: false, discountCents: 0,
    totalCents: subtotalCents, reason });
  if (!code || code.is_active !== true) return rejected("Code is inactive or unavailable");
  if (!Number.isSafeInteger(code.discount_value) || code.discount_value <= 0 ||
      !Number.isSafeInteger(code.min_subtotal_cents) || code.min_subtotal_cents < 0) {
    return rejected("Invalid code configuration");
  }
  const time = now.getTime();
  if (!Number.isFinite(time)) return rejected("Invalid quote time");
  if (code.starts_at && time < new Date(code.starts_at).getTime()) {
    return rejected("Code has not started");
  }
  if (code.ends_at && time >= new Date(code.ends_at).getTime()) {
    return rejected("Code has expired");
  }
  if (subtotalCents < code.min_subtotal_cents) {
    return rejected("Minimum subtotal not met");
  }
  if (code.usage_limit !== null && code.usage_limit !== undefined &&
    (!Number.isSafeInteger(code.usage_limit) || !Number.isSafeInteger(code.redemption_count) ||
      code.redemption_count >= code.usage_limit)) {
    return rejected("Code usage limit reached");
  }
  let discountCents;
  if (code.discount_kind === "percentage") {
    if (code.discount_value > 95) return rejected("Invalid percentage");
    discountCents = Math.floor((subtotalCents * code.discount_value + 50) / 100);
  } else if (code.discount_kind === "fixed") {
    discountCents = code.discount_value;
  } else {
    return rejected("Invalid discount type");
  }
  discountCents = Math.min(discountCents, subtotalCents);
  return { eligible: true, discountCents, totalCents: subtotalCents-discountCents, reason: "" };
}
