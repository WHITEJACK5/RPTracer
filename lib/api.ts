import type { Preset } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export async function evaluateRisk(payload: object): Promise<Response> {
  return fetch(`${API_BASE}/api/v1/risk/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Idempotency-Key": `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchTopology(center?: string) {
  const q = center ? `?center=${encodeURIComponent(center)}` : "";
  const res = await fetch(`${API_BASE}/api/v1/graph/topology${q}`);
  if (!res.ok) throw new Error(`topology ${res.status}`);
  return res.json();
}

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/healthz`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return null;
  }
}

export const PRESETS: Record<string, Preset> = {
  normal_upi: {
    label: "Normal UPI",
    description: "Returning customer, clean device — AUTO_APPROVE expected",
    expected_band: "LOW",
    payload: {
      event_id: "pay_demo_normal_001",
      event_type: "payment.captured",
      amount: 1499.0,
      instrument: { method: "upi", vpa: "demo.customer1@okhdfcbank" },
      customer: { id: "cust_demo_normal", new_customer: false, account_age_days: 890 },
      context: {
        device_id: "DEV-DEMO-NORMAL-01",
        ip: "49.36.180.44",
        email: "demo.customer@gmail.com",
        city: "Bengaluru",
        state: "KA",
        hour_of_day: 14,
      },
    },
  },
  rto_cod: {
    label: "High-Risk RTO COD",
    description: "COD + address mismatch + 62% RTO history — payout hold",
    expected_band: "HIGH",
    payload: {
      event_id: "pay_demo_rto_001",
      event_type: "payment.captured",
      amount: 18999.0,
      instrument: { method: "cod", is_cod: true },
      customer: { id: "cust_demo_rto", new_customer: true, account_age_days: 15, rto_rate_history: 0.62 },
      context: {
        device_id: "DEV-DEMO-RTO-01",
        ip: "172.190.4.21",
        billing_shipping_mismatch: true,
        txn_count_1h: 4,
        txn_count_24h: 9,
        amount_sum_24h: 52000,
        hour_of_day: 2,
      },
    },
  },
  mule_ring: {
    label: "Multi-Account Mule Ring",
    description: "One device → 14 flagged VPAs — GraphSAGE ring detection",
    expected_band: "HIGH",
    payload: {
      event_id: "pay_demo_mule_001",
      event_type: "payment.captured",
      amount: 45000.0,
      instrument: { method: "upi", vpa: "fraudvpa07@ybl", card_fingerprint: "FP-MULE-1" },
      customer: { id: "cust_demo_mule", new_customer: true, account_age_days: 3 },
      context: {
        device_id: "DEV-MULE-RING-01",
        ip: "203.0.113.7",
        txn_count_1h: 3,
        txn_count_24h: 11,
        amount_sum_24h: 310000,
      },
    },
  },
  synthetic_id: {
    label: "Synthetic ID Attack",
    description: "Day-old identity, burner email, crowded IP pool — dossier generated",
    expected_band: "HIGH",
    payload: {
      event_id: "pay_demo_synid_001",
      event_type: "payment.captured",
      amount: 42000.0,
      instrument: { method: "card", card_fingerprint: "FP-SYN-POOL-77" },
      customer: { id: "cust_demo_syn", new_customer: true, account_age_days: 2 },
      context: {
        device_id: "DEV-SYN-NEW-7742",
        ip: "198.51.100.23",
        email: "synth.user@yopmail.com",
        billing_shipping_mismatch: true,
        txn_count_1h: 6,
        txn_count_24h: 22,
        amount_sum_24h: 240000,
        distinct_devices_24h: 9,
        hour_of_day: 3,
      },
    },
  },
};

export type PresetKey = keyof typeof PRESETS;
