import { storage, setCachedWeightConfig } from "../storage";
import {
  fetchManagementUniverse,
  getManagementSourceUrl,
  clearManagementSourceCache,
  MANAGEMENT_SOURCE_URL_KEY,
} from "./externalApis";
import {
  computeMeasureWeights,
  assignDisclosureDefaults,
  type WeightLevel,
  type WeightConfig,
  type WeightConfigMeasure,
} from "@shared/weights";

export const MANAGEMENT_WEIGHTS_KEY = "management_measure_weights";

export interface MeasureRow {
  measureId: string;
  title: string;
  category: string;
  disclosurePct: number;
  disclosureLevel: WeightLevel;
  importanceLevel: WeightLevel;
  weight: number;
}

/** Persist the source URL and reset caches that depend on it. */
export async function setManagementSourceUrl(url: string): Promise<void> {
  await storage.setSetting(MANAGEMENT_SOURCE_URL_KEY, { url: url.trim() });
  clearManagementSourceCache();
}

export async function getSourceUrl(): Promise<string | null> {
  return getManagementSourceUrl();
}

export async function getWeightConfig(): Promise<WeightConfig | null> {
  const setting = await storage.getSetting(MANAGEMENT_WEIGHTS_KEY);
  const value = setting?.value as WeightConfig | undefined;
  if (!value || !Array.isArray(value.measures)) return null;
  return value;
}

/** Load the saved weight config into the storage-layer cache (called on startup). */
export async function initWeightCache(): Promise<void> {
  try {
    const config = await getWeightConfig();
    setCachedWeightConfig(config);
  } catch (err: any) {
    console.log(`[weights] Failed to load weight config on startup: ${err.message}`);
  }
}

/**
 * Build the per-measure rows for the "Populate weights" dialog from the configured source URL.
 * Disclosure % = share of the universe with a positive score (>0) for that measure. Default
 * disclosure levels are assigned by thirds; importance defaults to medium. Any previously saved
 * levels override the defaults so the dialog reopens with the user's choices.
 */
export async function buildMeasureRows(forceRefresh = false): Promise<MeasureRow[]> {
  const universe = await fetchManagementUniverse(forceRefresh);
  if (!universe) {
    throw new Error("No management source URL configured");
  }
  const total = universe.length;

  const meta = new Map<string, { title: string; category: string; positive: number }>();
  for (const company of universe) {
    for (const m of company.measureScores || []) {
      if (!m.measureId) continue;
      let entry = meta.get(m.measureId);
      if (!entry) {
        entry = { title: m.title || "", category: m.category || "Uncategorized", positive: 0 };
        meta.set(m.measureId, entry);
      }
      if (!entry.title && m.title) entry.title = m.title;
      if ((m.score ?? 0) > 0) entry.positive++;
    }
  }

  const base = Array.from(meta.entries()).map(([measureId, e]) => ({
    measureId,
    title: e.title,
    category: e.category,
    disclosurePct: total > 0 ? (e.positive / total) * 100 : 0,
  }));

  const disclosureDefaults = assignDisclosureDefaults(base);
  const saved = await getWeightConfig();
  const savedById = new Map((saved?.measures || []).map((m) => [m.measureId, m]));

  const withLevels = base.map((b) => {
    const prior = savedById.get(b.measureId);
    return {
      ...b,
      disclosureLevel: prior?.disclosureLevel ?? disclosureDefaults[b.measureId] ?? "medium",
      importanceLevel: prior?.importanceLevel ?? "medium",
    };
  });

  const weighted = computeMeasureWeights(withLevels);
  return weighted.sort((a, b) => b.disclosurePct - a.disclosurePct);
}

/**
 * Save the user's chosen disclosure/importance levels, compute the resulting weights, persist the
 * config, refresh the in-memory cache, and recompute every company's weighted management score.
 */
export async function saveWeightConfig(
  input: Array<{
    measureId: string;
    title?: string;
    category?: string;
    disclosurePct?: number;
    disclosureLevel: WeightLevel;
    importanceLevel: WeightLevel;
  }>,
): Promise<{ config: WeightConfig; recomputed: number }> {
  const weighted = computeMeasureWeights(input);
  const measures: WeightConfigMeasure[] = weighted.map((m) => ({
    measureId: m.measureId,
    title: m.title || "",
    category: m.category || "Uncategorized",
    disclosurePct: m.disclosurePct ?? 0,
    disclosureLevel: m.disclosureLevel,
    importanceLevel: m.importanceLevel,
    weight: m.weight,
  }));
  const config: WeightConfig = { measures, updatedAt: new Date().toISOString() };

  await storage.setSetting(MANAGEMENT_WEIGHTS_KEY, config);
  setCachedWeightConfig(config);
  const recomputed = await storage.recomputeWeightedScores();
  return { config, recomputed };
}
