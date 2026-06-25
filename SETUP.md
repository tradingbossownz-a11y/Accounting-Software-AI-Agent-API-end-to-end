# Setup & testing

## 1. Node.js (one-time)
The app uses Node's built-in `fetch`, so you need **Node 18 or newer**.
```bash
node -v
```
If it's older or missing, install the LTS from https://nodejs.org and re-check.

## 2. Run the app (no key needed yet)
```bash
node server.js
```
It opens http://localhost:4321 and runs on the demo data. Confirm clients load and you can browse them. The AI button will say "no key" until step 3 — that's expected.

## 3. Add your Anthropic API key (for the AI reader)
1. Create a key at https://console.anthropic.com → **API keys**.
   - This is **separate from Claude Pro** and billed per use.
2. Provide it in **one** of two ways:
   - **File:** create `api-key.txt` in your data folder (`~/Documents/Asesoria NL/`) containing only the key.
   - **Env var:** `export ANTHROPIC_API_KEY=sk-ant-...` then start the app from that terminal.
3. Restart: `node server.js`

## 4. Test the reader, one document type at a time
For each, upload a sample and check the returned fields + the suggested modelo:
- [ ] **Factura** — base, ivaPct, total, direction (emitida/recibida)
- [ ] **Nómina** — period, gross, IRPF, SS, net
- [ ] **Certificado de retenciones** — fiscal year, income total, retenciones total
- [ ] **Resumen anual** — kind, year, totals

Confirm that nothing is saved until you click confirm, and that the pre-filled modelo matches what you expect. If a mapping is wrong, fix it in `modelo-map.js` (look for the `// VERIFY` markers).

## Troubleshooting
- **"NO_KEY"** → key not found; re-check step 3 and restart.
- **fetch error / Node version** → you're below Node 18; upgrade.
- **Port busy** → the app is already running; it just opens the browser.
