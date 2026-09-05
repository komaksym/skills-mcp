# Operator guide

This guide covers the supported local runtime and the `mcps-launcher` lifecycle for the Skills MCP.

## Supported runtime

- Node.js 20 or newer.
- npm 10 or newer.
- TypeScript 5.9.x; this repository currently pins TypeScript 5.9.2 for development and build checks.
- A built checkout of this repository and, when using the launcher, the installed `mcps-launcher` plus OpenAI Secure MCP Tunnel client.

Install and verify the repository:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Start the built service directly with `npm start`. It binds only to loopback. The default MCP endpoint is `http://127.0.0.1:2092/mcp`; set `PORT` to use another loopback port.

Readiness is `GET /healthz`. Ready means an observed HTTP 200 response whose body is exactly `{"status":"ok"}`. A running process, open port, or tunnel status alone is not enough.

## Secure MCP Tunnel

The server stays on loopback; Secure MCP Tunnel owns the authenticated outbound connection. Keep tunnel identifiers, keys, profile contents, state, and logs machine-local.

With the current launcher convention, create one profile per ChatGPT account or
logical session. All profiles point at the same stateless loopback service:

```sh
tunnel-client init \
  --profile chatgpt-chat-skills-mcp \
  --tunnel-id '<tunnel-id>' \
  --mcp-server-url http://127.0.0.1:2092/mcp \
  --control-plane-api-key-ref env:CONTROL_PLANE_API_KEY

tunnel-client init \
  --profile chatgpt-chat-skills-mcp-2 \
  --tunnel-id '<second-tunnel-id>' \
  --mcp-server-url http://127.0.0.1:2092/mcp \
  --control-plane-api-key-ref env:CONTROL_PLANE_API_KEY_2
```

Do not commit the real tunnel identifier or any credential value. If the installed tunnel client exposes different flags, follow that installed version's help. See `docs/SECURE_MCP_TUNNEL.md` for the direct service/tunnel smoke procedure.

## Skills launcher lifecycle

Install `mcps-launcher` from its repository with `./install.sh`; its installer is idempotent, backs up conflicting files, and does not edit shell or tunnel configuration.

`mcps-launcher` manages the loopback server and the two account-bound Skills
tunnels as one operator target. The Skills commands are:

```sh
mcp-skills
mcps skills
mcps all
mcps status
mcps stop skills
mcps stop all
mcps restart skills
mcps restart all
mcps logs skills
mcps stop skills2
mcps logs skills2
```

`mcps both`, `mcps stop both`, and `mcps restart both` remain backward-compatible Chrome + Playwright commands and deliberately do not add Skills.

A healthy `mcps status` reports one shared server and two independently
matched tunnel PIDs. A missing or stale tunnel is reported on its own route;
the shared server remains available for the other clients. If the server is
unavailable, its dependent tunnel processes are cleaned up. `mcps logs skills`
shows the shared server and both tunnel logs without printing profile
contents or credentials.

The two tunnel clients do not imply two Skills catalogs. They are separate
authenticated outbound identities pointing at one local service. Use separate
service processes only for divergent catalogs or intentionally separate failure
domains.

The launcher defaults to `$HOME/.local/share/chatgpt-chat-skills-mcp/dist/main.js`. `SKILLS_MCP_SERVER_ENTRY`, `SKILLS_MCP_NODE_BIN`, and `SKILLS_MCP_PORT` may override machine-local runtime paths or the loopback port. Keep the server port consistent with the tunnel profile.
