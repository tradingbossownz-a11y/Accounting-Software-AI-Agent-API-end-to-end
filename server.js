// Asesoría NL — lokale server. Geen npm-pakketten nodig, puur Node.
// Starten:  node server.js
// Data staat in klanten.json (of data/demo-klanten.json bij een verse kloon).

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { DOC_TYPES, MODELO_MAP, incomeModeloForType } = require('./modelo-map.js');

const PORT      = 4321;
const APP_DIR   = __dirname;
const DATA_DIR  = process.env.ASESORIA_DATA_DIR || __dirname;
const DATA      = path.join(DATA_DIR, 'klanten.json');
const DEMO_DATA = path.join(APP_DIR, 'data', 'demo-klanten.json');
const HTML      = path.join(APP_DIR, 'index.html');

function sendJSON(res, obj, code = 200) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

// API-sleutel: omgevingsvariabele, anders api-key.txt in de datamap of bij de app.
function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  for (const dir of [DATA_DIR, APP_DIR]) {
    try {
      const p = path.join(dir, 'api-key.txt');
      if (fs.existsSync(p)) { const k = fs.readFileSync(p, 'utf8').trim(); if (k) return k; }
    } catch (_) {}
  }
  return null;
}

// Data lezen — klanten.json als die bestaat, anders demo-klanten.json.
function readData() {
  try { if (fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) {}
  try { return JSON.parse(fs.readFileSync(DEMO_DATA, 'utf8')); } catch (_) {}
  return { clients: [], seq: 1 };
}

// Bouw een extractie-prompt op basis van het documenttype.
function buildExtractPrompt(docType, clientNif, clientName) {
  const ctx = `Client/issuer NIF: "${clientNif || 'unknown'}"${clientName ? ` (${clientName})` : ''}`;

  if (docType === 'auto' || !DOC_TYPES[docType]) {
    const schemas = Object.entries(DOC_TYPES)
      .map(([k, d]) => `"${k}" (${d.label}): return exactly ${JSON.stringify(d.schema)}`)
      .join('\n');
    return (
      'You are a Spanish tax document assistant. Examine this document and return ONLY valid JSON — no explanation, no markdown, no backticks.\n\n' +
      'Choose the docType that best matches, then return that schema filled in:\n' +
      schemas + '\n\n' +
      ctx + '\n' +
      'For factura: set direction="emitida" if the emisor NIF matches the client NIF above; otherwise "recibida".\n' +
      'Use numbers for all numeric fields. Decimal separator: dot. Dates: YYYY-MM-DD. Period: YYYY-MM.'
    );
  }

  const def = DOC_TYPES[docType];
  return (
    `You are a Spanish tax document assistant. This document is a "${def.label}". Return ONLY valid JSON — no explanation, no markdown, no backticks.\n\n` +
    `Required format: ${JSON.stringify(def.schema)}\n\n` +
    (docType === 'factura' ? ctx + '\nFor direction: "emitida" if the emisor NIF matches the client NIF above; otherwise "recibida".\n' : '') +
    'Use numbers for all numeric fields. Decimal separator: dot. Dates: YYYY-MM-DD. Period: YYYY-MM.'
  );
}

// Bepaal welke modelo(s) een geëxtraheerd document voedt.
function getModeloSuggestion(data, clientType) {
  const dt = data.docType;
  if (dt === 'factura') {
    const key = 'factura.' + (data.direction === 'emitida' ? 'emitida' : 'recibida');
    const m = MODELO_MAP[key];
    if (!m) return null;
    const modelos = [...m.to];
    if (data.direction === 'emitida') {
      const im = incomeModeloForType(clientType);
      if (im && !modelos.includes(im)) modelos.push(im);
    }
    return { modelos, note: m.note };
  }
  if (dt === 'nomina') {
    const m = MODELO_MAP.nomina;
    return m ? { modelos: m.to, note: m.note } : null;
  }
  if (dt === 'certificado_retenciones') {
    const m = MODELO_MAP.certificado_retenciones;
    return m ? { modelos: m.to, note: m.note } : null;
  }
  if (dt === 'resumen_anual') {
    const key = 'resumen_anual.' + (data.kind || 'otro');
    const m = MODELO_MAP[key] || MODELO_MAP.desconocido;
    return m ? { modelos: m.to || [], note: m.note } : null;
  }
  const m = MODELO_MAP.desconocido;
  return m ? { modelos: [], note: m.note } : null;
}

// Roep de Anthropic API aan (raw fetch, geen SDK).
async function callClaude(key, payload) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && j.error.message) || ('API-fout ' + r.status));
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

const server = http.createServer((req, res) => {

  // App serveren
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(HTML, (e, buf) => {
      if (e) { res.writeHead(500); res.end('index.html niet gevonden — zorg dat het naast server.js staat.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  // logo.png serveren (voor docs/ of projectroot)
  if (req.method === 'GET' && req.url === '/logo.png') {
    const lp = path.join(APP_DIR, 'logo.png');
    fs.readFile(lp, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(buf);
    });
    return;
  }

  // Data lezen (fallback op demo-klanten.json bij verse kloon)
  if (req.method === 'GET' && req.url === '/data') {
    sendJSON(res, readData());
    return;
  }

  // Data opslaan (veilig: eerst .bak, dan tmp -> rename zodat een fout nooit alles wist)
  if (req.method === 'POST' && req.url === '/data') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 25 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const obj = JSON.parse(body);
        try { if (fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA + '.bak'); } catch (_) {}
        const tmp = DATA + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
        fs.renameSync(tmp, DATA);
        sendJSON(res, { ok: true });
      } catch (e) { sendJSON(res, { ok: false, error: String(e) }, 400); }
    });
    return;
  }

  // AI document reader — PDF/afbeelding → gestructureerde JSON + modelo-suggestie
  if (req.method === 'POST' && req.url === '/extract') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 30 * 1024 * 1024) req.destroy(); });
    req.on('end', async () => {
      try {
        const { mime, data, docType = 'auto', clientNif, clientName, clientType } = JSON.parse(body);
        const key = getApiKey();
        if (!key) { sendJSON(res, { ok: false, error: 'NO_KEY' }); return; }
        if (typeof fetch !== 'function') { sendJSON(res, { ok: false, error: 'Node 18+ nodig (fetch ontbreekt). Werk Node bij.' }); return; }

        const isPdf = (mime || '').indexOf('pdf') > -1;
        const block = isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data } };

        const prompt = buildExtractPrompt(docType, clientNif, clientName);
        const payload = {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 900,
          messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }]
        };

        let txt = await callClaude(key, payload);
        txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim();
        const mm = txt.match(/\{[\s\S]*\}/);
        if (mm) txt = mm[0];
        const extracted = JSON.parse(txt);
        const modeloSuggestion = getModeloSuggestion(extracted, clientType || '');
        sendJSON(res, { ok: true, data: extracted, modeloSuggestion });
      } catch (e) { sendJSON(res, { ok: false, error: String(e) }); }
    });
    return;
  }

  // Ask your books — beantwoord een vraag over de gegevens van één klant
  if (req.method === 'POST' && req.url === '/ask') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1024 * 1024) req.destroy(); });
    req.on('end', async () => {
      try {
        const { clientId, question } = JSON.parse(body);
        const key = getApiKey();
        if (!key) { sendJSON(res, { ok: false, error: 'NO_KEY' }); return; }

        const dataObj = readData();
        const client = (dataObj.clients || []).find(c => c.id === clientId);
        if (!client) { sendJSON(res, { ok: false, error: 'Client niet gevonden' }); return; }

        const prompt =
          'You are a bookkeeping assistant. Answer the question below about this client\'s financial data. ' +
          'Base your answer ONLY on the provided data — do not invent or estimate figures. ' +
          'Be concise. Respond in the same language as the question.\n\n' +
          'Client data:\n' + JSON.stringify(client, null, 2) + '\n\nQuestion: ' + question;

        const answer = await callClaude(key, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        });
        sendJSON(res, { ok: true, answer });
      } catch (e) { sendJSON(res, { ok: false, error: String(e) }); }
    });
    return;
  }

  // Deadline-herinnering genereren in NL / ES / EN
  if (req.method === 'POST' && req.url === '/remind') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', async () => {
      try {
        const { clientName, modeloCode, modeloName, period, deadline, language } = JSON.parse(body);
        const key = getApiKey();
        if (!key) { sendJSON(res, { ok: false, error: 'NO_KEY' }); return; }

        const langName = { nl: 'Dutch', es: 'Spanish', en: 'English' }[language] || 'Dutch';
        const prompt =
          `Write a short (3–5 sentences), friendly client reminder in ${langName} about an upcoming Spanish tax filing deadline. ` +
          `Plain text only, no markdown, no bullet points.\n\n` +
          `Details — Client: ${clientName} | Modelo: ${modeloCode} (${modeloName}) | Period: ${period} | Deadline: ${deadline}\n\n` +
          `Ask the client to gather their documents and confirm with their advisor that everything is in order.`;

        const text = await callClaude(key, {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        });
        sendJSON(res, { ok: true, text });
      } catch (e) { sendJSON(res, { ok: false, error: String(e) }); }
    });
    return;
  }

  res.writeHead(404); res.end('Niet gevonden');
});

// Zorg dat de datamap bestaat.
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

// Als de app al draait (poort bezet), gewoon de browser openen en stoppen.
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    try { require('child_process').exec('open http://localhost:' + PORT); } catch (_) {}
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

// Alleen op je eigen machine bereikbaar (127.0.0.1), niet op het netwerk.
server.listen(PORT, '127.0.0.1', () => {
  const dataSource = fs.existsSync(DATA) ? DATA : DEMO_DATA + ' (demo)';
  console.log('\n  ✓ Asesoría NL draait   ->   http://localhost:' + PORT);
  console.log('  Data: ' + dataSource);
  console.log('  AI-sleutel: ' + (getApiKey() ? 'gevonden ✓' : 'niet geconfigureerd (AI-functies uitgeschakeld)'));
  console.log('  Stoppen: Ctrl + C.\n');
  try { require('child_process').exec('open http://localhost:' + PORT); } catch (_) {}
});
