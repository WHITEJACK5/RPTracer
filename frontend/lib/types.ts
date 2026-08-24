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
  ring_confidence: number;
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
  model_version: string;
  trained_at: string;
  auc_roc: number;
  precision: number;
  recall: number;
  f1: number;
  feature_stability: Record<string, number>;
  drift_ppm: number;
  notes: string[];
};

/* ------------------------------------------------------------------ */
/* Ledger                                                             */
/* ------------------------------------------------------------------ */
export type LedgerStat = {
  total_entries: number;
  credited: number;
  debited: number;
  disputed: number;
  last_hash: string;
  integrity_ok: boolean;
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
