// lib/tally.js
// Standard Tally XML Export Generator for TallyPrime and Tally.ERP 9
// Indian SMEs import data via Gateway of Tally -> Import of Data -> Vouchers

function formatTallyDate(dateStr) {
  // Tally standard date format: YYYYMMDD
  if (!dateStr) return '20260401';
  return dateStr.replace(/[^0-9]/g, '').slice(0, 8);
}

function escapeXml(unsafe) {
  return (unsafe || '').toString().replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function generateReceiptNotesXml(lots, companyName = 'Food Manufacturing Unit') {
  const vouchersXml = lots.map(lot => {
    const vchDate = formatTallyDate(lot.intakeDate || new Date().toISOString().slice(0, 10));
    const expDate = formatTallyDate(lot.expiry);
    const estimatedRate = lot.ingredient.toLowerCase().includes('flour') ? 32 :
                          lot.ingredient.toLowerCase().includes('sugar') ? 42 :
                          lot.ingredient.toLowerCase().includes('oil') ? 110 :
                          lot.ingredient.toLowerCase().includes('butter') ? 420 : 65;
    const amount = (lot.qty * estimatedRate).toFixed(2);

    return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt Note" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${vchDate}</DATE>
            <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(lot.id)}</VOUCHERNUMBER>
            <REFERENCE>${escapeXml(lot.poRef || 'DIRECT-GRN')}</REFERENCE>
            <PARTYLEDGERNAME>${escapeXml(lot.supplier)}</PARTYLEDGERNAME>
            <BASICBASEPARTYNAME>${escapeXml(lot.supplier)}</BASICBASEPARTYNAME>
            <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(lot.ingredient)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <RATE>${estimatedRate.toFixed(2)}/${escapeXml(lot.unit)}</RATE>
              <AMOUNT>-${amount}</AMOUNT>
              <ACTUALQTY> ${lot.qty} ${escapeXml(lot.unit)}</ACTUALQTY>
              <BILLEDQTY> ${lot.qty} ${escapeXml(lot.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Raw Material Warehouse</GODOWNNAME>
                <BATCHNAME>${escapeXml(lot.id)}</BATCHNAME>
                <EXPIRYPERIOD>${expDate}</EXPIRYPERIOD>
                <AMOUNT>-${amount}</AMOUNT>
                <ACTUALQTY> ${lot.qty} ${escapeXml(lot.unit)}</ACTUALQTY>
                <BILLEDQTY> ${lot.qty} ${escapeXml(lot.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function generateStockJournalXml(batches, companyName = 'Food Manufacturing Unit') {
  const vouchersXml = batches.map(batch => {
    const vchDate = formatTallyDate(batch.date || new Date().toISOString().slice(0, 10));

    // Consumption entries (ingredients used)
    const consumptionEntries = (batch.inputs || []).map(inp => `
              <INVENTORYENTRIESOUT.LIST>
                <STOCKITEMNAME>${escapeXml(inp.ingredient)}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <ACTUALQTY> ${inp.qty} ${escapeXml(inp.unit || 'kg')}</ACTUALQTY>
                <BILLEDQTY> ${inp.qty} ${escapeXml(inp.unit || 'kg')}</BILLEDQTY>
                <BATCHALLOCATIONS.LIST>
                  <GODOWNNAME>Raw Material Warehouse</GODOWNNAME>
                  <BATCHNAME>${escapeXml(inp.lotId)}</BATCHNAME>
                  <ACTUALQTY> ${inp.qty} ${escapeXml(inp.unit || 'kg')}</ACTUALQTY>
                  <BILLEDQTY> ${inp.qty} ${escapeXml(inp.unit || 'kg')}</BILLEDQTY>
                </BATCHALLOCATIONS.LIST>
              </INVENTORYENTRIESOUT.LIST>`).join('');

    // Production entry (finished goods created)
    const productionEntry = `
              <INVENTORYENTRIESIN.LIST>
                <STOCKITEMNAME>${escapeXml(batch.product)}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <ACTUALQTY> ${batch.qty} units</ACTUALQTY>
                <BILLEDQTY> ${batch.qty} units</BILLEDQTY>
                <BATCHALLOCATIONS.LIST>
                  <GODOWNNAME>Finished Goods Warehouse</GODOWNNAME>
                  <BATCHNAME>${escapeXml(batch.id)}</BATCHNAME>
                  <ACTUALQTY> ${batch.qty} units</ACTUALQTY>
                  <BILLEDQTY> ${batch.qty} units</BILLEDQTY>
                </BATCHALLOCATIONS.LIST>
              </INVENTORYENTRIESIN.LIST>`;

    return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Manufacturing Journal" ACTION="Create">
            <DATE>${vchDate}</DATE>
            <VOUCHERTYPENAME>Manufacturing Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(batch.id)}</VOUCHERNUMBER>
            <ALLINVENTORYENTRIES.LIST>
              ${consumptionEntries}
              ${productionEntry}
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
  }).join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = {
  generateReceiptNotesXml,
  generateStockJournalXml
};
