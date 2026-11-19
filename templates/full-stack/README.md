# {{projectName}}

Generated with the StellarForge `full-stack` template.

## Structure

```text
frontend/   Browser-facing application boundary and tests
backend/    Node.js API/runtime boundary and tests
contracts/  Soroban contract workspace boundary
```

The starter keeps these layers separate so application UI, server-side Stellar integration, and smart-contract code can evolve independently.

## Requirements

- Node.js 22.13 or newer

## Validate the starter

```bash
npm run check
npm test
```

These checks are dependency-free and do not require network access.

## Scripts

| Script                  | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run check`         | Syntax-checks the frontend and backend entry points.                   |
| `npm test`              | Runs the frontend and backend test files with the Node.js test runner. |
| `npm run start:backend` | Starts the backend server.                                             |

The starter has no build step and no runtime dependencies; `frontend/src/app.js` is plain ES module code that a host page or bundler can import.

## Run the backend

```bash
npm run start:backend
```

The backend exposes `GET /health` on `127.0.0.1:3000` by default. Set `BACKEND_PORT` to override the port. The frontend has no server and no port variable at all.

If the configured port is already in use, startup fails with a raw Node error such as:

```text
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

That message is printed by the operating system, not by the backend. The port shown in the error matches `BACKEND_PORT` (or the `3000` default when it is not set), and the bind address is always `127.0.0.1`.

Resolve it safely by either changing the port or stopping only a process you recognize as your own:

1. Change the port:
   - the backend does not automatically load `.env`, so set `BACKEND_PORT` in your environment or in the environment manager of your choice (for example `BACKEND_PORT=3100 npm run start:backend`);
2. Or find and stop only the process you recognize as your own previous instance:
   - Windows: `netstat -ano | findstr :3000` shows the owning PID; stop it with `taskkill /PID <pid> /T`;
   - macOS/Linux: `lsof -i :3000` shows the owning process; stop it with `kill <pid>`;
   - inspect what the process actually is first — handle only the one you started yourself, for example an earlier instance of this backend;
   - never kill arbitrary processes that happen to hold the port; prefer the owning PID you found above (`taskkill /PID <pid>` or `kill <pid>`) and avoid killing by process name, broad `pkill` matching, or SIGKILL-style forced termination.

The backend never hops ports automatically; it always binds exactly the configured port, which makes collisions visible instead of hiding on a random one. This starter targets Stellar Testnet only; it does not configure or claim Mainnet or hosted deployment support.

## API Boundaries and Request Handling

The generated backend enforces deterministic, minimal HTTP boundaries without external framework overhead:

- **Method boundaries:** Routes enforce explicit allowed methods (`GET, HEAD` on `/health`, `POST` on `/api/echo`). Unsupported methods return a deterministic `405 Method Not Allowed` with an `Allow` header and `{ "error": "method_not_allowed" }`.
- **Unknown routes:** Requests to unmapped paths return a safe `404 Not Found` response (`{ "error": "not_found" }`) with no internal stack or environment reflection.
- **Request size bounds:** Incoming request bodies are constrained by `MAX_REQUEST_BODY_BYTES` (64 KiB default). Payloads exceeding this bound (either via `Content-Length` or chunked transfer streaming) are rejected immediately with `413 Payload Too Large` before unbounded memory buffering.
- **Content type & JSON validation:** JSON endpoints require `application/json` (returning `415 Unsupported Media Type` otherwise) and explicitly handle malformed JSON syntax with `400 Bad Request` (`{ "error": "malformed_json" }`).
- **Security headers:** Responses include baseline `X-Content-Type-Options: nosniff`.

## Environment

Copy `.env.example` into your preferred local environment-management flow. The example contains public Stellar Testnet endpoints only and no credentials.

Never commit wallet seeds, secret keys, signing credentials, production tokens, or private infrastructure credentials.

## Contracts

`contracts/` is intentionally a boundary rather than a fake production contract. Add reviewed Soroban code when the application domain is defined, or generate a dedicated StellarForge `smart-contract` starter for contract-focused work.
