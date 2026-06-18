# Style 3 — Egress Proxy (Enterprise)

Infrastructure-level capture adapter. Language- and SDK-agnostic, total
coverage — even agents not yet built — because it sits in the network egress
path rather than in any application process.

This is the **enterprise tier** of the "one core, many adapters" architecture:
the same IBaseIT inspection core that the SDK (Style 1) and gateway (Style 2)
call, fronted here by an Envoy-based egress proxy deployed inside the
customer's VPC.

## How it works

```
agent pods ──▶ egress Envoy (this proxy) ──▶ ext_authz ──▶ IBaseIT core ──▶ LLM provider
                     │                                          │
                     └── OTel spans ───────────────────────────┘
```

1. All outbound LLM traffic (`api.openai.com`, `api.anthropic.com`, …) is
   routed through the proxy via egress networking rules.
2. Envoy calls the IBaseIT inspection core over the `ext_authz` filter, which
   resolves the agent's policy and runs the **same** firewall / PII / jailbreak
   / model-theft checks used by the SDK and gateway.
3. On a block verdict the request is rejected at the edge; otherwise it's
   forwarded to the real provider. OTel spans are emitted so Langfuse still
   sees everything.

## Requirements (per spec)

- **TLS interception** (opt-in). Without it, the proxy falls back to
  metadata-only capture (no content-level detection).
- **HA** deployment (≥2 replicas behind a service).
- A **fail-open / fail-closed** choice, set per risk tier, applied when the
  core is unreachable.
- A **latency budget** for the inline `ext_authz` hop.

## Install

```bash
helm install ibaseit-egress ./helm \
  --set registry.url=https://registry.ibaseit.com \
  --set registry.token=$IBASEIT_TOKEN \
  --set failMode=fail_open \
  --set tlsInterception.enabled=true
```

For clients who can't paste code into 200 services, this is the
zero-application-change option. See `helm/values.yaml` and `envoy.yaml`.
