/**
 * Vypocty ceny a spotreby.
 *
 * Ciste funkcie bez Prisma importov - daju sa testovat bez databazy.
 * Vstupom su uz serializovane hodnoty (string | null), lebo Prisma Decimal
 * neprejde cez hranicu Server -> Client Component.
 */

export type PartCalcInput = {
  quantity: number;
  unitPrice: string | null;
  voltage: string | null;
  currentMa: string | null;
  acquired: boolean;
};

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Celkova cena vsetkych sucastok (ks * cena za kus). */
export function totalCost(parts: PartCalcInput[]): number {
  return parts.reduce((sum, p) => {
    const price = num(p.unitPrice);
    return price === null ? sum : sum + price * p.quantity;
  }, 0);
}

/** Cena toho, co este nie je kupene. */
export function remainingCost(parts: PartCalcInput[]): number {
  return totalCost(parts.filter((p) => !p.acquired));
}

export type PowerRail = { voltage: number; currentMa: number; watts: number };

export type PowerBudget = {
  rails: PowerRail[];
  totalWatts: number;
  recommended: { voltage: number; currentA: number } | null;
  /** Kolko sucastok ma vyplnene V aj mA - kvoli hlaseniu v UI. */
  countedParts: number;
};

/**
 * Rozpocet energie.
 *
 * Prudy sa scitavaju po napatovych vetvach: 500 mA pri 5 V a 500 mA pri 3,3 V
 * nie je 1 A na jednej vetve, ale dve nezavisle vetvy s roznym vykonom.
 *
 * Odhad predpoklada sucasnu prevadzku vsetkych sucastok. Realny odber kolise
 * (ESP32: ~20 mA idle vs ~250 mA pri Wi-Fi TX spicke), preto ma odporucany
 * zdroj 30 % rezervu.
 */
export function powerBudget(parts: PartCalcInput[]): PowerBudget {
  const rails = new Map<string, PowerRail>();
  let countedParts = 0;

  for (const p of parts) {
    const v = num(p.voltage);
    const ma = num(p.currentMa);
    if (v === null || ma === null || v <= 0) continue;

    countedParts += 1;
    const key = v.toFixed(2);
    const rail = rails.get(key) ?? { voltage: v, currentMa: 0, watts: 0 };
    rail.currentMa += ma * p.quantity;
    rail.watts = (rail.voltage * rail.currentMa) / 1000;
    rails.set(key, rail);
  }

  const list = [...rails.values()].sort((a, b) => b.voltage - a.voltage);
  const totalWatts = list.reduce((w, r) => w + r.watts, 0);

  // Odporucanie sa viaze na vetvu s najvyssim napatim - z nej sa zvycajne
  // napaja cely projekt a nizsie vetvy vznikaju menicom.
  const main = list[0];

  return {
    rails: list,
    totalWatts,
    countedParts,
    recommended: main
      ? { voltage: main.voltage, currentA: (main.currentMa * 1.3) / 1000 }
      : null,
  };
}

/** Nakupny zoznam: nekupene sucastky zoskupene podla domeny obchodu. */
export function groupByShop<T extends { shopUrl: string | null }>(parts: T[]) {
  const byShop = new Map<string, T[]>();
  for (const p of parts) {
    let shop = "Unspecified shop";
    if (p.shopUrl) {
      try {
        shop = new URL(p.shopUrl).hostname.replace(/^www\./, "");
      } catch {
        /* neplatna URL -> zostane Neurceny obchod */
      }
    }
    byShop.set(shop, [...(byShop.get(shop) ?? []), p]);
  }
  return [...byShop.entries()].map(([shop, items]) => ({ shop, items }));
}
