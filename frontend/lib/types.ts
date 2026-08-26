export type AgentTraceStep = {
  ts_ms: number;
  actor: "edge" | "model" | "graph" | "agent" | "ledger" | "policy";
  message: string;
  level: "info" | "warn" | "alert" | "success";
};

export type ShapContribution = {
  feature: string;
  label: string;
  value: unknown;
  contribution: number;
  direction: "RISK_UP" | "RISK_DOWN";
};

export type GraphEvidence = {
  component_size: number;
  mule_nodes: string[];
  shared_device_vpas: number;
  ring_detected: boolean;
  ring_structural_ratio: number;
  summary: string;
};

export type DisputeDossier = {
  dossier_id: string;
  generated_by: "llm" | "template";
  title: string;
  executive_summary: string;
  evidence: string[];
  shap_reason_codes: string[];
  recommended_actions: string[];
  regulatory_note: string;
};

export type RiskEvaluation = {
  event_id: string;
  risk_score: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH";
  decision:
    | "AUTO_APPROVE"
    | "STEP_UP_AUTHENTICATION"
    | "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER";
  latency_ms: number;
  top_factors: ShapContribution[];
  graph_evidence: GraphEvidence;
  trace: AgentTraceStep[];
  dispute_dossier: DisputeDossier | null;
  audit_ref: string;
  model_version: string;
  idempotent_replay?: boolean;
};

export type Preset = {
  label: string;
  description: string;
  expected_band: string;
  payload: object;
};

/* ------------------------------------------------------------------ */
/* Topology (graph engine)                                            */
/* ------------------------------------------------------------------ */
export type TopoNodeType =
  | "device"
  | "vpa"
  | "card"
  | "ip"
  | "email"
  | "customer";

export type TopoNode = {
  id: string;
  type: TopoNodeType;
  label: string;
  mule: boolean;
};

export type Topology = {
  center?: string;
  nodes: TopoNode[];
  edges: [string, string][];
};

/* ------------------------------------------------------------------ */
/* Model report                                                       */
/* ------------------------------------------------------------------ */
export type ModelReport = {
  label?: string;
  model_version: string;
  model_kind?: string;
  holdout?: string;
  prevalence?: number;
  auprc?: number;
  bayes_ceiling_auprc?: number;
  efficiency_vs_ceiling?: number;
  fixed_threshold_operating_points?: Record<string, {
    precision: number;
    recall: number;
    flagged: number;
    fp_per_1000_legit: number;
    est_review_friction_inr_per_1k_txns: number;
  }>;
  flag_rate_operating_points?: Record<string, unknown>;
  auc_roc?: number;
  precision?: number;
  recall?: number;
  f1?: number;
};

/* ------------------------------------------------------------------ */
/* Ledger                                                             */
/* ------------------------------------------------------------------ */
export type LedgerStat = {
  entries: number;
  chain_verified: boolean;
  chain_head: string;
  path: string;
  deep_scan?: boolean;
  total_entries?: number;
  integrity_ok?: boolean;
  credited?: number;
  debited?: number;
  disputed?: number;
  last_hash?: string;
};

export type LedgerEntry = {
  seq: number;
  ts: string;
  event_id: string;
  action: string;
  actor: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  prev_hash: string;
  hash: string;
};

/* ------------------------------------------------------------------ */
/* Live alert feed                                                    */
/* ------------------------------------------------------------------ */
export type LiveAlert = {
  id: string;
  ts: number;
  level: "info" | "warn" | "alert" | "success";
  title: string;
  detail: string;
  risk_score?: number;
};

/* ------------------------------------------------------------------ */
/* Analysts / investigators (avatar roster)                            */
/* ------------------------------------------------------------------ */
export type Analyst = {
  id: string;
  name: string;
  role: string;
  status: "online" | "investigating" | "offline";
};
