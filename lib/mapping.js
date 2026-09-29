// lib/mapping.js
// Smart column mapping heuristic and unit conversion engine for CSV ingestion

const SAVED_PROFILES = [
  {
    name: 'Tally Inventory Export CSV',
    signature: 'item,party name,quantity,uom,best before',
    mapping: [
      { column: 'item', field: 'ingredient' },
      { column: 'party name', field: 'supplier' },
      { column: 'quantity', field: 'qty' },
      { column: 'uom', field: 'unit' },
      { column: 'best before', field: 'expiry' }
    ]
  },
  {
    name: 'Standard Supplier Inward Sheet',
    signature: 'raw material,vendor,qty (kg),exp date',
    mapping: [
      { column: 'raw material', field: 'ingredient' },
      { column: 'vendor', field: 'supplier' },
      { column: 'qty (kg)', field: 'qty', detectedUnit: 'kg' },
      { column: 'exp date', field: 'expiry' }
    ]
  }
];

function normalizeHeader(h) {
  return (h || '').toString().toLowerCase().trim().replace(/[\s_\-]+/g, ' ');
}

function headerSignature(headers) {
  return headers.map(normalizeHeader).sort().join(',');
}

function detectUnitFromHeader(headerStr) {
  const norm = normalizeHeader(headerStr);
  if (/\b(kg|kgs|kilogram|kilograms)\b/i.test(norm)) return 'kg';
  if (/\b(g|gm|gms|gram|grams)\b/i.test(norm)) return 'g';
  if (/\b(l|ltr|litre|litres|liter|liters)\b/i.test(norm)) return 'L';
  if (/\b(ml|millilitre|milliliter)\b/i.test(norm)) return 'ml';
  if (/\b(ton|tons|tonne|mt)\b/i.test(norm)) return 'ton';
  if (/\b(pcs|piece|pieces|units|bags|pkts|packs)\b/i.test(norm)) return 'units';
  return null;
}

const FIELD_PATTERNS = {
  ingredient: [
    { regex: /^(ingredient|raw material|material|item|item name|product|description|particulars)$/i, score: 98 },
    { regex: /(ingredient|material|item)/i, score: 85 }
  ],
  supplier: [
    { regex: /^(supplier|vendor|party|party name|source|manufacturer|seller)$/i, score: 98 },
    { regex: /(supplier|vendor|party|from)/i, score: 85 }
  ],
  qty: [
    { regex: /^(qty|quantity|weight|net wt|net weight|amount|intake qty|billed qty)$/i, score: 98 },
    { regex: /(qty|quantity|weight|volume|count)/i, score: 88 }
  ],
  unit: [
    { regex: /^(unit|uom|measure|packaging|pkg)$/i, score: 98 },
    { regex: /(unit|uom)/i, score: 80 }
  ],
  expiry: [
    { regex: /^(expiry|expiry date|exp date|exp|best before|use by|valid till|expiration)$/i, score: 98 },
    { regex: /(expiry|exp|use by|best before)/i, score: 85 }
  ]
};

function proposeMapping(headers) {
  const assignedFields = new Set();
  const results = [];

  for (const rawCol of headers) {
    const norm = normalizeHeader(rawCol);
    const detectedUnit = detectUnitFromHeader(norm);

    let bestField = '';
    let bestScore = 0;

    for (const [field, rules] of Object.entries(FIELD_PATTERNS)) {
      if (assignedFields.has(field)) continue;
      for (const rule of rules) {
        if (rule.regex.test(norm)) {
          if (rule.score > bestScore) {
            bestScore = rule.score;
            bestField = field;
          }
        }
      }
    }

    if (bestField) {
      assignedFields.add(bestField);
    }

    results.push({
      column: rawCol,
      field: bestField || '',
      confidence: bestScore || 25,
      detectedUnit
    });
  }

  return results;
}

function findProfile(headers) {
  const sig = headerSignature(headers);
  return SAVED_PROFILES.find(p => headerSignature(p.mapping.map(m => m.column)) === sig || p.signature === sig);
}

function saveProfile(headers, mapping, name) {
  const sig = headerSignature(headers);
  const existingIdx = SAVED_PROFILES.findIndex(p => p.name === name || p.signature === sig);
  const profile = {
    name: name || `Saved Profile (${new Date().toLocaleDateString()})`,
    signature: sig,
    mapping
  };

  if (existingIdx >= 0) {
    SAVED_PROFILES[existingIdx] = profile;
  } else {
    SAVED_PROFILES.push(profile);
  }
  return profile;
}

function getProfiles() {
  return SAVED_PROFILES;
}

function convertUnit(rawQty, rawUnit) {
  const qty = parseFloat(rawQty) || 0;
  const unit = (rawUnit || 'kg').toString().toLowerCase().trim();

  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(unit)) {
    return { qty: +(qty / 1000).toFixed(3), unit: 'kg' };
  }
  if (['ton', 'tons', 'tonne', 'mt'].includes(unit)) {
    return { qty: +(qty * 1000).toFixed(2), unit: 'kg' };
  }
  if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) {
    return { qty: +(qty * 0.453592).toFixed(3), unit: 'kg' };
  }
  if (['ml', 'millilitre', 'milliliter'].includes(unit)) {
    return { qty: +(qty / 1000).toFixed(3), unit: 'L' };
  }
  if (['l', 'ltr', 'litre', 'litres', 'liter'].includes(unit)) {
    return { qty, unit: 'L' };
  }

  return { qty, unit: unit || 'kg' };
}

module.exports = {
  proposeMapping,
  findProfile,
  saveProfile,
  getProfiles,
  convertUnit,
  normalizeHeader
};
