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

export type Preset = { label: string; description: string; expected_band: string; payload: object };
