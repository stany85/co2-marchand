/**
 * Utilitaires de gestion de la monnaie CO2
 *
 * Path confirmé (co2 v1.6.3) : actor.system.wealth.gp.value / sp.value / cp.value
 * Taux de conversion CO2 : 1 PO = 10 PA = 100 PC  (1 PA = 10 PC)
 */

// ─── Conversion devise item ───────────────────────────────────────────────────

const UNIT_TO_CP = { po: 100, gp: 100, pa: 10, sp: 10, pc: 1, cp: 1 };

export function getItemNativePriceInCopper(item) {
  const val    = item.system?.price?.value ?? 0;
  const unit   = (item.system?.price?.unit ?? "po").toLowerCase();
  const factor = UNIT_TO_CP[unit] ?? 100;
  return Math.round(val * factor);
}

export function getItemPriceInCopper(item) {
  const flagPrice = item.flags?.["co2-marchand"]?.price;
  if (flagPrice !== undefined && flagPrice !== null) {
    return Math.round(flagPrice * 100);
  }
  return getItemNativePriceInCopper(item);
}

// ─── Richesse acteur ──────────────────────────────────────────────────────────

export function getWealthValues(actor) {
  const w = actor.system?.wealth;
  return {
    gp: w?.gp?.value ?? 0,
    sp: w?.sp?.value ?? 0,
    cp: w?.cp?.value ?? 0
  };
}

export function getTotalWealthInCopper(actor) {
  const { gp, sp, cp } = getWealthValues(actor);
  return (gp * 100) + (sp * 10) + cp;
}

export async function spendWealth(actor, costInCopper) {
  let total = getTotalWealthInCopper(actor);
  if (total < costInCopper) return false;
  total -= costInCopper;
  await actor.update({
    "system.wealth.gp.value": Math.floor(total / 100),
    "system.wealth.sp.value": Math.floor((total % 100) / 10),
    "system.wealth.cp.value": total % 10
  });
  return true;
}

export async function gainWealth(actor, gainInCopper) {
  let total = getTotalWealthInCopper(actor) + gainInCopper;
  await actor.update({
    "system.wealth.gp.value": Math.floor(total / 100),
    "system.wealth.sp.value": Math.floor((total % 100) / 10),
    "system.wealth.cp.value": total % 10
  });
}

// ─── Formatage ────────────────────────────────────────────────────────────────

export function formatWealth(copper) {
  if (!copper || copper <= 0) return "0 PC";
  const gp = Math.floor(copper / 100);
  const sp = Math.floor((copper % 100) / 10);
  const cp = copper % 10;
  const parts = [];
  if (gp > 0) parts.push(`${gp} PO`);
  if (sp > 0) parts.push(`${sp} PA`);
  if (cp > 0) parts.push(`${cp} PC`);
  return parts.join(", ");
}

export function applyModifier(priceCP, modifier) {
  if (!modifier) return priceCP;
  return Math.max(1, Math.round(priceCP * (1 + modifier / 100)));
}

export function gpToCopper(gp) { return Math.round(gp * 100); }

// ─── BOURSE DU MARCHAND ───────────────────────────────────────────────────────
// Stockée en copper dans actor.flags["co2-marchand"].purse

export function getMerchantPurse(actor) {
  return actor.getFlag("co2-marchand", "purse") ?? 0;
}

export async function spendMerchantPurse(actor, amountCP) {
  const purse = getMerchantPurse(actor);
  if (purse < amountCP) return false;
  await actor.setFlag("co2-marchand", "purse", purse - amountCP);
  return true;
}

export async function gainMerchantPurse(actor, amountCP) {
  const purse = getMerchantPurse(actor);
  await actor.setFlag("co2-marchand", "purse", purse + amountCP);
  return true;
}
