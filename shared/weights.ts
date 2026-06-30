export type WeightLevel = "low" | "medium" | "high";

export const WEIGHT_LEVELS: WeightLevel[] = ["low", "medium", "high"];

export const LEVEL_VALUE: Record<WeightLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export interface MeasureWeightInput {
  measureId: string;
  disclosureLevel: WeightLevel;
  importanceLevel: WeightLevel;
}

export interface MeasureWeight extends MeasureWeightInput {
  weight: number;
}

export interface WeightConfigMeasure extends MeasureWeight {
  title: string;
  category: string;
  disclosurePct: number;
}

export interface WeightConfig {
  measures: WeightConfigMeasure[];
  updatedAt: string;
}

/**
 * Each measure's combined score = disclosure level + importance level (equal combination,
 * low=1/medium=2/high=3, range 2..6). The combined score is mapped linearly onto a raw weight
 * in [1, 3] so the largest weight is exactly 3x the smallest, then normalized so all weights
 * sum to 100 (%). If every measure has the same combined score, weights are equal.
 */
export function computeMeasureWeights<T extends MeasureWeightInput>(
  measures: T[],
): (T & { weight: number })[] {
  if (measures.length === 0) return [];
  const combined = measures.map(
    (m) => LEVEL_VALUE[m.disclosureLevel] + LEVEL_VALUE[m.importanceLevel],
  );
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const raw = combined.map((c) =>
    max === min ? 1 : 1 + 2 * ((c - min) / (max - min)),
  );
  const sum = raw.reduce((s, r) => s + r, 0);
  return measures.map((m, i) => ({ ...m, weight: (raw[i] / sum) * 100 }));
}

/**
 * Weighted management score (%) from a company's per-measure scores (0 / 0.5 / 1) and the
 * universe weights (percentages summing to 100). Weights are renormalized over the measures the
 * company actually has a score for, so a missing measure does not silently deflate the result.
 */
export function computeWeightedScore(
  measureScores: Record<string, number>,
  weights: Pick<MeasureWeight, "measureId" | "weight">[],
): number {
  if (weights.length === 0) return 0;
  let weightSum = 0;
  let acc = 0;
  for (const w of weights) {
    const s = measureScores[w.measureId];
    if (s == null) continue;
    weightSum += w.weight;
    acc += w.weight * s;
  }
  if (weightSum === 0) return 0;
  return (acc / weightSum) * 100;
}

/**
 * Default disclosure levels: sort measures by disclosure % descending, then split into thirds —
 * top third "high", middle third "medium", bottom third "low".
 */
export function assignDisclosureDefaults(
  measures: { measureId: string; disclosurePct: number }[],
): Record<string, WeightLevel> {
  const sorted = [...measures].sort((a, b) => b.disclosurePct - a.disclosurePct);
  const n = sorted.length;
  const third = Math.ceil(n / 3);
  const result: Record<string, WeightLevel> = {};
  sorted.forEach((m, i) => {
    result[m.measureId] = i < third ? "high" : i < 2 * third ? "medium" : "low";
  });
  return result;
}
