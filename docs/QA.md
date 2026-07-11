QA checklist (current skeleton)

Local checks
- npm install
- npm test (vitest)
- Optional: npm run dev and hit `/health` (requires node installed)

What tests cover
- Config parsing defaults/overrides
- Token generation/persistence
- REST auth guard and sessions listing/creation/scrollback
- WebSocket auth (reject bad token) and hello handshake
- WebSocket echo path with mock PTY
- Mode/slider REST updates
- Rotate-token (enabled, file-based) endpoint
- Bootstrap JSON payload

Not yet covered
- PTY/tmux behavior in depth (echo, exit handling)
- Bootstrap page visual rendering (static HTML now served; no snapshot test yet)

Optional
- Real PTY echo test gated by `REAL_PTY_TEST=true` (skipped by default/CI).

Future QA additions
- Integration: WS input/output echo
- PTY spawn/echo test (node-pty)
- Snapshot test for bootstrap HTML

CI
- `.github/workflows/ci.yml` runs npm install + npm test with `MOCK_PTY=true`.
