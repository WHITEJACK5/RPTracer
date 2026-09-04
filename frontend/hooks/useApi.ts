"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  evaluateRisk,
  fetchAnalysts,
  fetchLedger,
  fetchLedgerStats,
  fetchModelReport,
  fetchPresets,
  fetchTopology,
  PRESETS,
} from "@/lib/api";
import type { RiskEvaluation } from "@/lib/types";

export const queryKeys = {
  presets: ["presets"] as const,
  topology: (center?: string) => ["topology", center ?? "global"] as const,
  modelReport: ["model-report"] as const,
  ledgerStats: ["ledger-stats"] as const,
  ledger: (limit?: number) => ["ledger", limit ?? 100] as const,
  analysts: ["analysts"] as const,
};

/** POST /api/v1/risk/evaluate — scores a payload and returns the full dossier. */
export function useEvaluate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: object) => evaluateRisk(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ledgerStats });
      qc.invalidateQueries({ queryKey: queryKeys.ledger() });
      qc.invalidateQueries({ queryKey: queryKeys.modelReport });
      qc.invalidateQueries({ queryKey: queryKeys.topology() });
    },
  });
}

/** GET /api/v1/graph/topology — ego-graph around an optional center entity. */
export function useTopology(center?: string, session?: string) {
  return useQuery({
    queryKey: [...queryKeys.topology(center), session ?? "all"] as const,
    queryFn: () => fetchTopology(center, session),
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** GET /api/v1/model/report — model quality / drift metrics. */
export function useModelReport() {
  return useQuery({
    queryKey: queryKeys.modelReport,
    queryFn: fetchModelReport,
    retry: 1,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
}

/** GET /api/v1/ledger/stats — hash-chained ledger counters. */
export function useLedgerStats() {
  return useQuery({
    queryKey: queryKeys.ledgerStats,
    queryFn: fetchLedgerStats,
    retry: 1,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });
}

/** GET /api/v1/ledger — recent immutable ledger entries. */
export function useLedger(limit = 100) {
  return useQuery({
    queryKey: queryKeys.ledger(limit),
    queryFn: () => fetchLedger(limit),
    retry: 1,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });
}

/** GET /api/v1/presets — falls back to the bundled preset pack on failure. */
export function usePresets() {
  return useQuery({
    queryKey: queryKeys.presets,
    queryFn: async () => (await fetchPresets()) ?? PRESETS,
    staleTime: Infinity,
  });
}

/** GET /api/v1/analysts — investigator roster (bundled fallback). */
export function useAnalysts() {
  return useQuery({
    queryKey: queryKeys.analysts,
    queryFn: fetchAnalysts,
    staleTime: Infinity,
  });
}

export type { RiskEvaluation };
