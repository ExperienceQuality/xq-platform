---
'@experiencequality/test-infra': patch
---

Attach a default WireMock container (`xq-wiremock`, `wiremock/wiremock:3.13.1`) to generated `xq-compose.yml` files. Services receive `WIREMOCK_BASE_URL` unless already set, `./wiremock` is mounted when present, and injection can be skipped with `xq-infra generate --no-wiremock` or by defining your own `wiremock`/`xq-wiremock` service.
