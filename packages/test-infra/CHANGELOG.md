# @experiencequality/test-infra

## 1.0.7

### Patch Changes

- 1986123: Attach a default WireMock container (`xq-wiremock`, `wiremock/wiremock:3.13.1`) to generated `xq-compose.yml` files. Services receive `WIREMOCK_BASE_URL` unless already set, `./wiremock` is mounted when present, and injection can be skipped with `xq-infra generate --no-wiremock` or by defining your own `wiremock`/`xq-wiremock` service.

## 1.0.6

### Patch Changes

- 9279890: Attach a default WireMock container (`xq-wiremock`, `wiremock/wiremock:3.13.1`) to generated `xq-compose.yml` files. Services receive `WIREMOCK_BASE_URL` unless already set, `./wiremock` is mounted when present, and injection can be skipped with `xq-infra generate --no-wiremock` or by defining your own `wiremock`/`xq-wiremock` service.

## 1.0.5

### Patch Changes

- d83a5a0: Release the browser testing facade and Docker test-environment CLI as part of the first Changesets-managed platform release.
