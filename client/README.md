# GhostPeek Client

Even G2 app + phone companion for GhostPeek bridge.

## Dev

```
npm install
npm run dev
```

Opens at `http://localhost:5173`. Connect to your GhostPeek bridge.

## On-device testing

### QR sideload (hot-reload)
```
npx evenhub qr --url "http://<LAN-IP>:5173"
```
Scan from the Even Realities app on your phone.

### Package for install
```
npx evenhub pack app.json dist -o ghostpeek-client.ehpk
```
Upload via the Even dev portal for persistent install.

## Config

On first launch, scan the QR from your bridge's `/bootstrap` page, or enter the bridge URL and token manually in Settings. Config persists in localStorage.

## Gestures (G2 glasses)

| Gesture | Action |
|---------|--------|
| Single press | Send Enter |
| Double press | Toggle build/plan mode |
| Swipe up | Scroll up (or increase slider in slider mode) |
| Swipe down | Scroll down (or decrease slider in slider mode) |

## app.json

Whitelist your bridge URL(s) in `app.json` before packaging.
