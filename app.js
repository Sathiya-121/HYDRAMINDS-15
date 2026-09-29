/**
 * AgriTrace AI - Frontend Application Logic
 * Seed-to-Shelf Batch Genealogy & AI Manufacturing ERP
 */

// Global State
let currentTab = "genealogy";
let networkInstance = null;
let currentBatchId = "BATCH-SAUCE-402";
let cachedStats = null;
let cachedGenealogy = null;
let salesChart = null;

// Initialization
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    loadDashboardStats();
    loadGenealogyGraph(currentBatchId);
    setupEventListeners();
});

// ----------------- NAVIGATION -----------------
function initNavigation() {
    const tabs = document.querySelectorAll(".nav-tab-btn");
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            switchTab(target);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
    });

    document.querySelectorAll(".tab-content").forEach(section => {
        section.classList.toggle("hidden", section.id !== `tab-${tabId}`);
    });

    // Specific tab triggers
    if (tabId === "farm") loadFarmPlots();
    if (tabId === "factory") loadFactoryBatches();
    if (tabId === "packaging") loadPackagingData();
    if (tabId === "sales") loadSalesAndCapacity();
    if (tabId === "genealogy" && networkInstance) {
        setTimeout(() => networkInstance.fit(), 200);
    }
}

// ----------------- STATS -----------------
async function loadDashboardStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        cachedStats = data;

        document.getElementById("stat-hectares").textContent = `${data.farm_coverage_hectares} ha`;
        document.getElementById("stat-tomatoes").textContent = Number(data.total_harvested_tomatoes).toLocaleString();
        document.getElementById("stat-sauce").textContent = `${Number(data.total_sauce_produced_kg).toLocaleString()} kg`;
        document.getElementById("stat-bottles").textContent = Number(data.total_bottles_packaged).toLocaleString();
        document.getElementById("stat-cartons").textContent = Number(data.total_cartons_boxed).toLocaleString();
        document.getElementById("stat-anomalies").textContent = data.anomaly_batches;
    } catch (err) {
        console.error("Failed to load stats:", err);
    }
}

// ----------------- GENEALOGY GRAPH (VIS.JS) -----------------
async function loadGenealogyGraph(queryId) {
    const container = document.getElementById("genealogy-network");
    const loadingEl = document.getElementById("graph-loading");
    if (loadingEl) loadingEl.classList.remove("hidden");

    try {
        const res = await fetch(`/api/genealogy/${encodeURIComponent(queryId)}`);
        const data = await res.json();
        cachedGenealogy = data;
        currentBatchId = data.target_batch_id;

        // Populate Batch Dropdown selector
        const selector = document.getElementById("batch-select");
        if (selector && selector.value !== currentBatchId) {
            selector.value = currentBatchId;
        }

        // Render Vis.js Network
        const visNodes = new vis.DataSet(data.graph.nodes.map(n => ({
            ...n,
            borderWidth: 2,
            shadow: true,
            margin: 12,
            font: { color: "#ffffff", size: 12, face: "Inter, sans-serif" }
        })));

        const visEdges = new vis.DataSet(data.graph.edges.map(e => ({
            ...e,
            arrows: "to",
            color: { color: "#475569", highlight: "#3b82f6" },
            smooth: { type: "cubicBezier", forceDirection: "horizontal" },
            font: { color: "#94a3b8", size: 11, align: "top" }
        })));

        const options = {
            layout: {
                hierarchical: {
                    direction: "LR", // Left to right (Farm -> Factory -> Shelf)
                    sortMethod: "directed",
                    levelSeparation: 260,
                    nodeSpacing: 130
                }
            },
            physics: {
                hierarchicalRepulsion: {
                    nodeDistance: 150
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 100,
                zoomView: true
            }
        };

        if (networkInstance) {
            networkInstance.destroy();
        }

        networkInstance = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);
        networkInstance.on("click", (params) => {
            if (params.nodes.length > 0) {
                const clickedNodeId = params.nodes[0];
                const nodeObj = data.graph.nodes.find(n => n.id === clickedNodeId);
                displayNodeDetails(nodeObj);
            }
        });

        // Default display batch node
        const defaultNode = data.graph.nodes.find(n => n.id === currentBatchId) || data.graph.nodes[0];
        displayNodeDetails(defaultNode);

    } catch (err) {
        console.error("Error loading genealogy:", err);
    } finally {
        if (loadingEl) loadingEl.classList.add("hidden");
    }
}

function displayNodeDetails(node) {
    const titleEl = document.getElementById("node-detail-title");
    const contentEl = document.getElementById("node-detail-content");
    if (!node || !titleEl || !contentEl) return;

    titleEl.textContent = `${node.group.toUpperCase()}: ${node.id}`;
    
    let html = "";
    const d = node.data || {};

    if (node.group === "farm") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <span class="text-xs text-slate-400 block">Cultivation Plot Name</span>
                    <span class="font-semibold text-emerald-400 text-base">${d.name}</span>
                    <span class="text-xs text-slate-300 block mt-1">📍 ${d.location} | Farmer: <b>${d.farmer_name}</b></span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Area: <b class="text-white">${d.area_hectares} ha</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Plants: <b class="text-white">${d.plants_count} plants</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Soil pH: <b class="text-emerald-400">${d.soil_ph}</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Moisture: <b class="text-white">${d.soil_moisture_pct}%</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Sunlight: <b class="text-amber-400">${d.avg_sunlight_hrs} hrs/day</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Nitrogen: <b class="text-white">${d.nitrogen_level_ppm} ppm</b></div>
                </div>
                <div class="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-xs text-emerald-300">
                    🌱 <b>AI Pre-Harvest Status:</b> ${d.status}. Expected yield ~${d.predicted_yield_tons} tons processing tomatoes.
                </div>
            </div>
        `;
    } else if (node.group === "harvest") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <span class="text-xs text-slate-400 block">Harvest Lot ID</span>
                    <span class="font-semibold text-red-400 text-base">${d.id}</span>
                    <span class="text-xs text-slate-300 block mt-1">Harvested on: <b>${d.harvest_date}</b></span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Plucked Count: <b class="text-white">${d.plucked_tomatoes_count.toLocaleString()} pcs</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Total Net Weight: <b class="text-white">${d.harvest_weight_kg.toLocaleString()} kg</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Field Brix: <b class="text-red-400">${d.brix_score}° Bx</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Firmness: <b class="text-white">${d.firmness_score} / 10</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Defect Rate: <b class="text-emerald-400">${d.defect_rate_pct}%</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Transport: <b class="text-white">${d.truck_id}</b></div>
                </div>
                <div class="p-2.5 bg-slate-800/80 rounded border border-slate-700 text-xs text-slate-300">
                    📝 <b>Agronomist Note:</b> "${d.farm_gate_notes}"
                </div>
            </div>
        `;
    } else if (node.group === "intake") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-slate-700">
                    <span class="text-xs text-slate-400 block">Factory Gate Intake QC</span>
                    <span class="font-semibold text-amber-400 text-base">${d.id}</span>
                    <span class="text-xs text-slate-300 block mt-1">Arrival: <b>${d.arrival_time}</b> | ${d.truck_id}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Gross Weight: <b class="text-white">${d.gross_weight_kg} kg</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Net Tomatoes: <b class="text-white">${d.net_weight_kg} kg</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Tested Brix: <b class="text-amber-400">${d.tested_brix}° Bx</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Moisture: <b class="text-white">${d.moisture_pct}%</b></div>
                </div>
                <div class="p-2 bg-slate-800 rounded text-xs text-slate-300">
                    Quality Grade: <b class="text-emerald-400">${d.qc_grade}</b> (QC Officer: ${d.inspector_name})
                </div>
                ${d.rejection_reason ? `<div class="p-2 bg-amber-950/60 border border-amber-700 text-amber-300 rounded text-xs">⚠️ ${d.rejection_reason}</div>` : ''}
            </div>
        `;
    } else if (node.group === "factory") {
        const isAnomaly = d.is_anomaly;
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border ${isAnomaly ? 'border-red-600 bg-red-950/30' : 'border-blue-600'}">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold ${isAnomaly ? 'text-red-400' : 'text-blue-400'} text-base">${d.id}</span>
                        <span class="badge ${isAnomaly ? 'badge-red' : 'badge-green'}">${isAnomaly ? 'ANOMALY DETECTED' : 'PASS SPEC'}</span>
                    </div>
                    <span class="text-xs text-slate-300 block mt-1">Recipe: <b>${d.recipe_name}</b> (${d.kettle_id})</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Raw Tomato In: <b class="text-white">${d.raw_tomatoes_kg} kg</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Sauce Output: <b class="text-white">${d.sauce_output_kg} kg</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Cook Duration: <b class="text-white">${d.cooking_duration_mins} mins</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Moisture Loss: <b class="text-white">${d.moisture_loss_pct}%</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Conversion Yield: <b class="${d.yield_conversion_pct < 35 ? 'text-red-400' : 'text-emerald-400'} font-bold">${d.yield_conversion_pct}%</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Finished Brix: <b class="text-amber-400">${d.finished_brix}° Bx</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Viscosity: <b class="text-white">${d.viscosity_cps} cPs</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Cook Temp: <b class="text-white">${d.cooking_temp_c}°C</b></div>
                </div>
                ${isAnomaly ? `
                    <div class="p-3 bg-red-950/50 border border-red-700 rounded-lg text-xs text-red-300">
                        🚨 <b>Process Root Cause:</b> ${d.anomaly_reason}
                    </div>
                ` : `
                    <div class="p-2.5 bg-blue-950/40 border border-blue-800 rounded-lg text-xs text-blue-300">
                        ✅ Batch meets Kissan 28°Bx thick puree standard with ideal Bostwick spread index.
                    </div>
                `}
            </div>
        `;
    } else if (node.group === "packaging" || node.group === "bottle") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-purple-600">
                    <span class="text-xs text-slate-400 block">Packaging Genealogy Unit</span>
                    <span class="font-semibold text-purple-400 text-base">${node.label.split('\n')[0]}</span>
                    <span class="text-xs text-slate-300 block mt-1">Batch Link: <b>${d.batch_id || currentBatchId}</b></span>
                </div>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between p-2 bg-slate-800/60 rounded">
                        <span class="text-slate-400">Total Filled Bottles (500g):</span>
                        <b class="text-white font-mono">${d.total_bottles ? d.total_bottles.toLocaleString() : '3,040'} units</b>
                    </div>
                    <div class="flex justify-between p-2 bg-slate-800/60 rounded">
                        <span class="text-slate-400">Corrugated Shipping Cartons (24/box):</span>
                        <b class="text-white font-mono">${d.total_cartons || '126'} boxes</b>
                    </div>
                    <div class="flex justify-between p-2 bg-slate-800/60 rounded">
                        <span class="text-slate-400">Distribution Pallets (20 boxes/plt):</span>
                        <b class="text-white font-mono">${d.total_pallets || '6'} pallets</b>
                    </div>
                </div>
                <div class="p-3 bg-purple-950/40 border border-purple-800 rounded-lg text-xs text-purple-200">
                    🔗 <b>Barcoded Lineage Hierarchy:</b><br/>
                    Bottle UID [${d.sample_bottle_uid || 'BOT-402-00142'}] &rarr; Box [${d.sample_carton_id || 'BOX-402-C012'}] &rarr; Pallet [${d.sample_pallet_id || 'PLT-402-P02'}]
                </div>
            </div>
        `;
    } else if (node.group === "dispatch") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-cyan-600">
                    <span class="text-xs text-slate-400 block">Logistics Dispatch Manifest</span>
                    <span class="font-semibold text-cyan-400 text-base">${d.dispatch_id}</span>
                    <span class="text-xs text-slate-300 block mt-1">Truck: <b>${d.truck_number}</b> (${d.carrier_name})</span>
                </div>
                <div class="space-y-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Destination: <b class="text-white">${d.destination_hub}</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">State Region: <b class="text-cyan-400">${d.destination_state}</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Pallets Manifest: <b class="text-white">${(d.pallet_ids || []).join(', ')}</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Cold Chain Sensor Temp: <b class="text-emerald-400">${d.cold_chain_temp_c}°C</b></div>
                </div>
            </div>
        `;
    } else if (node.group === "retail") {
        html = `
            <div class="space-y-3">
                <div class="p-3 bg-slate-800 rounded-lg border border-teal-600">
                    <span class="text-xs text-slate-400 block">Retail POS & Customer Feedback</span>
                    <span class="font-semibold text-teal-400 text-base">${d.store_name}</span>
                    <span class="text-xs text-slate-300 block mt-1">Channel: <b>${d.channel}</b> | 📍 ${d.city}, ${d.region}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="p-2 bg-slate-800/60 rounded">Delivered: <b class="text-white">${d.bottles_delivered} btls</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Sold: <b class="text-teal-400 font-bold">${d.bottles_sold} btls</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Sell-Through: <b class="text-white">${d.sell_through_rate}%</b></div>
                    <div class="p-2 bg-slate-800/60 rounded">Rating: <b class="text-amber-400 font-bold">${d.avg_customer_rating} ⭐</b></div>
                </div>
                <div class="p-2.5 bg-slate-800/90 rounded border border-slate-700 text-xs">
                    💬 <b>Consumer Reviews:</b> "${d.customer_feedback_sample}"
                </div>
                ${d.return_rate_pct > 3.0 ? `
                    <div class="p-2 bg-red-950/60 border border-red-700 text-red-300 rounded text-xs">
                        ⚠️ High return rate (${d.return_rate_pct}%) flagged to factory QA.
                    </div>
                ` : ''}
            </div>
        `;
    }

    contentEl.innerHTML = html;
}

// ----------------- FARM & AI PRE-HARVEST MODULE -----------------
async function loadFarmPlots() {
    try {
        const res = await fetch("/api/plots");
        const plots = await res.json();
        const grid = document.getElementById("plots-grid");
        if (!grid) return;

        grid.innerHTML = plots.map(p => `
            <div class="metric-card cursor-pointer hover:border-emerald-500" onclick="selectPlotForTrace('${p.id}')">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-xs font-mono text-emerald-400">${p.id}</span>
                        <h4 class="font-semibold text-white">${p.name}</h4>
                    </div>
                    <span class="badge ${p.status === 'Harvest Ready' ? 'badge-green' : p.status === 'Harvested' ? 'badge-blue' : 'badge-amber'}">${p.status}</span>
                </div>
                <p class="text-xs text-slate-400 mb-3">📍 ${p.location} &bull; Farmer: ${p.farmer_name}</p>
                <div class="grid grid-cols-3 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <div><span class="text-slate-400 block">Area</span><b>${p.area_hectares} ha</b></div>
                    <div><span class="text-slate-400 block">Plants</span><b>${p.plants_count}</b></div>
                    <div><span class="text-slate-400 block">Soil pH</span><b class="text-emerald-400">${p.soil_ph}</b></div>
                    <div><span class="text-slate-400 block">Moisture</span><b>${p.soil_moisture_pct}%</b></div>
                    <div><span class="text-slate-400 block">Sunlight</span><b>${p.avg_sunlight_hrs}h</b></div>
                    <div><span class="text-slate-400 block">Yield Est.</span><b class="text-white">${p.predicted_yield_tons}t</b></div>
                </div>
                <button class="w-full mt-3 py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs font-medium rounded border border-emerald-500/30 transition">
                    Trace Forward to Retail &rarr;
                </button>
            </div>
        `).join("");
    } catch (err) {
        console.error("Failed to load farm plots:", err);
    }
}

async function runYieldSimulation() {
    const area = parseFloat(document.getElementById("sim-area").value);
    const plants = parseInt(document.getElementById("sim-plants").value);
    const ph = parseFloat(document.getElementById("sim-ph").value);
    const moisture = parseFloat(document.getElementById("sim-moisture").value);
    const sunlight = parseFloat(document.getElementById("sim-sunlight").value);
    const nitrogen = parseFloat(document.getElementById("sim-nitrogen").value);

    // Update label displays
    document.getElementById("lbl-area").textContent = `${area} ha`;
    document.getElementById("lbl-plants").textContent = `${plants} plants`;
    document.getElementById("lbl-ph").textContent = ph.toFixed(1);
    document.getElementById("lbl-moisture").textContent = `${moisture}%`;
    document.getElementById("lbl-sunlight").textContent = `${sunlight} hrs`;
    document.getElementById("lbl-nitrogen").textContent = `${nitrogen} ppm`;

    try {
        const res = await fetch("/api/ai/predict-yield", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                area_hectares: area,
                plants_count: plants,
                soil_ph: ph,
                soil_moisture_pct: moisture,
                avg_sunlight_hrs: sunlight,
                nitrogen_level_ppm: nitrogen
            })
        });
        const pred = await res.json();

        document.getElementById("res-harvest-tons").textContent = `${pred.predicted_harvest_tons} tons`;
        document.getElementById("res-tomato-count").textContent = `${pred.predicted_tomato_count.toLocaleString()} tomatoes`;
        document.getElementById("res-sauce-kg").textContent = `${pred.predicted_sauce_recovery_kg.toLocaleString()} kg sauce`;
        document.getElementById("res-bottles-count").textContent = `${pred.predicted_bottles_500g.toLocaleString()} bottles`;

        const recEl = document.getElementById("res-recommendations");
        if (recEl) {
            recEl.innerHTML = pred.agronomic_recommendations.map(r => `
                <li class="text-xs text-slate-300 flex items-start gap-1.5">
                    <span class="text-emerald-400">&bull;</span> ${r}
                </li>
            `).join("");
        }
    } catch (err) {
        console.error("Simulation error:", err);
    }
}

function selectPlotForTrace(plotId) {
    switchTab("genealogy");
    document.getElementById("trace-query-input").value = plotId;
    loadGenealogyGraph(plotId);
}

// ----------------- FACTORY & ANOMALIES -----------------
async function loadFactoryBatches() {
    try {
        const res = await fetch("/api/batches");
        const batches = await res.json();
        const tbody = document.getElementById("factory-batches-tbody");
        if (!tbody) return;

        tbody.innerHTML = batches.map(b => `
            <tr class="border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer ${b.is_anomaly ? 'bg-red-950/20' : ''}" onclick="loadGenealogyGraph('${b.id}'); switchTab('genealogy');">
                <td class="py-3 px-4 font-mono font-semibold ${b.is_anomaly ? 'text-red-400' : 'text-blue-400'}">${b.id}</td>
                <td class="py-3 px-4 font-mono text-xs text-slate-300">${b.lot_id}</td>
                <td class="py-3 px-4">${b.kettle_id}</td>
                <td class="py-3 px-4 font-mono">${b.raw_tomatoes_kg.toLocaleString()} kg</td>
                <td class="py-3 px-4 font-mono font-bold text-white">${b.sauce_output_kg.toLocaleString()} kg</td>
                <td class="py-3 px-4 font-mono ${b.yield_conversion_pct < 35 ? 'text-red-400 font-bold' : 'text-emerald-400'}">${b.yield_conversion_pct}%</td>
                <td class="py-3 px-4 font-mono">${b.finished_brix}°</td>
                <td class="py-3 px-4">
                    <span class="badge ${b.is_anomaly ? 'badge-red' : 'badge-green'}">
                        ${b.is_anomaly ? '🚨 ANOMALY' : '✅ SPEC OK'}
                    </span>
                </td>
            </tr>
        `).join("");

        // Load AI anomalies list
        const aRes = await fetch("/api/ai/anomalies");
        const anomalies = await aRes.json();
        const anomalyAlertBox = document.getElementById("anomaly-alert-container");
        if (anomalyAlertBox) {
            anomalyAlertBox.innerHTML = anomalies.map(a => `
                <div class="p-4 bg-red-950/30 border border-red-700/60 rounded-xl mb-3">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-red-400 flex items-center gap-2">
                            ⚠️ Factory Anomaly Flagged: <span class="font-mono">${a.batch_id}</span> (${a.kettle_id})
                        </span>
                        <span class="badge badge-red">Loss Score: ${a.anomaly_score}</span>
                    </div>
                    <p class="text-xs text-red-200 mt-1">${a.reason}</p>
                    <div class="mt-2 text-xs text-slate-400 flex gap-4">
                        <span>Cook Time: <b class="text-white">${a.cooking_duration_mins} mins</b></span>
                        <span>Yield Conversion: <b class="text-red-400">${a.yield_conversion_pct}%</b></span>
                        <span>Moisture Loss: <b class="text-white">${a.moisture_loss_pct}%</b></span>
                    </div>
                </div>
            `).join("");
        }
    } catch (err) {
        console.error("Failed to load factory batches:", err);
    }
}

// ----------------- PACKAGING & LOGISTICS -----------------
async function loadPackagingData() {
    try {
        const [pRes, dRes] = await fetchParallel("/api/packaging", "/api/dispatches");
        const packaging = pRes;
        const dispatches = dRes;

        const packContainer = document.getElementById("packaging-cards");
        if (packContainer) {
            packContainer.innerHTML = packaging.map(p => `
                <div class="metric-card">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-xs font-mono text-purple-400">${p.batch_id}</span>
                        <span class="badge badge-purple">${p.bottle_sku}</span>
                    </div>
                    <div class="space-y-2 text-sm my-3">
                        <div class="flex justify-between">
                            <span class="text-slate-400">Bottles (500g):</span>
                            <b class="text-white font-mono">${p.total_bottles.toLocaleString()}</b>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-400">Cartons (24/box):</span>
                            <b class="text-white font-mono">${p.total_cartons}</b>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-400">Pallets (20/plt):</span>
                            <b class="text-white font-mono">${p.total_pallets}</b>
                        </div>
                    </div>
                    <div class="p-2.5 bg-slate-900 rounded text-xs space-y-1 font-mono text-slate-300">
                        <div>🍾 Bottle: <span class="text-purple-300">${p.sample_bottle_uid}</span></div>
                        <div>📦 Carton: <span class="text-purple-300">${p.sample_carton_id}</span></div>
                        <div>🏗️ Pallet: <span class="text-purple-300">${p.sample_pallet_id}</span></div>
                    </div>
                    <button class="w-full mt-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-xs font-medium rounded border border-purple-500/30 transition"
                            onclick="loadGenealogyGraph('${p.sample_bottle_uid}'); switchTab('genealogy');">
                        Trace Bottle QR &rarr;
                    </button>
                </div>
            `).join("");
        }

        const dispTable = document.getElementById("dispatches-tbody");
        if (dispTable) {
            dispTable.innerHTML = dispatches.map(d => `
                <tr class="border-b border-slate-800 hover:bg-slate-800/40">
                    <td class="py-3 px-4 font-mono font-semibold text-cyan-400">${d.dispatch_id}</td>
                    <td class="py-3 px-4 font-mono text-xs text-slate-300">${d.batch_id}</td>
                    <td class="py-3 px-4">${d.destination_hub} (${d.destination_state})</td>
                    <td class="py-3 px-4">${d.carrier_name} (${d.truck_number})</td>
                    <td class="py-3 px-4 font-mono text-emerald-400">${d.cold_chain_temp_c}°C</td>
                    <td class="py-3 px-4"><span class="badge badge-green">${d.status}</span></td>
                </tr>
            `).join("");
        }
    } catch (err) {
        console.error("Failed to load packaging/logistics:", err);
    }
}

// ----------------- SALES & PS-8 CAPACITY OPTIMIZER -----------------
async function loadSalesAndCapacity() {
    try {
        const res = await fetch("/api/retail-performance");
        const retail = await res.json();

        // Render Chart.js Regional Sales
        const ctx = document.getElementById("sales-region-chart");
        if (ctx) {
            const labels = retail.map(r => `${r.city} (${r.channel.split(' ')[0]})`);
            const sellThrough = retail.map(r => r.sell_through_rate);
            const bottlesSold = retail.map(r => r.bottles_sold);

            if (salesChart) salesChart.destroy();
            salesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Bottles Sold',
                            data: bottlesSold,
                            backgroundColor: '#3b82f6',
                            borderRadius: 6,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Sell-Through Rate %',
                            data: sellThrough,
                            type: 'line',
                            borderColor: '#10b981',
                            backgroundColor: '#10b981',
                            borderWidth: 2,
                            pointRadius: 4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
                        y: { position: 'left', grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
                        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { color: '#10b981' } }
                    },
                    plugins: {
                        legend: { labels: { color: '#f8fafc' } }
                    }
                }
            });
        }

        // Retail Table
        const tbody = document.getElementById("retail-tbody");
        if (tbody) {
            tbody.innerHTML = retail.map(r => `
                <tr class="border-b border-slate-800 hover:bg-slate-800/40">
                    <td class="py-3 px-4 font-semibold text-white">${r.store_name}</td>
                    <td class="py-3 px-4"><span class="badge ${r.channel === 'Quick Commerce' ? 'badge-purple' : 'badge-blue'}">${r.channel}</span></td>
                    <td class="py-3 px-4">${r.city}, ${r.region}</td>
                    <td class="py-3 px-4 font-mono text-xs text-slate-300">${r.batch_id}</td>
                    <td class="py-3 px-4 font-mono">${r.bottles_sold} / ${r.bottles_delivered}</td>
                    <td class="py-3 px-4 font-mono font-bold ${r.sell_through_rate > 90 ? 'text-emerald-400' : 'text-amber-400'}">${r.sell_through_rate}%</td>
                    <td class="py-3 px-4 font-bold text-amber-400">${r.avg_customer_rating} ⭐</td>
                </tr>
            `).join("");
        }

        // Run default Capacity Optimization
        runCapacityOptimization();

    } catch (err) {
        console.error("Failed to load sales:", err);
    }
}

async function runCapacityOptimization() {
    const cap = parseInt(document.getElementById("opt-capacity").value);
    const d2c = parseInt(document.getElementById("opt-d2c").value);
    const b2b = parseInt(document.getElementById("opt-b2b").value);

    document.getElementById("lbl-opt-capacity").textContent = `${cap.toLocaleString()} btls`;
    document.getElementById("lbl-opt-d2c").textContent = `${d2c.toLocaleString()} btls`;
    document.getElementById("lbl-opt-b2b").textContent = `${b2b.toLocaleString()} btls`;

    try {
        const res = await fetch("/api/ai/optimize-capacity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                monthly_capacity_bottles: cap,
                d2c_demand: d2c,
                b2b_demand: b2b
            })
        });
        const opt = await res.json();

        document.getElementById("opt-alloc-d2c").textContent = `${opt.allocated_d2c.toLocaleString()} btls`;
        document.getElementById("opt-alloc-b2b").textContent = `${opt.allocated_b2b.toLocaleString()} btls`;
        document.getElementById("opt-profit").textContent = `INR ${Number(opt.total_projected_profit).toLocaleString()}`;
        document.getElementById("opt-fulfillment").textContent = `${opt.fulfillment_rate_pct}%`;
        document.getElementById("opt-summary").textContent = opt.recommendation_summary;

        const mitEl = document.getElementById("opt-mitigations");
        if (mitEl) {
            mitEl.innerHTML = opt.mitigation_actions.map(m => `
                <li class="text-xs text-slate-300 flex items-start gap-1.5">
                    <span class="text-purple-400">&bull;</span> ${m}
                </li>
            `).join("");
        }
    } catch (err) {
        console.error("Capacity optimization error:", err);
    }
}

// ----------------- AI COPILOT CHAT -----------------
async function handleChatSubmit() {
    const input = document.getElementById("chat-query-input");
    const query = input.value.trim();
    if (!query) return;

    appendChatMessage("user", query);
    input.value = "";

    try {
        const res = await fetch("/api/ai/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: query })
        });
        const ans = await res.json();
        appendChatMessage("ai", ans.answer);

        if (ans.highlight_batch_id) {
            loadGenealogyGraph(ans.highlight_batch_id);
        }
    } catch (err) {
        appendChatMessage("ai", "Sorry, an error occurred while processing your query.");
    }
}

function appendChatMessage(sender, text) {
    const container = document.getElementById("chat-messages-container");
    if (!container) return;

    const div = document.createElement("div");
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-3`;
    div.innerHTML = `
        <div class="max-w-xl p-3.5 rounded-xl text-sm ${
            sender === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-md'
        }">
            ${marked.parse ? marked.parse(text) : text.replace(/\n/g, '<br/>')}
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ----------------- 2-MINUTE JUDGE TOUR -----------------
let tourStep = 0;
const tourSteps = [
    {
        title: "Step 1: 100-Hectare Farm & Cultivation (Plot 14)",
        text: "We begin at Plot 14 in Thanjavur (10 ha, 800 tomato plants). Sensors monitor soil pH (6.4), moisture (67.5%), and Brix sweetness. Agronomists pluck Lot #LOT-TOM-8821 (6,400 tomatoes, 3,650 kg).",
        action: () => {
            switchTab("genealogy");
            loadGenealogyGraph("PLOT-TN-14");
        }
    },
    {
        title: "Step 2: Factory Kettle Run #BATCH-SAUCE-402",
        text: "The tomatoes arrive via Truck #TN-45-8821, pass QA at 5.2° Brix, and enter Cooking Kettle K-03 with sugar, spices, and vinegar. 1,520 kg of thick 28° Brix sauce is cooked with a 41.6% conversion yield.",
        action: () => {
            loadGenealogyGraph("BATCH-SAUCE-402");
        }
    },
    {
        title: "Step 3: Multi-Tier Packaging Hierarchy",
        text: "The 1,520 kg sauce is filled into 3,040 bottles (500g glass SKU). These are boxed into 126 cartons (24 bottles/box) and loaded onto 6 shipping pallets. Every bottle carries an individual barcode/QR linked to Plot 14.",
        action: () => {
            displayNodeDetails(cachedGenealogy.graph.nodes.find(n => n.id.startsWith("PACK")));
        }
    },
    {
        title: "Step 4: Dispatch to Retail & Shelf Velocity",
        text: "Pallets ship to Chennai and Bengaluru. At Blinkit Indiranagar, 812 of 840 bottles sell in days (96.7% sell-through rate) with a 4.92⭐ rating!",
        action: () => {
            switchTab("sales");
        }
    },
    {
        title: "Step 5: AI Anomaly Detection in Batch 407",
        text: "What happens when things go wrong? Our Scikit-Learn Isolation Forest instantly flagged Batch 407: a boiler pressure drop stretched cook time to 75 mins, causing 71.4% moisture loss and a severe yield drop to 31.9%.",
        action: () => {
            switchTab("factory");
        }
    },
    {
        title: "Step 6: PS-8 Demand & Capacity Optimizer",
        text: "Finally, under a 50,000 bottle monthly capacity ceiling and 68,000 demand, our optimizer splits output between high-margin Quick-Commerce (₹38 margin) and contracted B2B supermarkets, maximizing profit to INR 13.64 Lakhs while preventing SLA penalties.",
        action: () => {
            switchTab("sales");
            runCapacityOptimization();
        }
    }
];

function startJudgeTour() {
    tourStep = 0;
    showTourStep(tourStep);
    document.getElementById("tour-modal").classList.remove("hidden");
}

function nextTourStep() {
    tourStep++;
    if (tourStep < tourSteps.length) {
        showTourStep(tourStep);
    } else {
        closeTourModal();
    }
}

function prevTourStep() {
    if (tourStep > 0) {
        tourStep--;
        showTourStep(tourStep);
    }
}

function showTourStep(index) {
    const step = tourSteps[index];
    document.getElementById("tour-step-counter").textContent = `Step ${index + 1} of ${tourSteps.length}`;
    document.getElementById("tour-title").textContent = step.title;
    document.getElementById("tour-desc").textContent = step.text;
    step.action();
}

function closeTourModal() {
    document.getElementById("tour-modal").classList.add("hidden");
}

// ----------------- EVENT LISTENERS -----------------
function setupEventListeners() {
    // Trace Search
    const searchBtn = document.getElementById("trace-search-btn");
    const searchInput = document.getElementById("trace-query-input");
    if (searchBtn && searchInput) {
        const doSearch = () => {
            const val = searchInput.value.trim();
            if (val) loadGenealogyGraph(val);
        };
        searchBtn.addEventListener("click", doSearch);
        searchInput.addEventListener("keypress", (e) => { if (e.key === "Enter") doSearch(); });
    }

    // Batch Selector
    const batchSelect = document.getElementById("batch-select");
    if (batchSelect) {
        batchSelect.addEventListener("change", (e) => {
            loadGenealogyGraph(e.target.value);
        });
    }

    // Simulation Sliders
    const simInputs = ["sim-area", "sim-plants", "sim-ph", "sim-moisture", "sim-sunlight", "sim-nitrogen"];
    simInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", runYieldSimulation);
    });

    // Capacity Sliders
    const optInputs = ["opt-capacity", "opt-d2c", "opt-b2b"];
    optInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", runCapacityOptimization);
    });

    // Chat
    const chatBtn = document.getElementById("chat-send-btn");
    const chatInput = document.getElementById("chat-query-input");
    if (chatBtn && chatInput) {
        chatBtn.addEventListener("click", handleChatSubmit);
        chatInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleChatSubmit(); });
    }
}

async function fetchParallel(url1, url2) {
    const [r1, r2] = await Promise.all([fetch(url1), fetch(url2)]);
    return [await r1.json(), await r2.json()];
}
