# FoodTrace — "The ERP That Fills Itself"

> **Plant Floor ERP & Event-Sourced Traceability Record for Food Manufacturers & SMEs**

FoodTrace automates plant-floor ingestion, enforces FEFO (First-Expiry-First-Out) recipe picking, provides instant forward & backward recall tracing, and integrates natively with Tally for accounting.

---

## 🚀 The Core Pitch

Traditional ERPs fail on SME manufacturing floors because operators don't want to type in 20 fields per lot. **FoodTrace fills itself** across five ingestion routes ordered by ROI:

1. **Excel / CSV Auto-Mapping:** LLM / semantic heuristic matches columns and units (`Qty (kg)` &rarr; quantity). The operator confirms once; the profile is remembered for future imports.
2. **Watched Folder / Cloud Drive Sync:** Automatic directory polling (`/inbound/`) that ingests supplier spreadsheets matching saved profiles without human intervention.
3. **Photos of Invoices, GRNs & Batch Sheets:** Vision extraction returns JSON and validates supplier, quantity, and rate against Open Purchase Orders (PO 3-Way Match).
4. **Weighing Scale Integration & OCR:**
   - **Real hardware path:** Scale (RS232/Bluetooth) &rarr; ESP32 &rarr; HTTP/MQTT &rarr; Ledger.
   - **Scale Simulator:** Explicitly simulated digital 7-segment display with live weight stream and tare controls.
   - **Scale Display OCR Fallback:** Take a picture of the physical scale display when no serial cable is available.
5. **Tally XML Export:** One-click export of Inward Receipt Notes and Manufacturing Stock Journals in standard TallyPrime / Tally.ERP 9 `<ENVELOPE>` XML format.

---

## ⚙️ Core Architecture (Lean Event-Sourced Design)

- **Immutable Stock Ledger:** Every intake, release, recipe consumption, and dispatch is logged as an immutable event with **Source**, **Confidence %**, and **Approver**.
- **Quarantine Gate:** New stock enters in `Quarantine`. Only QA-released lots can be consumed in production.
- **FEFO (First-Expiry-First-Out) Auto-Pick:** Recipes automatically allocate lots with the closest expiry date to prevent factory spoilage.
- **Instant Recall Graph:** Enter a Lot ID or scan a barcode/QR sticker to immediately see:
  - Which production batches consumed the lot.
  - Which customers received the finished goods for targeted recall notices.
- **Demand Forecasting & BOM Reorder:** Linear regression demand forecast feeds reorder calculation:
  $$\text{Suggested Reorder} = (\text{Forecast Demand} \times \text{BOM Ratio}) - \text{Released Stock} - \text{Open POs}$$
  *Includes transparent backtest error reporting (MAE and MAPE).*

---

## 🌐 Dual-Engine Architecture (GitHub Pages Ready!)

FoodTrace is engineered with a **Dual-Engine**:
1. **GitHub Pages (Static Mode):** Works 100% out-of-the-box in the browser with an in-browser event-sourced ledger, `localStorage` persistence, and client-side Tally XML generation. No backend required!
2. **Node.js / Express Server Mode:** Deployable to Render, Railway, Fly.io, or Heroku with full REST API endpoints.

---

## 🛠️ How to Run Locally

### Option A: Quick Static Preview (via Python)
Since Python is installed on your system:
```bash
cd "C:\Users\Sathiya narayanan\.gemini\antigravity-ide\scratch\foodtrace-erp"
python -m http.server 3000
```
Open your browser to: **http://localhost:3000**

### Option B: Node.js Backend Server
If you have Node.js:
```bash
npm install
npm start
```
Server runs on **http://localhost:3000** with REST API endpoints at `/api/*`.

---

## 🚢 Deploying to GitHub & GitHub Pages

1. Initialize git and commit:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: FoodTrace plant floor ERP"
   ```
2. Create a repository on GitHub (e.g. `foodtrace-erp`) and push:
   ```bash
   git remote add origin https://github.com/<your-username>/foodtrace-erp.git
   git branch -M main
   git push -u origin main
   ```
3. Enable GitHub Pages:
   - Go to your repository **Settings** &rarr; **Pages**.
   - Under **Build and deployment**, select **Deploy from a branch**.
   - Select `main` branch and `/ (root)` folder.
   - Click **Save**.
4. Your live app will be published at: `https://<your-username>.github.io/foodtrace-erp/`

---

## 📋 File Structure

```
foodtrace-erp/
├── index.html            # Main responsive plant floor UI
├── style.css             # Industrial high-tech dark slate design system
├── app.js                # Dual-engine controller, QR generator & client ledger
├── server.js             # Express API backend with PO validation & scale endpoints
├── package.json          # Node dependencies (Express)
├── README.md             # Documentation
└── lib/
    ├── ledger.js         # Event-sourced stock ledger & FEFO picking engine
    ├── mapping.js        # Column mapping heuristic & unit conversion
    ├── forecast.js       # Demand forecasting & honest backtesting (MAE/MAPE)
    └── tally.js          # Standard Tally Prime & Tally ERP 9 XML generator
```
