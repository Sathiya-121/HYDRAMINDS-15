// lib/ledger.js
// Event-sourced stock ledger with FEFO auto-picking and full traceability audit trail

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

    this.seedInitialData();
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
    this.events.push(event);
    return event;
  }

  seedInitialData() {
    const today = new Date();
    const dStr = (offsetDays) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().slice(0, 10);
    };

    // Initial lots
    this.intake({
      ingredient: 'Wheat Flour',
      supplier: 'Sri Mills Ltd',
      qty: 600,
      unit: 'kg',
      expiry: dStr(45), // expiring relatively soon
      source: 'csv',
      confidence: 1.0,
      approver: 'quality-gate',
      poRef: 'PO-8820',
      initialStatus: 'Released'
    });

    this.intake({
      ingredient: 'Wheat Flour',
      supplier: 'Godavari Agro',
      qty: 1200,
      unit: 'kg',
      expiry: dStr(180),
      source: 'csv',
      confidence: 1.0,
      approver: 'quality-gate',
      poRef: 'PO-8822',
      initialStatus: 'Released'
    });

    this.intake({
      ingredient: 'Refined Sugar',
      supplier: 'Annapoorna Sugar Works',
      qty: 450,
      unit: 'kg',
      expiry: dStr(120),
      source: 'photo-vision',
      confidence: 0.94,
      approver: 'intake-supervisor',
      poRef: 'PO-8821',
      initialStatus: 'Released'
    });

    this.intake({
      ingredient: 'Palm Oil',
      supplier: 'Kaveri Refineries',
      qty: 300,
      unit: 'L',
      expiry: dStr(90),
      source: 'scale',
      confidence: 0.95,
      approver: 'scale-terminal-01',
      poRef: 'PO-8823',
      initialStatus: 'Released'
    });

    this.intake({
      ingredient: 'Cocoa Powder',
      supplier: 'Malabar Cocoa Corp',
      qty: 180,
      unit: 'kg',
      expiry: dStr(210),
      source: 'manual',
      confidence: 1.0,
      approver: 'warehouse-lead',
      poRef: 'PO-8825',
      initialStatus: 'Quarantine' // Pending lab COA
    });

    this.intake({
      ingredient: 'Baking Butter',
      supplier: 'Nilgiri Dairy Co-op',
      qty: 250,
      unit: 'kg',
      expiry: dStr(30), // Expiring in 30 days
      source: 'photo-vision',
      confidence: 0.88,
      approver: 'intake-supervisor',
      poRef: 'PO-8826',
      initialStatus: 'Quarantine'
    });

    // Produce an initial batch
    const initialBatch = this.produceBatch({
      product: 'Butter Biscuits',
      qty: 500,
      ingredients: [
        { ingredient: 'Wheat Flour', qty: 150 },
        { ingredient: 'Refined Sugar', qty: 50 }
      ],
      approver: 'shift-incharge-A'
    });

    // QC Pass for the batch
    this.setQc(initialBatch.id, 'Pass', 'chief-qa');

    // Ship part of the batch
    this.ship({
      batchId: initialBatch.id,
      customer: 'Metro Cash & Carry (Salem)',
      qty: 350,
      approver: 'dispatch-manager',
      invoiceNo: 'INV-2026-081'
    });
  }

  intake({ ingredient, supplier, qty, unit = 'kg', expiry, source = 'manual', confidence = 1.0, approver = 'operator', poRef = null, initialStatus = 'Quarantine' }) {
    if (!ingredient || !supplier || !(qty > 0) || !expiry) {
      throw new Error('ingredient, supplier, qty, and expiry are required for intake');
    }

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

    this.recordEvent('LOT_INTAKE', source, confidence, approver, {
      lotId: lot.id,
      ingredient: lot.ingredient,
      supplier: lot.supplier,
      qty: lot.qty,
      unit: lot.unit,
      expiry: lot.expiry,
      status: lot.status,
      poRef: lot.poRef,
    });

    return lot;
  }

  setLotStatus(lotId, status, approver = 'operator', reason = '') {
    const valid = ['Quarantine', 'Released', 'Rejected'];
    if (!valid.includes(status)) throw new Error(`Invalid lot status "${status}". Must be one of: ${valid.join(', ')}`);

    const lot = this.lots.find(l => l.id === lotId);
    if (!lot) throw new Error(`Lot ${lotId} not found`);

    const prev = lot.status;
    lot.status = status;

    this.recordEvent('LOT_STATUS_CHANGE', 'manual', 1.0, approver, {
      lotId,
      prevStatus: prev,
      newStatus: status,
      reason: reason || `Updated by ${approver}`,
    });

    return lot;
  }

  produceBatch({ product, qty, ingredients = [], approver = 'operator' }) {
    if (!product || !(qty > 0)) throw new Error('Product name and valid quantity are required');

    const todayStr = new Date().toISOString().slice(0, 10);
    const allocatedInputs = [];

    // For each ingredient in recipe, execute FEFO allocation
    for (const req of ingredients) {
      let needed = +Number(req.qty).toFixed(3);
      const ingName = req.ingredient;

      // Find available lots: Released, not expired, remainingQty > 0
      const availableLots = this.lots
        .filter(l => l.ingredient.toLowerCase() === ingName.toLowerCase() && l.status === 'Released' && l.remainingQty > 0)
        .sort((a, b) => a.expiry.localeCompare(b.expiry)); // FEFO: oldest expiry first

      const totalAvail = availableLots.reduce((acc, l) => acc + l.remainingQty, 0);
      if (totalAvail < needed) {
        throw new Error(`Insufficient released stock for "${ingName}". Needed ${needed}, but only ${totalAvail.toFixed(2)} available in Released status. Check Quarantine lots.`);
      }

      for (const lot of availableLots) {
        if (needed <= 0.0001) break;
        const take = Math.min(lot.remainingQty, needed);
        lot.remainingQty = +Number(lot.remainingQty - take).toFixed(3);
        needed = +Number(needed - take).toFixed(3);

        allocatedInputs.push({
          lotId: lot.id,
          ingredient: lot.ingredient,
          supplier: lot.supplier,
          qty: +take.toFixed(3),
          unit: lot.unit,
          expiry: lot.expiry,
        });
      }
    }

    const batchId = `BAT-${this.nextBatchSeq++}`;
    const batch = {
      id: batchId,
      product,
      qty: +Number(qty).toFixed(2),
      remainingUnits: +Number(qty).toFixed(2),
      date: todayStr,
      inputs: allocatedInputs,
      qc: 'Pending',
    };

    this.batches.unshift(batch);

    this.recordEvent('BATCH_PRODUCED', 'production-fefo', 1.0, approver, {
      batchId: batch.id,
      product: batch.product,
      qty: batch.qty,
      inputs: allocatedInputs,
    });

    return batch;
  }

  setQc(batchId, qc, approver = 'qc-inspector') {
    const valid = ['Pending', 'Pass', 'Fail'];
    if (!valid.includes(qc)) throw new Error(`Invalid QC status "${qc}"`);

    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    const prev = batch.qc;
    batch.qc = qc;

    this.recordEvent('BATCH_QC', 'manual', 1.0, approver, {
      batchId,
      prevQc: prev,
      newQc: qc,
    });

    return batch;
  }

  ship({ batchId, customer, qty, approver = 'dispatch', invoiceNo = null }) {
    if (!batchId || !customer || !(qty > 0)) throw new Error('batchId, customer, and positive qty required');

    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    if (batch.qc !== 'Pass') {
      throw new Error(`Batch ${batchId} cannot be shipped! QC status is currently "${batch.qc}". Only "Pass" batches are permitted for dispatch.`);
    }

    if (batch.remainingUnits < qty) {
      throw new Error(`Insufficient unshipped units in batch ${batchId}. Available: ${batch.remainingUnits}, Requested: ${qty}`);
    }

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

    this.recordEvent('BATCH_DISPATCH', 'dispatch-gate', 1.0, approver, {
      shipmentId: shipment.id,
      batchId: shipment.batchId,
      customer: shipment.customer,
      qty: shipment.qty,
      invoiceNo: shipment.invoiceNo,
    });

    return shipment;
  }

  trace(id) {
    const cleanId = (id || '').trim().toUpperCase();

    // Check if it matches a Lot
    const lot = this.lots.find(l => l.id.toUpperCase() === cleanId);
    if (lot) {
      // Find all batches that used this lot
      const matchedBatches = this.batches.filter(b => b.inputs.some(inp => inp.lotId.toUpperCase() === cleanId));
      const batchIds = new Set(matchedBatches.map(b => b.id));
      const matchedShipments = this.shipments.filter(s => batchIds.has(s.batchId));

      const relevantEvents = this.events.filter(e => {
        const d = e.data || {};
        return d.lotId === lot.id ||
               batchIds.has(d.batchId) ||
               matchedShipments.some(s => s.id === d.shipmentId);
      });

      return {
        type: 'lot',
        lot,
        batches: matchedBatches,
        shipments: matchedShipments,
        events: relevantEvents,
      };
    }

    // Check if it matches a Batch
    const batch = this.batches.find(b => b.id.toUpperCase() === cleanId);
    if (batch) {
      const lotIds = new Set(batch.inputs.map(i => i.lotId));
      const matchedLots = this.lots.filter(l => lotIds.has(l.id)).map(l => {
        const inputUsage = batch.inputs.find(inp => inp.lotId === l.id);
        return {
          ...l,
          used: inputUsage ? inputUsage.qty : 0,
        };
      });

      const matchedShipments = this.shipments.filter(s => s.batchId === batch.id);

      const relevantEvents = this.events.filter(e => {
        const d = e.data || {};
        return d.batchId === batch.id ||
               lotIds.has(d.lotId) ||
               matchedShipments.some(s => s.id === d.shipmentId);
      });

      return {
        type: 'batch',
        batch,
        lots: matchedLots,
        shipments: matchedShipments,
        events: relevantEvents,
      };
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

// Global singleton instance for node server
module.exports = new StockLedger();
