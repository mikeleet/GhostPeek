Even app integration notes (planned)

Manifest (app.json) basics
- `edition`: 202601
- `min_app_version`: 2.0.0
- `min_sdk_version`: match installed SDK
- `permissions`: include `network`; add `g2-microphone` if you later stream audio/STT.
- `network.whitelist`: include your bridge URL(s), e.g., `ws://<lan-or-vpn-host>:8787` (and `https/wss` if proxied).

QR payload schema
```json
{"url":"ws://<host>:8787","token":"<hex>","label":"GhostPeek"}
```
- Encoded into QR on `/bootstrap`. The phone app scans once and stores URL/token.

Gesture/UI suggestions (G2)
- Single press: send Enter or focus input.
- Double press: toggle build/plan mode (POST `/sessions/{id}/mode`).
- Swipe up/down: scroll viewport; in slider mode, adjust value and POST `/sessions/{id}/slider`.
- Double press + swipe: cycle tabs (if implemented client-side).
- Status bar: show tab name, mode, slider value, connection state.

Phone app UX goals
- First-launch: “Scan config” (camera) + manual entry; store URL/token; test connection.
- Sessions list: cards with status/unread/mode; create/close/reorder.
- Session detail: terminal viewport, status bar, controls for mode/slider/tab switch, keyboard input.
