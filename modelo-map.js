/* ============================================================================
   modelo-map.js  —  AI document reader: extraction schemas + modelo mapping
   ----------------------------------------------------------------------------
   THIS FILE IS YOURS TO OWN AND CORRECT.
   The AI only EXTRACTS and SUGGESTS. The tax logic below decides which modelo
   each document type feeds and which fields go where. You are the asesor — the
   mappings below are a STARTING DRAFT. Review every line marked  // VERIFY
   before relying on it. Nothing here files anything; the app pre-fills and
   waits for your confirmation.

   Used by server.js: require('./modelo-map.js')
   ========================================================================== */

/* ---------------------------------------------------------------------------
   1) DOCUMENT TYPES the AI can recognise, and the JSON schema for each.
      Each schema is the exact shape the model must return (strict JSON only).
   --------------------------------------------------------------------------- */
const DOC_TYPES = {

  factura: {
    label: 'Factura / ticket',
    // direction: emitida (issued by the client => income) or recibida (=> expense)
    schema: {
      docType: 'factura',
      direction: 'emitida | recibida',
      date: 'YYYY-MM-DD',
      counterparty: 'string (the OTHER party name)',
      counterpartyNif: 'string',
      desc: 'short description',
      base: 'number (base imponible, excl. IVA)',
      ivaPct: 'number (e.g. 21, 10, 4, 0)',
      ivaAmount: 'number',
      total: 'number (incl. IVA)'
    }
  },

  nomina: {
    label: 'Nómina (payslip)',
    schema: {
      docType: 'nomina',
      period: 'YYYY-MM',
      employer: 'string',
      employerNif: 'string',
      employee: 'string',
      employeeNif: 'string',
      grossSalary: 'number (devengado / bruto)',
      irpfPct: 'number (IRPF retención %)',
      irpfAmount: 'number',
      ssWorker: 'number (Seguridad Social a cargo del trabajador)',
      net: 'number (líquido a percibir)'
    }
  },

  certificado_retenciones: {
    label: 'Certificado de retenciones',
    schema: {
      docType: 'certificado_retenciones',
      fiscalYear: 'number (YYYY)',
      payer: 'string (pagador)',
      payerNif: 'string',
      recipient: 'string (perceptor)',
      recipientNif: 'string',
      incomeTotal: 'number (rendimientos íntegros)',
      retencionesTotal: 'number (retenciones practicadas)'
    }
  },

  resumen_anual: {
    label: 'Resumen anual / yearly statement',
    schema: {
      docType: 'resumen_anual',
      kind: 'iva | irpf_trabajo | irpf_alquiler | otro',  // VERIFY which annual summary
      fiscalYear: 'number (YYYY)',
      totalBase: 'number',
      totalTax: 'number (IVA o retenciones, según kind)'
    }
  },

  desconocido: {
    label: 'Onbekend / unclear',
    schema: {
      docType: 'desconocido',
      note: 'why the type was unclear',
      fieldsFound: 'object with any fields the model could read'
    }
  }
};

/* ---------------------------------------------------------------------------
   2) MODELO MAPPING — which modelo(s) each docType feeds, and how.
      "to" lists modelo codes that exist in your app's MODELOS catalog.
      "note" explains the routing in plain language for the confirm dialog.
      >>> EVERY MAPPING IS A DRAFT. CORRECT THESE YOURSELF. <<<
   --------------------------------------------------------------------------- */
const MODELO_MAP = {

  // Invoice issued by an autónomo/empresa => IVA repercutido + income for IRPF/IS
  'factura.emitida': {
    to: ['303', '390'],          // VERIFY: IVA quarterly + annual summary
    alsoIncome: ['130', '100', '200'], // VERIFY: 130/100 autónomo, 200 empresa — pick by client.type
    note: 'Factura emitida → IVA repercutido (303/390) en de omzet telt mee voor IRPF/IS.'
  },

  // Invoice received => IVA soportado + deductible expense
  'factura.recibida': {
    to: ['303', '390'],          // VERIFY
    note: 'Factura recibida → IVA soportado (303/390) als aftrekbare uitgave.'
  },

  // Payslip the CLIENT pays out as employer => withholding 111 quarterly, 190 annual
  'nomina': {
    to: ['111', '190'],          // VERIFY: only if client is the EMPLOYER
    note: 'Nómina (werkgever) → ingehouden IRPF in 111 (kwartaal) en 190 (jaar).'
  },

  // Certificate of withholdings for a particular => feeds personal income tax
  'certificado_retenciones': {
    to: ['100'],                 // VERIFY: renta; reconcile with 190 on payer side
    note: 'Certificado de retenciones → rendimientos + retenciones voor de Renta (100).'
  },

  // Annual summary — routing depends on "kind"
  'resumen_anual.iva': { to: ['390'], note: 'Jaaroverzicht IVA → 390.' },          // VERIFY
  'resumen_anual.irpf_trabajo': { to: ['190'], note: 'Jaaroverzicht inhoudingen werk → 190.' }, // VERIFY
  'resumen_anual.irpf_alquiler': { to: ['180'], note: 'Jaaroverzicht inhoudingen huur → 180.' }, // VERIFY

  'desconocido': { to: [], note: 'Type onduidelijk — handmatig toewijzen.' }
};

/* ---------------------------------------------------------------------------
   3) Helper: pick the income-side modelo by client type (used for factura.emitida)
      VERIFY this matches your practice.
   --------------------------------------------------------------------------- */
function incomeModeloForType(clientType) {
  if (clientType === 'empresa')  return '200'; // Impuesto Sociedades       // VERIFY
  if (clientType === 'autonomo') return '130'; // IRPF pago fraccionado     // VERIFY
  if (clientType === 'particular') return '100'; // Renta                   // VERIFY
  return null;
}

module.exports = { DOC_TYPES, MODELO_MAP, incomeModeloForType };
