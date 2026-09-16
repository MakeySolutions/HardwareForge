import { describe, expect, it } from "vitest";
import { groupByShop, powerBudget, remainingCost, totalCost, type PartCalcInput } from "./calc";

const part = (p: Partial<PartCalcInput>): PartCalcInput => ({
  quantity: 1,
  unitPrice: null,
  voltage: null,
  currentMa: null,
  acquired: false,
  ...p,
});

describe("totalCost / remainingCost", () => {
  it("sčíta ks × cena a ignoruje prázdnu cenu", () => {
    const parts = [
      part({ quantity: 2, unitPrice: "6.50" }),
      part({ unitPrice: "4.20", acquired: true }),
      part({ quantity: 3 }),
    ];
    expect(totalCost(parts)).toBeCloseTo(17.2, 10);
    expect(remainingCost(parts)).toBeCloseTo(13, 10);
  });

  it("neplatné číslo nerozbije súčet", () => {
    expect(totalCost([part({ unitPrice: "abc" }), part({ unitPrice: "1" })])).toBe(1);
  });
});

describe("powerBudget", () => {
  it("sčítava prúdy po napäťových vetvách", () => {
    const b = powerBudget([
      part({ voltage: "5", currentMa: "500" }),
      part({ voltage: "3.3", currentMa: "500" }),
      part({ voltage: "5", currentMa: "100", quantity: 2 }),
    ]);
    expect(b.rails).toHaveLength(2);
    expect(b.rails[0]).toMatchObject({ voltage: 5, currentMa: 700 });
    expect(b.totalWatts).toBeCloseTo(3.5 + 1.65, 10);
    expect(b.recommended?.currentA).toBeCloseTo(0.91, 10);
    expect(b.countedParts).toBe(3);
  });

  it("bez údajov nič neodporučí", () => {
    expect(powerBudget([part({})]).recommended).toBeNull();
  });
});

describe("groupByShop", () => {
  it("zoskupí podľa domény a zvládne neplatnú URL", () => {
    const groups = groupByShop([
      { shopUrl: "https://www.aliexpress.com/item/1" },
      { shopUrl: "https://aliexpress.com/item/2" },
      { shopUrl: "nie-je-url" },
      { shopUrl: null },
    ]);
    expect(groups.map((g) => [g.shop, g.items.length])).toEqual([
      ["aliexpress.com", 2],
      ["Unspecified shop", 2],
    ]);
  });
});
