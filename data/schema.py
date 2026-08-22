"""Neutral feature-name contract shared by the ground-truth generator and the
scoring model. Contains NAMES ONLY — no weights, baselines, or label logic —
so importing it does not couple the label process to the model."""

FEATURE_NAMES: list[str] = [
    "amount_log", "amount_gt_50k", "is_cod", "address_mismatch",
    "account_newness", "new_customer", "txn_rate_1h", "txn_rate_24h",
    "amount_velocity", "avg_ticket_ratio", "device_spread",
    "device_fan_out", "vpa_degree", "card_share", "ip_crowding",
    "rto_rate", "night_hour", "disposable_email", "mule_confidence",
]
