GhostPeek — Ghostty → Even G2 bridge (WIP)

Purpose
- Stream multi-session Ghostty/pty output to Even G2 and phone companion.
- QR-based bootstrap: bridge shows QR with `{url, token, label}`; phone scans once, stores config.
- Supports tmux attach for persistent shells; optional slider/mode controls for build/plan workflows.

Status
- Early bridge skeleton with REST/WS, static QR bootstrap page (`/bootstrap`), token auth, optional mock PTY, rotate-token (flagged), tmux flag. Installer script included. Client apps not built yet.

Planned components
- Node/TS bridge: ws `/term`, REST `/sessions`, `/mode`, `/slider`, `/scrollback`, optional `/rotate-token` (disabled by default).
- PTY manager: spawn PTYs or attach to tmux, per-session scrollback ring.
- Bootstrap page: renders QR payload `{"url":"ws://<host>:8787","token":"<hex>","label":"GhostPeek"}` and status; rotate button hidden unless enabled.
- Phone/G2 app expectations: first-launch “Scan config”, store URL/token, autoconnect; gesture mapping suggestions in `docs/EVEN_APP.md`.

Quickstart (future)
- `curl -fsSL https://raw.githubusercontent.com/mikeleet/GhostPeek/main/scripts/install.sh | bash`
- Script will: install deps, start bridge on LAN/VPN IP and port 8787, generate/persist token, open `/bootstrap` QR page.
- You can also run manually: `npm install && npm run build && npm run start` (set HOST/PORT/TOKEN_FILE/etc.).

Local test on Mac (real PTY)
- `scripts/run-local.sh` — installs deps, builds, and starts the bridge with real PTY (`MOCK_PTY=false` default). Override env as needed: `HOST=127.0.0.1 PORT=8787 USE_TMUX=true`.
- Visit `http://<HOST>:<PORT>/bootstrap` to get the QR/JSON payload.
- Create a session: `scripts/create-session.sh` (uses token from `~/.ghostpeek/token` by default). Capture the `id` from the JSON response.
- Connect with a WS client (e.g., wscat): `wscat -c "ws://<HOST>:<PORT>/term?sessionId=<id>&token=$(cat ~/.ghostpeek/token)"` and type; output should echo from the shell.

QA/testing
- `npm install && npm test` — unit/integration for config, token persistence, auth guard, sessions, WS hello/echo (with mock PTY).
- `scripts/ralphloop.sh` — installs deps and runs tests in one go.
- Set `MOCK_PTY=true` to run tests/QA without spawning real PTYs (CI-safe); real PTY/tmux wiring still planned.
- CI: GitHub Actions `.github/workflows/ci.yml` runs tests with `MOCK_PTY=true`.
- Optional: set `REAL_PTY_TEST=true` to run a real PTY echo test locally (skipped in CI).

Security posture (default)
- Token required on all endpoints.
- Bind to LAN/VPN IP, port 8787.
- `/rotate-token` present but inactive unless enabled via flag.
- For public exposure, front with TLS/reverse proxy and keep token check on.

Docs
- `docs/CONFIG.md` — env/flags, tmux attach, token storage.
- `docs/EVEN_APP.md` — app.json whitelist/permissions, gesture mapping, QR schema.
