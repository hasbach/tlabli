import type { Currency } from "./types";

/**
 * Lebanon-specific dual-currency formatting. Most owners price in USD (the
 * de-facto stable currency) but customers pay/see LBP too, so the storefront
 * can show both at once instead of forcing a single display currency.
 */
export function formatMoney(amount: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${amount.toFixed(2)}`;
  }
  // LBP is always shown as a whole number with thousands separators, no decimals.
  return `${Math.round(amount).toLocaleString("en-US")} L.L.`;
}

export function formatDualCurrency(
  usdAmount: number,
  lbpExchangeRate: number,
  primary: Currency = "USD"
): string {
  const lbpAmount = usdAmount * lbpExchangeRate;
  const usdText = formatMoney(usdAmount, "USD");
  const lbpText = formatMoney(lbpAmount, "LBP");
  return primary === "USD" ? `${usdText}  ·  ${lbpText}` : `${lbpText}  ·  ${usdText}`;
}
