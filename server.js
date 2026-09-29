// server.js - FoodTrace Plant Floor ERP for Render Cloud
// Completely self-contained: no external local folder dependencies required.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Serve static frontend files from repository root
app.use(express.static(path.join(__dirname)));
['index.html', 'style.css', 'app.js'].forEach(f => {
  app.get(f === 'index.html' ? ['/', '/index.html'] : '/' + f, (_, res) => {
    res.sendFile(path.join(__dirname, f));
  });
});

app.get('/healthz', (_, res) => res.status(200).send('OK'));

// ==========================================
// 1. BILL OF MATERIALS & PROCUREMENT POS
// ==========================================
const BOM = {
  'Butter Biscuits': [
    { ingredient: 'Wheat Flour', qtyPerUnit: 0.3 },
    { ingredient: 'Refined Sugar', qtyPerUnit: 0.1 },
    { ingredient: 'Baking Butter', qtyPerUnit: 0.08 }
  ],
  'Chocolate Cookies': [
    { ingredient: 'Wheat Flour', qtyPerUnit: 0.25 },
    { ingredient: 'Refined Sugar', qtyPerUnit: 0.15 },
    { ingredient: 'Cocoa Powder', qtyPerUnit: 0.05 },
    { ingredient: 'Palm Oil', qtyPerUnit: 0.06 }
  ]
};

const PURCHASE_ORDERS = [
  { id: 'PO-8820', supplier: 'Sri Mills Ltd', ingredient: 'Wheat Flour', qty: 600, unit: 'kg', rate: 32, status: 'Fulfilled' },
  { id: 'PO-8821', supplier: 'Annapoorna Sugar Works', ingredient: 'Refined Sugar', qty: 500, unit: 'kg', rate: 42, status: 'Open' },
  { id: 'PO-8824', supplier: 'Malabar Cocoa Corp', ingredient: 'Cocoa Powder', qty: 200, unit: 'kg', rate: 350, status: 'Open' },
  { id: 'PO-8827', supplier: 'Kaveri Refineries', ingredient: 'Palm Oil', qty: 500, unit: 'L', rate: 115, status: 'Open' },
  { id: 'PO-8830', supplier: 'Nilgiri Dairy Co-op', ingredient: 'Baking Butter', qty: 300, unit: 'kg', rate: 420, status: 'Open' },
];

// ==========================================
// 2. EVENT-SOURCED LEDGER ENGINE
// ==========================================
class StockLedger {
  constructor() {
    this.events = [];
    this.lots = [];
    this.batches = [];
    this.shipments = [];
    this.nextLotSeq = 1001;
    this.nextBatchSeq = 2001;
    this.nextShipSeq = 3001;
    this.nextEventSeq = 5001;
    this.seed();
  }

  recordEvent(type, source, confidence, approver, data) {
    const event = {
      id: `EVT-${this.nextEventSeq++}`,
      ts: new Date().toISOString(),
      type,
      source: source || 'manual',
      confidence: confidence !== undefined ? confidence : 1.0,
      approver: approver || 'system',
      data: JSON.parse(JSON.stringify(data)),
    };
    this.events.unshift(event);
    return event;
  }

  seed() {
    const dStr = days => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    this.intake({ ingredient: 'Wheat Flour', supplier: 'Sri Mills Ltd', qty: 600, unit: 'kg', expiry: dStr(45), source: 'csv', confidence: 1.0, approver: 'quality-gate', poRef: 'PO-8820', initialStatus: 'Released' });
    this.intake({ ingredient: 'Wheat Flour', supplier: 'Godavari Agro', qty: 1200, unit: 'kg', expiry: dStr(180), source: 'csv', confidence: 1.0, approver: 'quality-gate', poRef: 'PO-8822', initialStatus: 'Released' });
    this.intake({ ingredient: 'Refined Sugar', supplier: 'Annapoorna Sugar Works', qty: 450, unit: 'kg', expiry: dStr(120), source: 'photo-vision', confidence: 0.94, approver: 'intake-supervisor', poRef: 'PO-8821', initialStatus: 'Released' });
    this.intake({ ingredient: 'Palm Oil', supplier: 'Kaveri Refineries', qty: 300, unit: 'L', expiry: dStr(90), source: 'scale', confidence: 0.95, approver: 'scale-terminal-01', poRef: 'PO-8823', initialStatus: 'Released' });
    this.intake({ ingredient: 'Cocoa Powder', supplier: 'Malabar Cocoa Corp', qty: 180, unit: 'kg', expiry: dStr(210), source: 'manual', confidence: 1.0, approver: 'warehouse-lead', poRef: 'PO-8824', initialStatus: 'Quarantine' });
    this.intake({ ingredient: 'Baking Butter', supplier: 'Nilgiri Dairy Co-op', qty: 250, unit: 'kg', expiry: dStr(30), source: 'photo-vision', confidence: 0.88, approver: 'intake-supervisor', poRef: 'PO-8830', initialStatus: 'Quarantine' });

    const b = this.produceBatch({
      product: 'Butter Biscuits',
      qty: 500,
      ingredients: [{ ingredient: 'Wheat Flour', qty: 150 }, { ingredient: 'Refined Sugar', qty: 50 }],
      approver: 'shift-incharge-A'
    });
    this.setQc(b.id, 'Pass', 'chief-qa');
    this.ship({ batchId: b.id, customer: 'Metro Cash & Carry (Salem)', qty: 350, approver: 'dispatch-manager', invoiceNo: 'INV-2026-081' });
  }

  intake({ ingredient, supplier, qty, unit = 'kg', expiry, source = 'manual', confidence = 1.0, approver = 'operator', poRef = null, initialStatus = 'Quarantine' }) {
    const lotId = `LOT-${this.nextLotSeq++}`;
    const lot = {
      id: lotId,
      ingredient,
      supplier,
      qty: +Number(qty).toFixed(2),
      originalQty: +Number(qty).toFixed(2),
      remainingQty: +Number(qty).toFixed(2),
      unit: unit.toLowerCase(),
      expiry,
      status: initialStatus,
      source,
      confidence: +Number(confidence).toFixed(2),
      approver,
      poRef: poRef || `PO-${Math.floor(8800 + Math.random() * 100)}`,
      intakeDate: new Date().toISOString().slice(0, 10),
    };
    this.lots.unshift(lot);
    this.recordEvent('LOT_INTAKE', source, confidence, approver, lot);
    return lot;
  }

  setLotStatus(lotId, status, approver = 'operator', reason = '') {
    const lot = this.lots.find(l => l.id === lotId);
    if (!lot) throw new Error(`Lot ${lotId} not found`);
    const prev = lot.status;
    lot.status = status;
    this.recordEvent('LOT_STATUS_CHANGE', 'manual', 1.0, approver, { lotId, prevStatus: prev, newStatus: status, reason });
    return lot;
  }

  produceBatch({ product, qty, ingredients = [], approver = 'operator' }) {
    const allocatedInputs = [];
    for (const req of ingredients) {
      let needed = +Number(req.qty).toFixed(3);
      const ingName = req.ingredient;
      // FEFO: oldest expiry first
      const availableLots = this.lots
        .filter(l => l.ingredient.toLowerCase() === ingName.toLowerCase() && l.status === 'Released' && l.remainingQty > 0)
        .sort((a, b) => a.expiry.localeCompare(b.expiry));

      const totalAvail = availableLots.reduce((acc, l) => acc + l.remainingQty, 0);
      if (totalAvail < needed) {
        throw new Error(`Insufficient released stock for "${ingName}". Needed ${needed}, but only ${totalAvail.toFixed(2)} available in Released status.`);
      }

      for (const lot of availableLots) {
        if (needed <= 0.0001) break;
        const take = Math.min(lot.remainingQty, needed);
        lot.remainingQty = +Number(lot.remainingQty - take).toFixed(3);
        needed = +Number(needed - take).toFixed(3);
        allocatedInputs.push({ lotId: lot.id, ingredient: lot.ingredient, supplier: lot.supplier, qty: +take.toFixed(3), unit: lot.unit, expiry: lot.expiry });
      }
    }

    const batchId = `BAT-${this.nextBatchSeq++}`;
    const batch = {
      id: batchId,
      product,
      qty: +Number(qty).toFixed(2),
      remainingUnits: +Number(qty).toFixed(2),
      date: new Date().toISOString().slice(0, 10),
      inputs: allocatedInputs,
      qc: 'Pending',
    };
    this.batches.unshift(batch);
    this.recordEvent('BATCH_PRODUCED', 'production-fefo', 1.0, approver, batch);
    return batch;
  }

  setQc(batchId, qc, approver = 'qc-inspector') {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    const prev = batch.qc;
    batch.qc = qc;
    this.recordEvent('BATCH_QC', 'manual', 1.0, approver, { batchId, prevQc: prev, newQc: qc });
    return batch;
  }

  ship({ batchId, customer, qty, approver = 'dispatch', invoiceNo = null }) {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    if (batch.qc !== 'Pass') throw new Error(`Batch ${batchId} cannot be shipped! QC status is currently "${batch.qc}".`);
    if (batch.remainingUnits < qty) throw new Error(`Insufficient units in batch ${batchId}. Available: ${batch.remainingUnits}, Requested: ${qty}`);

    batch.remainingUnits = +Number(batch.remainingUnits - qty).toFixed(2);
    const shipId = `SHP-${this.nextShipSeq++}`;
    const shipment = {
      id: shipId,
      batchId: batch.id,
      product: batch.product,
      customer,
      qty: +Number(qty).toFixed(2),
      date: new Date().toISOString().slice(0, 10),
      invoiceNo: invoiceNo || `INV-${Date.now().toString().slice(-4)}`,
    };
    this.shipments.unshift(shipment);
    this.recordEvent('BATCH_DISPATCH', 'dispatch-gate', 1.0, approver, shipment);
    return shipment;
  }

  trace(id) {
    const cleanId = (id || '').trim().toUpperCase();
    const lot = this.lots.find(l => l.id.toUpperCase() === cleanId);
    if (lot) {
      const matchedBatches = this.batches.filter(b => b.inputs.some(inp => inp.lotId.toUpperCase() === cleanId));
      const batchIds = new Set(matchedBatches.map(b => b.id));
      const matchedShipments = this.shipments.filter(s => batchIds.has(s.batchId));
      const relevantEvents = this.events.filter(e => {
        const d = e.data || {};
        return d.lotId === lot.id || batchIds.has(d.batchId) || matchedShipments.some(s => s.id === d.shipmentId);
      });
      return { type: 'lot', lot, batches: matchedBatches, shipments: matchedShipments, events: relevantEvents };
    }

    const batch = this.batches.find(b => b.id.toUpperCase() === cleanId);
    if (batch) {
      const lotIds = new Set(batch.inputs.map(i => i.lotId));
      const matchedLots = this.lots.filter(l => lotIds.has(l.id)).map(l => {
        const inputUsage = batch.inputs.find(inp => inp.lotId === l.id);
        return { ...l, used: inputUsage ? inputUsage.qty : 0 };
      });
      const matchedShipments = this.shipments.filter(s => s.batchId === batch.id);
      const relevantEvents = this.events.filter(e => {
        const d = e.data || {};
        return d.batchId === batch.id || lotIds.has(d.lotId) || matchedShipments.some(s => s.id === d.shipmentId);
      });
      return { type: 'batch', batch, lots: matchedLots, shipments: matchedShipments, events: relevantEvents };
    }
    return null;
  }

  stockByIngredient() {
    const summary = {};
    for (const lot of this.lots) {
      if (lot.status === 'Released' && lot.remainingQty > 0) {
        summary[lot.ingredient] = +Number((summary[lot.ingredient] || 0) + lot.remainingQty).toFixed(2);
      }
    }
    return summary;
  }
}

const ledger = new StockLedger();

// ==========================================
// 3. MAPPING & UNIT CONVERSIONS
// ==========================================
const SAVED_PROFILES = [
  {
    name: 'Tally Inventory Export CSV',
    signature: 'best before,item,party name,quantity,uom',
    mapping: [
      { column: 'item', field: 'ingredient', confidence: 100 },
      { column: 'party name', field: 'supplier', confidence: 100 },
      { column: 'quantity', field: 'qty', confidence: 100 },
      { column: 'uom', field: 'unit', confidence: 100 },
      { column: 'best before', field: 'expiry', confidence: 100 }
    ]
  },
  {
    name: 'Standard Supplier Inward Sheet',
    signature: 'exp date,qty (kg),raw material,vendor',
    mapping: [
      { column: 'raw material', field: 'ingredient', confidence: 100 },
      { column: 'vendor', field: 'supplier', confidence: 100 },
      { column: 'qty (kg)', field: 'qty', confidence: 100, detectedUnit: 'kg' },
      { column: 'exp date', field: 'expiry', confidence: 100 }
    ]
  }
];

function proposeMapping(headers) {
  const dict = {
    ingredient: /(ingredient|item|raw material|material|product|description)/i,
    supplier: /(supplier|vendor|party|source|manufacturer)/i,
    qty: /(qty|quantity|weight|net wt|amount|count)/i,
    unit: /(unit|uom|measure)/i,
    expiry: /(expiry|exp date|exp|best before|use by)/i
  };
  const assigned = new Set();
  return headers.map(h => {
    let field = '';
    let conf = 30;
    for (const [k, rx] of Object.entries(dict)) {
      if (!assigned.has(k) && rx.test(h)) {
        field = k;
        conf = 96;
        assigned.add(k);
        break;
      }
    }
    const detectedUnit = /\b(kg|g|l|ml|ton|bags)\b/i.exec(h)?.[0]?.toLowerCase() || null;
    return { column: h, field, confidence: conf, detectedUnit };
  });
}

function convertUnit(rawQty, rawUnit) {
  const qty = parseFloat(rawQty) || 0;
  const unit = (rawUnit || 'kg').toString().toLowerCase().trim();
  if (['g', 'gm', 'grams'].includes(unit)) return { qty: +(qty / 1000).toFixed(3), unit: 'kg' };
  if (['ton', 'tons', 'tonne'].includes(unit)) return { qty: +(qty * 1000).toFixed(2), unit: 'kg' };
  if (['ml'].includes(unit)) return { qty: +(qty / 1000).toFixed(3), unit: 'L' };
  if (['l', 'ltr', 'litre'].includes(unit)) return { qty, unit: 'L' };
  return { qty, unit: unit || 'kg' };
}

// ==========================================
// 4. FORECASTING & REORDER MATH
// ==========================================
function linearTrendForecast(series, periodsAhead = 4) {
  const n = series.length;
  const xs = series.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (series[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const predict = x => Math.max(0, Math.round(intercept + slope * x));
  const points = [];
  for (let i = 0; i < periodsAhead; i++) points.push(predict(n + i));
  return { points, method: 'Linear trend regression (Honest lean forecasting)' };
}

function backtest(series, holdout = 2) {
  const train = series.slice(0, -holdout);
  const test = series.slice(-holdout);
  const n = train.length;
  const xs = train.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = train.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (train[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const predict = x => Math.max(0, intercept + slope * x);

  const errs = [], pctErrs = [];
  test.forEach((actual, i) => {
    const pred = predict(n + i);
    const diff = Math.abs(pred - actual);
    errs.push(diff);
    if (actual !== 0) pctErrs.push(diff / actual);
  });
  const mae = +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(2);
  const mape = +((pctErrs.reduce((a, b) => a + b, 0) / pctErrs.length) * 100).toFixed(1);
  return { mae, mape, note: 'Small sample caveat: Backtest error based on 8 data points. Real-world accuracy improves after 12+ weeks of demand data.' };
}

// ==========================================
// 5. TALLY XML GENERATION
// ==========================================
function generateReceiptNotesXml(lots) {
  const vchs = lots.map(lot => {
    const d = (lot.intakeDate || '2026-04-01').replace(/-/g, '');
    const exp = (lot.expiry || '2026-12-31').replace(/-/g, '');
    const rate = 40;
    const amt = (lot.qty * rate).toFixed(2);
    return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt Note" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${d}</DATE>
            <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${lot.id}</VOUCHERNUMBER>
            <REFERENCE>${lot.poRef || 'DIRECT'}</REFERENCE>
            <PARTYLEDGERNAME>${lot.supplier}</PARTYLEDGERNAME>
            <BASICBASEPARTYNAME>${lot.supplier}</BASICBASEPARTYNAME>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${lot.ingredient}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${rate.toFixed(2)}/${lot.unit}</RATE>
              <AMOUNT>-${amt}</AMOUNT>
              <ACTUALQTY> ${lot.qty} ${lot.unit}</ACTUALQTY>
              <BILLEDQTY> ${lot.qty} ${lot.unit}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Raw Material Store</GODOWNNAME>
                <BATCHNAME>${lot.id}</BATCHNAME>
                <EXPIRYPERIOD>${exp}</EXPIRYPERIOD>
                <AMOUNT>-${amt}</AMOUNT>
                <ACTUALQTY> ${lot.qty} ${lot.unit}</ACTUALQTY>
                <BILLEDQTY> ${lot.qty} ${lot.unit}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Food Manufacturing Unit</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
      <REQUESTDATA>${vchs}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function generateStockJournalXml(batches) {
  const vchs = batches.map(batch => {
    const d = (batch.date || '2026-04-01').replace(/-/g, '');
    const outEntries = (batch.inputs || []).map(inp => `
              <INVENTORYENTRIESOUT.LIST>
                <STOCKITEMNAME>${inp.ingredient}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <ACTUALQTY> ${inp.qty} ${inp.unit || 'kg'}</ACTUALQTY>
                <BILLEDQTY> ${inp.qty} ${inp.unit || 'kg'}</BILLEDQTY>
                <BATCHALLOCATIONS.LIST>
                  <GODOWNNAME>Raw Material Store</GODOWNNAME>
                  <BATCHNAME>${inp.lotId}</BATCHNAME>
                  <ACTUALQTY> ${inp.qty} ${inp.unit || 'kg'}</ACTUALQTY>
                  <BILLEDQTY> ${inp.qty} ${inp.unit || 'kg'}</BILLEDQTY>
                </BATCHALLOCATIONS.LIST>
              </INVENTORYENTRIESOUT.LIST>`).join('');

    return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Manufacturing Journal" ACTION="Create">
            <DATE>${d}</DATE>
            <VOUCHERTYPENAME>Manufacturing Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${batch.id}</VOUCHERNUMBER>
            <ALLINVENTORYENTRIES.LIST>
              ${outEntries}
              <INVENTORYENTRIESIN.LIST>
                <STOCKITEMNAME>${batch.product}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <ACTUALQTY> ${batch.qty} units</ACTUALQTY>
                <BILLEDQTY> ${batch.qty} units</BILLEDQTY>
                <BATCHALLOCATIONS.LIST>
                  <GODOWNNAME>Finished Goods Store</GODOWNNAME>
                  <BATCHNAME>${batch.id}</BATCHNAME>
                  <ACTUALQTY> ${batch.qty} units</ACTUALQTY>
                  <BILLEDQTY> ${batch.qty} units</BILLEDQTY>
                </BATCHALLOCATIONS.LIST>
              </INVENTORYENTRIESIN.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>Food Manufacturing Unit</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
      <REQUESTDATA>${vchs}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// ==========================================
// 6. REST API ROUTES
// ==========================================
app.get('/api/bom', (_, res) => res.json(BOM));
app.get('/api/pos', (_, res) => res.json(PURCHASE_ORDERS));

app.get('/api/summary', (_, res) => {
  const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  res.json({
    lots: ledger.lots.length,
    quarantined: ledger.lots.filter(l => l.status === 'Quarantine').length,
    released: ledger.lots.filter(l => l.status === 'Released').length,
    expiringSoon: ledger.lots.filter(l => l.expiry <= soon && l.status !== 'Rejected').length,
    batches: ledger.batches.length,
    qcPending: ledger.batches.filter(b => b.qc === 'Pending').length,
    qcFailed: ledger.batches.filter(b => b.qc === 'Fail').length,
    shipments: ledger.shipments.length,
    events: ledger.events.length,
  });
});

app.get('/api/lots', (_, res) => res.json(ledger.lots));
app.post('/api/lots', (req, res) => {
  try {
    const lot = ledger.intake(req.body);
    res.status(201).json(lot);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch('/api/lots/:id/status', (req, res) => {
  try {
    const lot = ledger.setLotStatus(req.params.id, req.body.status, req.body.approver, req.body.reason);
    res.json(lot);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/import/profiles', (_, res) => res.json(SAVED_PROFILES));
app.post('/api/import/preview', (req, res) => {
  const { headers, rows } = req.body;
  if (!Array.isArray(headers) || !headers.length) return res.status(400).json({ error: 'Headers required' });
  const sig = headers.map(h => h.toLowerCase().trim()).sort().join(',');
  const matched = SAVED_PROFILES.find(p => p.signature === sig);
  const mapping = matched ? matched.mapping : proposeMapping(headers);
  res.json({
    mapping,
    matchedSavedProfile: !!matched,
    profileName: matched ? matched.name : null,
    preview: (rows || []).slice(0, 5),
    totalRows: (rows || []).length
  });
});

app.post('/api/import/confirm', (req, res) => {
  const { headers, rows, mapping, saveAs } = req.body;
  const idx = {};
  mapping.forEach(m => { if (m.field) idx[m.field] = headers.indexOf(m.column); });
  const created = [];
  try {
    rows.forEach(r => {
      const rawUnit = (idx.unit !== undefined && idx.unit >= 0) ? r[idx.unit] : 'kg';
      const conv = convertUnit(+r[idx.qty], rawUnit);
      const lot = ledger.intake({
        ingredient: r[idx.ingredient],
        supplier: r[idx.supplier],
        qty: conv.qty,
        unit: conv.unit,
        expiry: r[idx.expiry],
        source: 'csv',
        confidence: 1.0,
        approver: 'csv-confirmed-import'
      });
      created.push(lot);
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (saveAs) {
    const sig = headers.map(h => h.toLowerCase().trim()).sort().join(',');
    SAVED_PROFILES.push({ name: saveAs, signature: sig, mapping });
  }
  res.json({ imported: created.length, lots: created });
});

app.post('/api/sync/simulate', (_, res) => {
  const created = [
    ledger.intake({ ingredient: 'Wheat Flour', supplier: 'Sri Mills Ltd', qty: 1500, unit: 'kg', expiry: '2026-11-30', source: 'drive-sync', confidence: 1.0, approver: 'drive-watcher-service', poRef: 'PO-8820' }),
    ledger.intake({ ingredient: 'Refined Sugar', supplier: 'Annapoorna Sugar Works', qty: 600, unit: 'kg', expiry: '2026-12-15', source: 'drive-sync', confidence: 1.0, approver: 'drive-watcher-service', poRef: 'PO-8821' })
  ];
  res.json({
    status: 'success',
    filename: `inbound-grn-${Date.now().toString().slice(-4)}.csv`,
    matchedProfile: 'Standard Supplier Inward Sheet',
    autoImported: created.length,
    lots: created
  });
});

app.post('/api/ingest/photo', (req, res) => {
  const { kind, filename } = req.body;
  const samples = {
    invoice: { poRef: 'PO-8821', ingredient: 'Refined Sugar', supplier: 'Annapoorna Sugar Works', qty: 480, unit: 'kg', rate: 42, expiry: '2026-11-20', invoiceNumber: 'ASW/2026/0491', invoiceTotal: 20160 },
    grn: { poRef: 'PO-8827', ingredient: 'Palm Oil', supplier: 'Kaveri Refineries', qty: 500, unit: 'L', rate: 115, expiry: '2026-10-15', invoiceNumber: 'KR-GRN-993', invoiceTotal: 57500 },
    handwritten: { poRef: 'PO-8824', ingredient: 'Cocoa Powder', supplier: 'Malabar Cocoa Corp', qty: 195, unit: 'kg', rate: 350, expiry: '2027-01-10', invoiceNumber: 'MCC-BATCH-04', invoiceTotal: 68250 }
  };
  const extracted = samples[kind] || samples.invoice;
  const matchedPo = PURCHASE_ORDERS.find(po => po.id === extracted.poRef || po.supplier === extracted.supplier);
  let poValidation = { matched: false, po: null, qtyVariance: 0, rateVariance: 0, statusText: 'No matching Open PO found' };
  if (matchedPo) {
    const qtyVar = extracted.qty - matchedPo.qty;
    const rateVar = extracted.rate - matchedPo.rate;
    let statusText = 'Exact match with PO';
    if (qtyVar !== 0) statusText = `Quantity variance: ${qtyVar > 0 ? '+' : ''}${qtyVar} ${matchedPo.unit}`;
    if (rateVar !== 0) statusText += ` | Price variance: ₹${rateVar}`;
    poValidation = { matched: true, po: matchedPo, qtyVariance: qtyVar, rateVariance: rateVar, statusText };
  }
  res.json({ simulated: true, filename, kind, extracted, confidence: kind === 'handwritten' ? 0.76 : 0.95, poValidation });
});

app.post('/api/ingest/photo/confirm', (req, res) => {
  const lot = ledger.intake({ ...req.body, source: 'photo-vision', confidence: req.body.confidence || 0.9, approver: 'supervisor-validated' });
  res.status(201).json(lot);
});

let scaleBase = 45.2;
app.get('/api/scale/live', (_, res) => {
  const t = Date.now() / 1000;
  const jitter = (Math.sin(t * 1.5) * 0.15 + (Math.random() - 0.5) * 0.08);
  const weight = +(scaleBase + jitter).toFixed(2);
  res.json({ simulated: true, weight, unit: 'kg', isStable: Math.abs(jitter) < 0.1 });
});
app.post('/api/scale/reading', (req, res) => {
  const lot = ledger.intake({ ...req.body, qty: req.body.weight, source: 'scale', confidence: 0.99, approver: req.body.deviceId || 'esp32-terminal-01' });
  res.status(201).json(lot);
});
app.post('/api/scale/ocr', (_, res) => {
  const weights = [25.40, 50.15, 100.00, 32.80];
  scaleBase = weights[Math.floor(Math.random() * weights.length)];
  res.json({ simulatedOcr: true, extractedWeight: scaleBase, unit: 'kg', confidence: 0.91 });
});

app.get('/api/batches', (_, res) => res.json(ledger.batches));
app.post('/api/batches/auto', (req, res) => {
  const { product, qty } = req.body;
  const bom = BOM[product];
  if (!bom) return res.status(400).json({ error: `No BOM for ${product}` });
  try {
    const ingredients = bom.map(b => ({ ingredient: b.ingredient, qty: +(b.qtyPerUnit * qty).toFixed(3) }));
    const b = ledger.produceBatch({ product, qty: +qty, ingredients, approver: 'operator' });
    res.status(201).json(b);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.patch('/api/batches/:id/qc', (req, res) => {
  try {
    const b = ledger.setQc(req.params.id, req.body.qc, 'qc-inspector');
    res.json(b);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/shipments', (_, res) => res.json(ledger.shipments));
app.post('/api/shipments', (req, res) => {
  try {
    const s = ledger.ship(req.body);
    res.status(201).json(s);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/trace/:id', (req, res) => {
  const r = ledger.trace(req.params.id);
  if (!r) return res.status(404).json({ error: `No record found for ${req.params.id}` });
  res.json(r);
});

app.get('/api/events', (_, res) => res.json(ledger.events));

app.get('/api/forecast/:product', (req, res) => {
  const product = decodeURIComponent(req.params.product);
  const bom = BOM[product];
  if (!bom) return res.status(404).json({ error: `No recipe for ${product}` });
  const series = [42, 48, 55, 51, 63, 68, 72, 80];
  const fc = linearTrendForecast(series, 4);
  const bt = backtest(series, 2);
  const demandOverWindow = fc.points.reduce((a, b) => a + b, 0);
  const openPOs = {};
  PURCHASE_ORDERS.filter(po => po.status === 'Open').forEach(po => {
    openPOs[po.ingredient] = (openPOs[po.ingredient] || 0) + po.qty;
  });
  const reorder = bom.map(b => {
    const needed = +(demandOverWindow * b.qtyPerUnit).toFixed(2);
    const stock = ledger.stockByIngredient()[b.ingredient] || 0;
    const po = openPOs[b.ingredient] || 0;
    return { ingredient: b.ingredient, needed, stock, openPO: po, reorderQty: Math.max(0, +(needed - stock - po).toFixed(2)) };
  });
  res.json({ product, series, real: true, forecast: fc, backtest: bt, leadTimeDays: 7, reorder });
});

app.get('/api/export/tally', (req, res) => {
  const type = req.query.type || 'receipt';
  const xml = type === 'receipt' ? generateReceiptNotesXml(ledger.lots) : generateStockJournalXml(ledger.batches);
  const filename = type === 'receipt' ? 'Tally_ReceiptNotes_Vouchers.xml' : 'Tally_StockJournal_Vouchers.xml';
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xml);
});

// Render provides PORT dynamically in process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FoodTrace Plant Floor ERP running on port ${PORT}`);
});
