/**
 * Restaurant plugin — system integration
 *
 * Loaded eagerly by bootstrapPlugins() at startup (before any tab opens).
 * Registers window.NivtoPOS.integrations.restaurant so that the core
 * Sales History and Reports tabs automatically include restaurant data.
 *
 * Removing the plugins/restaurant folder prevents this file from loading,
 * which means none of the integration hooks fire and no restaurant UI
 * appears anywhere in the core tabs.
 */
(function () {
    window.NivtoPOS = window.NivtoPOS || {};
    window.NivtoPOS.integrations = window.NivtoPOS.integrations || {};

    const inv    = (ch, ...a) => window.api.pluginInvoke(ch, ...a);
    const biz    = (k, d)     => localStorage.getItem(k) || d;
    const fmt    = v          => Number(v || 0).toFixed(2);
    const parseI = raw        => { try { return JSON.parse(raw || '[]'); } catch { return []; } };

    // ── Payment cache (populated by injectSalesRows / injectReportSection) ──
    window._restaurantPayments = window._restaurantPayments || {};

    // ─────────────────────────────────────────────────────────────────────────
    // Print: kitchen order slip (thermal-width ticket)
    // ─────────────────────────────────────────────────────────────────────────
    function printKitchenSlip(order) {
        const bizName = biz('bizName', 'Restaurant');
        const items   = parseI(order.items);
        const rows    = items.map(i =>
            `<tr><td>${i.name || '—'}</td><td style="text-align:right;font-weight:bold;">${i.qty || 1}</td></tr>`
        ).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen Slip #${order.id}</title>
<style>
  body{font-family:'Courier New',monospace;padding:12px;max-width:260px;font-size:12px;}
  h2{text-align:center;margin:0 0 2px;font-size:15px;}
  .sub{text-align:center;font-size:10px;color:#555;margin-bottom:8px;}
  hr{border:none;border-top:1px dashed #888;margin:6px 0;}
  table{width:100%;border-collapse:collapse;}td{padding:3px;}
  .note{background:#fff9c4;padding:5px 6px;margin-top:6px;font-size:11px;border-radius:3px;}
  @media print{body{padding:4px;}}
</style></head><body>
<h2>🍽️ KITCHEN ORDER</h2>
<div class="sub">${bizName}</div><hr>
<div style="font-size:11px;margin-bottom:4px;">
  <strong>#${order.id} — ${order.table_name || '—'}</strong>
  <span style="float:right;">${new Date(order.created_at || '').toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
</div>
<hr>
<table>
  <thead><tr><th style="text-align:left;">Item</th><th style="text-align:right;">Qty</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${order.notes ? `<div class="note">📝 ${order.notes}</div>` : ''}
<hr>
<div style="text-align:center;font-size:10px;color:#888;">Status: ${(order.status || '').toUpperCase()}</div>
</body></html>`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Print: customer bill receipt
    // ─────────────────────────────────────────────────────────────────────────
    function printBillSlip(payment) {
        const bizName  = biz('bizName',        'Restaurant');
        const bizAddr  = biz('bizAddress',     '');
        const bizPhone = biz('bizPhone',       '');
        const logoUrl  = biz('bizLogoUrl',     '');
        const footer1  = biz('receiptFooter1', 'Thank you for dining with us!');
        const footer2  = biz('receiptFooter2', '');
        const logoHtml = logoUrl
            ? `<img src="${logoUrl}" style="max-height:50px;max-width:180px;margin-bottom:6px;">`
            : '';
        const items = parseI(payment.items);
        const rows  = items.map(i =>
            `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.81rem;">
               <span>${i.name} × ${i.qty || 1}</span>
               <span>R ${fmt((i.price || 0) * (i.qty || 1))}</span>
             </div>`
        ).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bill — ${payment.table_name}</title>
<style>
  body{font-family:'Courier New',monospace;padding:1rem;max-width:290px;margin:0 auto;font-size:0.82rem;}
  .sep{border:none;border-top:1px dashed #aaa;margin:0.4rem 0;}
  @media print{body{margin:0;padding:0;}}
</style></head><body>
<div style="text-align:center;border-bottom:2px dashed #555;padding-bottom:0.6rem;margin-bottom:0.5rem;">
  ${logoHtml}
  <div style="font-weight:800;font-size:1.05rem;">${bizName}</div>
  ${bizAddr  ? `<div style="font-size:0.72rem;color:#555;">${bizAddr}</div>`       : ''}
  ${bizPhone ? `<div style="font-size:0.72rem;color:#555;">Tel: ${bizPhone}</div>` : ''}
</div>
<div style="font-size:0.72rem;color:#777;margin-bottom:0.5rem;display:flex;justify-content:space-between;">
  <span>🍽️ ${payment.table_name || 'Table'}</span>
  <span>${new Date(payment.created_at || '').toLocaleString()}</span>
</div>
<hr class="sep">
${rows}
<hr class="sep">
<div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>R ${fmt(payment.subtotal)}</span></div>
${Number(payment.tip) > 0
    ? `<div style="display:flex;justify-content:space-between;color:#888;"><span>Tip:</span><span>R ${fmt(payment.tip)}</span></div>`
    : ''}
<div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem;border-top:2px dashed #555;margin-top:0.4rem;padding-top:0.4rem;">
  <span>TOTAL</span><span>R ${fmt(payment.total)}</span>
</div>
<div style="font-size:0.75rem;color:#777;margin-top:0.3rem;">Paid via: <strong>${(payment.method || '').toUpperCase()}</strong></div>
<div style="text-align:center;border-top:1px dashed #aaa;margin-top:0.7rem;padding-top:0.5rem;font-size:0.72rem;color:#666;line-height:1.6;">
  ${[footer1, footer2].filter(Boolean).map(l => `<div>${l}</div>`).join('')}
</div>
</body></html>`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Print: full payment history report
    // ─────────────────────────────────────────────────────────────────────────
    async function printRestaurantHistory() {
        let payments = [];
        try { payments = await inv('restaurant:get-payments'); } catch (e) { console.warn(e); return; }
        const bizName  = biz('bizName',    'Restaurant');
        const bizAddr  = biz('bizAddress', '');
        const bizPhone = biz('bizPhone',   '');
        const logoUrl  = biz('bizLogoUrl', '');
        const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;margin-bottom:6px;">` : '';
        const totalRev = payments.reduce((s, p) => s + Number(p.total || 0), 0);
        const rows = [...payments].reverse().map(p =>
            `<tr>
               <td>${new Date(p.created_at || '').toLocaleString()}</td>
               <td>${p.table_name}</td>
               <td>${p.method || 'cash'}</td>
               <td style="text-align:right;">R ${fmt(p.subtotal)}</td>
               <td style="text-align:right;">R ${fmt(p.tip)}</td>
               <td style="text-align:right;font-weight:bold;">R ${fmt(p.total)}</td>
             </tr>`
        ).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Restaurant History</title>
<style>
  body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#1e293b;}
  .biz-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:14px;}
  .biz-name{font-size:14px;font-weight:700;}.biz-sub{color:#555;font-size:10px;}
  table{width:100%;border-collapse:collapse;}
  th,td{border:1px solid #dee2e6;padding:4px 8px;}
  th{background:#f1f5f9;}
  tfoot td{font-weight:bold;background:#f8fafc;}
  @media print{body{padding:8px;}}
</style></head><body>
<div class="biz-header">
  <div>${logoHtml}<div class="biz-name">${bizName}</div>
    ${bizAddr  ? `<div class="biz-sub">${bizAddr}</div>`       : ''}
    ${bizPhone ? `<div class="biz-sub">Tel: ${bizPhone}</div>` : ''}
  </div>
  <div style="text-align:right;">
    <div style="font-size:13px;font-weight:700;">🍽️ RESTAURANT PAYMENT HISTORY</div>
    <div class="biz-sub">Printed: ${new Date().toLocaleString()}</div>
  </div>
</div>
<table>
  <thead><tr><th>Date</th><th>Table</th><th>Method</th>
    <th style="text-align:right;">Subtotal</th>
    <th style="text-align:right;">Tip</th>
    <th style="text-align:right;">Total</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5">Total Revenue</td><td style="text-align:right;">R ${totalRev.toFixed(2)}</td></tr></tfoot>
</table>
</body></html>`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sales tab: inject restaurant payment rows into the existing table
    // ─────────────────────────────────────────────────────────────────────────
    async function injectSalesRows(listEl) {
        let payments = [];
        try { payments = await inv('restaurant:get-payments'); } catch { return; }
        if (!payments.length) return;

        // Cache for slip printing
        payments.forEach(p => { window._restaurantPayments[p.id] = p; });

        const tbody = listEl.querySelector('tbody');
        if (!tbody) return;

        // Divider row
        const divTr = document.createElement('tr');
        divTr.innerHTML = `<td colspan="6" style="background:#f0f0ff;color:#6f42c1;font-weight:700;font-size:0.78rem;padding:4px 8px;">🍽️ Restaurant Payments</td>`;
        tbody.appendChild(divTr);

        [...payments].reverse().forEach(p => {
            const items   = parseI(p.items);
            const summary = items.length ? items.map(i => `${i.name}×${i.qty || 1}`).join(', ') : '—';
            const tr      = document.createElement('tr');
            tr.style.background = '#faf9ff';
            tr.innerHTML = `
              <td class="text-muted">R-${p.id}</td>
              <td>${new Date(p.created_at || '').toLocaleString()}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                  title="🍽️ ${p.table_name} — ${summary}">🍽️ ${p.table_name} — ${summary}</td>
              <td><span class="badge" style="background:#6f42c1;color:#fff;">${p.method || 'cash'}</span></td>
              <td class="fw-bold text-success">R ${fmt(p.total)}</td>
              <td>
                <button class="btn btn-sm btn-outline-secondary" data-action="printRestaurantBill"
                    data-id="${p.id}" title="Print Bill Slip">🧾 Slip</button>
              </td>`;
            tbody.appendChild(tr);
        });

        // Add restaurant KPI to the existing KPI row
        const totalRestaurant = payments.reduce((s, p) => s + Number(p.total || 0), 0);
        const kpiRow = listEl.querySelector('.row.g-2.mb-3');
        if (kpiRow) {
            const card = document.createElement('div');
            card.className = 'col-3';
            card.innerHTML = `<div class="report-kpi">
              <div class="report-kpi-value" style="color:#6f42c1;font-size:0.9rem;">R ${fmt(totalRestaurant)}</div>
              <div class="report-kpi-label">🍽️ Restaurant</div>
            </div>`;
            kpiRow.appendChild(card);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reports tab: append restaurant revenue card to Sales section
    // ─────────────────────────────────────────────────────────────────────────
    async function injectReportSection(section, contentEl) {
        if (section !== 'sales') return;
        let payments = [];
        try { payments = await inv('restaurant:get-payments'); } catch { return; }
        if (!payments.length) return;

        payments.forEach(p => { window._restaurantPayments[p.id] = p; });

        const totalRev  = payments.reduce((s, p) => s + Number(p.total || 0), 0);
        const totalTips = payments.reduce((s, p) => s + Number(p.tip   || 0), 0);
        const byTable   = {};
        payments.forEach(p => { byTable[p.table_name] = (byTable[p.table_name] || 0) + Number(p.total || 0); });
        const topTable = Object.entries(byTable).sort((a, b) => b[1] - a[1])[0];

        const card = document.createElement('div');
        card.className = 'report-section-card mt-3';
        card.innerHTML = `
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="report-section-title mb-0">🍽️ Restaurant Revenue</div>
            <button class="btn btn-sm btn-outline-secondary" data-action="printRestaurantHistory">🖨 Print History</button>
          </div>
          <div class="row g-2 mb-3">
            <div class="col-3"><div class="report-kpi">
              <div class="report-kpi-value" style="color:#6f42c1;">${payments.length}</div>
              <div class="report-kpi-label">Payments</div>
            </div></div>
            <div class="col-3"><div class="report-kpi">
              <div class="report-kpi-value" style="color:#198754;font-size:0.9rem;">R ${fmt(totalRev)}</div>
              <div class="report-kpi-label">Revenue</div>
            </div></div>
            <div class="col-3"><div class="report-kpi">
              <div class="report-kpi-value" style="color:#fd7e14;font-size:0.9rem;">R ${fmt(totalTips)}</div>
              <div class="report-kpi-label">Tips</div>
            </div></div>
            <div class="col-3"><div class="report-kpi">
              <div class="report-kpi-value" style="color:#0d6efd;font-size:0.82rem;">${topTable ? topTable[0] : '—'}</div>
              <div class="report-kpi-label">Top Table</div>
            </div></div>
          </div>
          <div style="max-height:300px;overflow-y:auto;">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr><th>Date</th><th>Table</th><th>Method</th><th>Subtotal</th><th>Tip</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              ${[...payments].reverse().slice(0, 12).map(p => `<tr>
                <td style="font-size:0.78rem;">${new Date(p.created_at || '').toLocaleString()}</td>
                <td>${p.table_name}</td>
                <td><span class="badge" style="background:#6f42c1;color:#fff;">${p.method || 'cash'}</span></td>
                <td>R ${fmt(p.subtotal)}</td>
                <td>R ${fmt(p.tip)}</td>
                <td class="fw-bold text-success">R ${fmt(p.total)}</td>
                <td><button class="btn btn-sm btn-outline-secondary py-0 px-1"
                    data-action="printRestaurantBill" data-id="${p.id}" title="Print slip">🧾</button></td>
              </tr>`).join('')}
              ${payments.length > 12
                ? `<tr><td colspan="7" class="text-center text-muted small">+${payments.length - 12} more</td></tr>`
                : ''}
            </tbody>
          </table></div>`;
        contentEl.appendChild(card);
    }

    async function getPayments() {
        try { return await inv('restaurant:get-payments'); } catch { return []; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Audit Ledger: supply restaurant payment entries to the core Audit tab
    // ─────────────────────────────────────────────────────────────────────────
    async function getAuditEntries(fromDate, toDate) {
        let payments = [];
        try { payments = await inv('restaurant:get-payments'); } catch { return []; }
        payments.forEach(p => { window._restaurantPayments[p.id] = p; });
        let entries = payments.map(p => ({
            date:        p.created_at || '',
            dateSort:    p.created_at ? p.created_at.split('T')[0] : '',
            type:        'Restaurant',
            ref:         `RST-${p.id}`,
            description: `Restaurant — ${p.table_name} · ${p.method || 'cash'}`,
            debit:       0,
            credit:      Number(p.total || 0),
            tax:         0,
            discount:    0,
            badge:       'text-white',
            badgeStyle:  'background:#6f42c1;'
        }));
        if (fromDate) entries = entries.filter(e => e.dateSort >= fromDate);
        if (toDate)   entries = entries.filter(e => e.dateSort <= toDate);
        return entries;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dashboard: inject restaurant KPI card + activity panel
    // ─────────────────────────────────────────────────────────────────────────
    async function injectDashboard(kpiRowEl, dashboardEl, todayStr) {
        let payments = [];
        try { payments = await inv('restaurant:get-payments'); } catch { return; }
        if (!payments.length) return;
        payments.forEach(p => { window._restaurantPayments[p.id] = p; });

        const todayPayments = payments.filter(p => p.created_at && p.created_at.startsWith(todayStr));
        const todayRevenue  = todayPayments.reduce((s, p) => s + Number(p.total || 0), 0);
        const allRevenue    = payments.reduce((s, p) => s + Number(p.total || 0), 0);

        // ── Activity panel ────────────────────────────────────────────────────
        if (dashboardEl) {
            const recent = [...payments].reverse().slice(0, 5);
            const panelRow = document.createElement('div');
            panelRow.className = 'row g-3 mt-0';
            panelRow.id = 'dashRestaurantRow';
            panelRow.innerHTML = `<div class="col-12">
                <div class="dash-section-card">
                    <div class="dash-section-title" style="display:flex;justify-content:space-between;align-items:center;">
                        <span>🍽️ Restaurant Activity</span>
                        <span class="badge text-white" style="background:#6f42c1;font-size:0.68rem;font-weight:500;">
                            Today: R ${fmt(todayRevenue)} &nbsp;|&nbsp; All-time: R ${fmt(allRevenue)}
                        </span>
                    </div>
                    <div id="dashRestaurantActivity">
                        ${recent.length === 0
                            ? '<div class="dash-empty">No restaurant payments yet.</div>'
                            : recent.map(p => `<div class="dash-list-item">
                                <div>
                                    <span class="badge text-white" style="background:#6f42c1;font-size:0.62rem;">${p.method || 'cash'}</span>
                                    <strong class="ms-1">${p.table_name}</strong>
                                    <small class="ms-2 text-muted">${new Date(p.created_at || '').toLocaleString()}</small>
                                </div>
                                <strong style="color:#6f42c1;">R ${fmt(p.total)}</strong>
                            </div>`).join('')
                        }
                    </div>
                </div>
            </div>`;
            dashboardEl.appendChild(panelRow);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Register all hooks
    // ─────────────────────────────────────────────────────────────────────────
    window.NivtoPOS.integrations.restaurant = {
        getPayments,
        injectSalesRows,
        injectReportSection,
        printKitchenSlip,
        printBillSlip,
        printRestaurantHistory,
        getAuditEntries,
        injectDashboard,
    };

    console.log('[restaurant] Integration hooks registered.');
})();
