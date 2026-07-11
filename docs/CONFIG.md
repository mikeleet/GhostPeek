GhostPeek configuration (planned)

Env/flags (defaults to be implemented)
- `HOST`: bind host. Default: detected LAN/VPN IP.
- `PORT`: bind port. Default: 8787.
- `TOKEN_FILE`: path to persist auth token. Default: `~/.ghostpeek/token` (planned).
- `TOKEN`: optional override token. If unset, generate/persist.
- `ROTATE_TOKEN_ENABLED`: enable `/rotate-token`. Default: false (endpoint placeholder only).
- Rotation works only when the token comes from file (no `TOKEN` env override).
- `USE_TMUX`: attach to tmux sessions/panes instead of spawning new PTYs. Default: false.
- `TMUX_SESSION_PREFIX`: base name for tmux sessions (e.g., `ghostpeek`).
- `SCROLLBACK_LINES`: per-session ring buffer size. Default target: 5000.
- `MOCK_PTY` / `GHOSTPEEK_MOCK_PTY`: when `true`, use an in-memory mock PTY (useful for tests/CI).

Planned behaviors
- Token required on all endpoints (WS/REST).
- When `USE_TMUX=true`, bridge will attach/create tmux sessions for persistence.
- `/rotate-token` route exists but responds only when `ROTATE_TOKEN_ENABLED=true`; UI hides rotate by default.

Networking notes
- Keep to LAN/VPN when possible. If exposing publicly, use TLS via reverse proxy (Caddy/Traefik/nginx) and retain token auth.
- CORS will be set to allow your Even app origin(s).
