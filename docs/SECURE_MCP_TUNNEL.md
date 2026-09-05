# Secure MCP Tunnel

The service is packaged to run as a local loopback MCP process. OpenAI Secure MCP
Tunnel owns the outbound authenticated connection; this repository does not add a
public listener, TLS termination, OAuth layer, or bearer-token protocol to the MCP
server.

## Start the built service directly

```sh
npm ci
npm run build
npm start
```

The default MCP URL is:

```text
http://127.0.0.1:2092/mcp
```

Set `PORT` to use another dedicated loopback port. Check local readiness at
`/healthz`; only an observed HTTP 200 response with `{"status":"ok"}` proves
the local process is ready.

The service exits on `SIGINT` or `SIGTERM` and fails instead of replacing a
process that already owns the configured port.

## Configure the machine-local tunnel profile

The current launcher convention uses one machine-local profile per ChatGPT
account. Both clients can safely target the same
stateless loopback service:

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

Keep tunnel configuration and credentials outside the repository. If the installed
client exposes different command help, follow that installed version rather than
copying stale flags blindly.

Once the profile exists, use the launcher for the managed server-and-tunnel
lifecycle:

```sh
mcp-skills
mcps status
mcps logs skills
mcps restart skills
mcps stop skills
```

`mcp-skills` starts the built loopback server, waits for the exact health response,
then starts both dedicated tunnels. `mcps status` reports the shared server
and each tunnel route separately, and the launcher does not print profile contents
or credential values.

Tunnel profiles, state, logs, and credential references belong in machine-local
config/state locations. This repository ignores `.env`, `.env.*`,
`.tunnel-client/`, and `.tunnel-client-bin` as defense in depth.

## Real ChatGPT smoke procedure

A healthy local process is necessary but does not prove that ChatGPT reached it.
When Developer Mode and Secure MCP Tunnel are available:

1. Run `mcp-skills` and observe `mcps status` reporting the shared Skills server
   and both tunnel routes as running.
2. Observe `/healthz` succeeding on the configured loopback port.
3. In each ChatGPT Developer Mode account/session, create or select the app
   backed by its corresponding Skills tunnel profile.
4. Ask ChatGPT to discover the MCP tools and confirm the observed tool names are
   exactly `load_skill` and `list_skills`.
5. Invoke `list_skills` and record the returned public catalog.
6. Invoke `load_skill` for one returned canonical name and record that a real MCP
   response was observed through ChatGPT.
7. Re-check `mcps status` after the request.

Record the actual returned status and tool results when this procedure is executed.
Do not turn this checklist into a success claim when the tunnel or ChatGPT Developer
Mode capability was unavailable.

## Troubleshooting

Use `mcps status` first, then `mcps logs skills` for the managed server and all
tunnel logs. Use `mcps restart skills` to replace the complete Skills lifecycle,
`mcps restart skills2` to replace one account route, or `mcps stop
skills` to stop the complete shared lifecycle.

If the service reports `EADDRINUSE`, stop the process using the configured port or
choose a different loopback port consistently for both the service and tunnel.
