# Asesoría NL

A local, **zero-dependency** client- and tax-document management tool for a Spanish tax advisory practice serving Dutch-speaking clients — with an **AI document reader** that turns invoices, payslips and tax certificates into structured, ledger-ready data.

> Portfolio note: all data included in this repo is **fictional**. The app is designed so real client data and API keys live outside the repository.

## ✨ AI features (the interesting part)

- **Multi-document AI reader** — drop in a PDF or photo of a *factura*, *nómina*, *certificado de retenciones* or yearly statement. The app sends it to Claude and gets back **strict structured JSON** (no prose, no markdown), then pre-fills the right form. Built with the Anthropic API using a constrained-output prompt and document/image input.
- **Modelo mapping with human-in-the-loop** — each document type maps to the Spanish tax *modelo(s)* it feeds (e.g. nómina → 111/190, factura → 303/390). The app suggests the modelo and pre-fills the fields; **nothing is committed until the user confirms.** The mapping rules live in an editable config, not in the model.
- **"Ask your books"** — a natural-language question about a client is answered grounded only in that client's data.
- **Multilingual deadline reminders** — generate a short client reminder for an upcoming modelo deadline in Dutch, Spanish or English.

## 🧰 Tech stack

- **Pure Node.js, zero npm dependencies** — no framework, no build step. Backend is one `server.js`; frontend is one `index.html` (vanilla JS + CSS).
- **Anthropic API** via raw `fetch` (Node 18+) for all AI features.
- **Plain JSON storage** with atomic, backup-on-write saves.

## 🧱 What it does (beyond AI)

Client management (particular / autónomo / empresa), Spanish *modelo* catalog with automatic deadline generation, document checklists, a bookkeeping ledger with IVA and quarterly 303 breakdowns, and bank-statement CSV import.

## 🏗️ Architecture

`index.html` (UI) talks to `server.js` over a tiny local HTTP API: `/data` reads & writes the JSON store; `/extract` handles AI document reading. AI logic and the modelo mapping are isolated so the tax rules stay reviewable and editable (`modelo-map.js`). The server binds to `127.0.0.1` only — it never listens on the network.

## 🚀 Setup

See **[SETUP.md](SETUP.md)** for step-by-step setup and testing. Short version:

```bash
node -v                 # need v18+
node server.js          # opens http://localhost:4321
```

For the AI reader, add an Anthropic API key (see SETUP.md). The non-AI parts run with no key at all.

## ⚠️ Disclaimer

The AI reader assists with data entry; it does **not** file taxes. Every extracted figure and modelo suggestion must be reviewed by a qualified person before any real filing. Mappings in `modelo-map.js` are a starting point and must be verified against current Spanish tax rules.

## License

MIT — see [LICENSE](LICENSE).
