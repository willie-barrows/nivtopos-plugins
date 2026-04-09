/**
 * Restaurant plugin – renderer-side logic.
 * Runs inside an isolated scope injected by the plugin runtime.
 * All DOM IDs are prefixed with "r-" or "r" to avoid collisions.
 * Communicates with the main process via window.api.pluginInvoke(channel, ...args).
 */
(function () {
    const api = window.api;
    let _tables     = [];
    let _orders     = [];
    let _allOrders  = [];
    let _payments   = [];
    let _menuItems  = [];
    let _sideDishes = [];
    let _rSubTab = 'tables';
    let _currentActionTable = null;
    let _currentBill = null;

    // ── Bootstrap ──────────────────────────────────────────────────────────
    async function loadRestaurant() {
        [_tables, _orders, _menuItems, _sideDishes] = await Promise.all([
            api.pluginInvoke('restaurant:get-tables'),
            api.pluginInvoke('restaurant:get-active-orders'),
            api.pluginInvoke('restaurant:get-menu-items'),
            api.pluginInvoke('restaurant:get-side-dishes')
        ]);
        renderTables();
        renderKitchen();
        updateMenuDatalist();
    }

    // ── Sub-tab switching ──────────────────────────────────────────────────
    function switchRSubTab(tab) {
        _rSubTab = tab;
        document.querySelectorAll('#restaurantSubTabs .nav-link').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-r-subtab') === tab);
        });
        document.getElementById('r-panel-tables')    .style.display = tab === 'tables'     ? '' : 'none';
        document.getElementById('r-panel-kitchen')   .style.display = tab === 'kitchen'    ? '' : 'none';
        document.getElementById('r-panel-history')   .style.display = tab === 'history'    ? '' : 'none';
        document.getElementById('r-panel-menu')      .style.display = tab === 'menu'       ? '' : 'none';
        document.getElementById('r-panel-sidedishes').style.display = tab === 'sidedishes' ? '' : 'none';
        document.getElementById('r-panel-payments')  .style.display = tab === 'payments'   ? '' : 'none';
        if (tab === 'history')    loadHistory();
        if (tab === 'menu')       renderMenuItems();
        if (tab === 'sidedishes') renderSideDishes();
        if (tab === 'payments')   loadPayments();
    }

    // ── Tables grid ────────────────────────────────────────────────────────
    function renderTables() {
        const grid = document.getElementById('r-tables-grid');
        if (!grid) return;
        grid.innerHTML = _tables.map(t => {
            const orderCount  = t.orderCount || 0;
            const isOccupied  = t.status === 'occupied' || orderCount > 0;
            const paymentDue  = isOccupied && orderCount === 0;  // all served, awaiting payment
            const bgColor     = paymentDue ? '#fee2e2' : isOccupied ? '#fff3cd' : t.status === 'reserved' ? '#f5eeff' : '#d1fae5';
            const borderColor = paymentDue ? '#dc3545' : isOccupied ? '#e9a800' : t.status === 'reserved' ? '#8e44ad' : '#198754';
            const statusLabel = paymentDue  ? '&#x1F4B3; Payment Due'
                              : isOccupied  ? '&#x1F534; Occupied'
                              : t.status === 'reserved' ? '&#x1F7E1; Reserved'
                              : '&#x2705; Available';
            const orderBadge  = orderCount > 0
                ? `<div style="font-size:0.68rem;color:#996600;margin-top:2px;">${orderCount} active order${orderCount > 1 ? 's' : ''}</div>`
                : '';
            return `<div class="col-6 col-md-3">
                <div class="card text-center" style="cursor:pointer;background:${bgColor};border:2px solid ${borderColor};box-shadow:0 2px 6px rgba(0,0,0,0.09);"
                     data-r-action="tableCard" data-id="${t.id}" data-status="${t.status}" data-order-count="${orderCount}">
                    <div class="card-body py-3 px-2">
                        <div class="fw-bold" style="font-size:1rem;">${t.name}</div>
                        <div class="text-muted" style="font-size:0.78rem;">${t.seats} seats</div>
                        <div style="font-size:0.74rem;margin-top:4px;">${statusLabel}</div>
                        ${orderBadge}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // ── Kitchen board ──────────────────────────────────────────────────────
    function renderKitchen() {
        const board = document.getElementById('r-kitchen-board');
        if (!board) return;
        const statusCols = [
            { key:'pending',   label:'🟠 Pending',   bg:'#fff7ed' },
            { key:'preparing', label:'🔵 Preparing', bg:'#eff6ff' },
            { key:'ready',     label:'🟢 Ready',     bg:'#f0fdf4' }
        ];
        board.innerHTML = statusCols.map(col => {
            const colOrders = _orders.filter(o => o.status === col.key);
            const cards = colOrders.length ? colOrders.map(o => {
                const items = safeParseItems(o.items);
                const time  = new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
                return `<div class="card mb-2" style="font-size:0.82rem;">
                    <div class="card-body py-2 px-3">
                        <div class="d-flex justify-content-between">
                            <strong>${o.table_name || 'No table'}</strong>
                            <span class="text-muted">${time}</span>
                        </div>
                        <ul class="mb-1 ps-3" style="margin-top:4px;">
                            ${items.map(i => `<li>${i.qty}× ${i.name}</li>`).join('')}
                        </ul>
                        ${o.notes ? `<div class="text-muted" style="font-size:0.75rem;">📝 ${o.notes}</div>` : ''}
                        <div class="d-flex gap-1 mt-2">
                            <button class="btn btn-xs btn-sm btn-outline-primary py-0 px-2"
                                data-r-action="advanceOrder" data-id="${o.id}">Advance ›</button>
                            <button class="btn btn-xs btn-sm btn-outline-secondary py-0 px-2"
                                data-r-action="editOrder" data-id="${o.id}">Edit</button>
                            <button class="btn btn-xs btn-sm btn-outline-danger py-0 px-2"
                                data-r-action="deleteOrder" data-id="${o.id}">✕</button>
                        </div>
                    </div>
                </div>`;
            }).join('') : `<p class="text-muted small">No orders</p>`;
            return `<div class="col-4">
                <div class="p-2 rounded" style="background:${col.bg};min-height:120px;">
                    <div class="fw-semibold mb-2" style="font-size:0.85rem;">${col.label}</div>
                    ${cards}
                </div>
            </div>`;
        }).join('');
    }

    // ── History ────────────────────────────────────────────────────────────
    async function loadHistory() {
        const all = await api.pluginInvoke('restaurant:get-orders');
        _allOrders = all;  // cache for slip printing
        const el = document.getElementById('r-history-table');
        if (!el) return;
        if (!all.length) { el.innerHTML = '<p class="text-muted">No orders yet.</p>'; return; }
        const badge = s => {
            const m = {pending:'warning text-dark',preparing:'primary',ready:'success',served:'secondary'};
            return `<span class="badge bg-${m[s]||'secondary'}">${s}</span>`;
        };
        el.innerHTML = `<table class="table table-sm table-bordered table-hover">
            <thead class="table-light">
                <tr><th>#</th><th>Table</th><th>Items</th><th>Status</th><th>Notes</th><th>Created</th><th></th></tr>
            </thead><tbody>
            ${all.map(o => {
                const items = safeParseItems(o.items);
                return `<tr>
                    <td class="text-muted small">${o.id}</td>
                    <td>${o.table_name||'—'}</td>
                    <td>${items.map(i=>`${i.qty}× ${i.name}`).join(', ')}</td>
                    <td>${badge(o.status)}</td>
                    <td class="text-muted small">${o.notes||''}</td>
                    <td class="text-muted small" style="white-space:nowrap">${new Date(o.created_at).toLocaleString()}</td>
                    <td class="text-nowrap">
                        <button class="btn btn-xs btn-sm btn-outline-info py-0 px-1 me-1" data-r-action="rPrintOrderSlip" data-id="${o.id}" title="Kitchen Slip">🗈</button>
                        <button class="btn btn-xs btn-sm btn-outline-danger py-0 px-1" data-r-action="deleteOrder" data-id="${o.id}">✕</button>
                    </td>
                </tr>`;
            }).join('')}
            </tbody></table>`;
    }

    // ── Menu Items ─────────────────────────────────────────────────────────
    function renderMenuItems() {
        const el = document.getElementById('r-menu-list');
        if (!el) return;
        if (!_menuItems.length) {
            el.innerHTML = '<p class="text-muted small">No menu items yet. Click "+ Add Item" to get started.</p>';
            return;
        }
        const cats = [...new Set(_menuItems.map(i => i.category || 'Uncategorised'))];
        el.innerHTML = cats.map(cat => {
            const items = _menuItems.filter(i => (i.category || 'Uncategorised') === cat);
            return `<div class="mb-3">
                <div class="fw-semibold text-muted mb-1" style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;">${cat}</div>
                <table class="table table-sm table-bordered mb-0">
                    <thead class="table-light"><tr><th>Name</th><th>Price</th><th>Description</th><th></th></tr></thead>
                    <tbody>
                    ${items.map(i => `<tr>
                        <td>${i.name}</td>
                        <td>R ${parseFloat(i.price || 0).toFixed(2)}</td>
                        <td class="text-muted small">${i.description || ''}</td>
                        <td class="text-nowrap">
                            <button class="btn btn-xs btn-sm btn-outline-secondary py-0 px-1 me-1"
                                data-r-action="editMenuItem" data-id="${i.id}">Edit</button>
                            <button class="btn btn-xs btn-sm btn-outline-danger py-0 px-1"
                                data-r-action="rDeleteMenuItem" data-id="${i.id}">✕</button>
                        </td>
                    </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        }).join('');
        updateMenuDatalist();
    }

    function updateMenuDatalist() {
        let dl = document.getElementById('rMenuDatalist');
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = 'rMenuDatalist';
            document.getElementById('plugin-tab-restaurant').appendChild(dl);
        }
        dl.innerHTML = _menuItems.map(i => `<option value="${i.name}"></option>`).join('');
    }

    // ── Side Dishes ────────────────────────────────────────────────────────
    function renderSideDishes() {
        const el = document.getElementById('r-sidedishes-list');
        if (!el) return;
        if (!_sideDishes.length) {
            el.innerHTML = '<p class="text-muted small">No side dishes yet. Click "+ Add Side Dish" to get started.</p>';
            return;
        }
        el.innerHTML = `<table class="table table-sm table-bordered">
            <thead class="table-light"><tr><th>Name</th><th>Price</th><th>Description</th><th></th></tr></thead>
            <tbody>
            ${_sideDishes.map(d => `<tr>
                <td>${d.name}</td>
                <td>R ${parseFloat(d.price || 0).toFixed(2)}</td>
                <td class="text-muted small">${d.description || ''}</td>
                <td class="text-nowrap">
                    <button class="btn btn-xs btn-sm btn-outline-secondary py-0 px-1 me-1"
                        data-r-action="editSideDish" data-id="${d.id}">Edit</button>
                    <button class="btn btn-xs btn-sm btn-outline-danger py-0 px-1"
                        data-r-action="rDeleteSideDish" data-id="${d.id}">✕</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table>`;
    }

    // ── Table Action Sheet ─────────────────────────────────────────
    function openTableActionSheet(table) {
        _currentActionTable = table;
        const orderCount = table.orderCount || 0;
        const paymentDue = table.status === 'occupied' && orderCount === 0;
        document.getElementById('rActionSheetTableName').textContent = table.name;
        document.getElementById('rActionSheetSubtitle').textContent = paymentDue
            ? '💳 All orders served — payment due'
            : `${orderCount} active order${orderCount !== 1 ? 's' : ''} • ${table.seats} seats`;
        document.getElementById('rTableActionSheet').style.display = 'block';
    }

    function dismissTableActionSheet() {
        _currentActionTable = null;
        document.getElementById('rTableActionSheet').style.display = 'none';
    }

    // ── Bill & Checkout (POS) ──────────────────────────────────────
    async function openBillModal(tableId, tableName) {
        dismissTableActionSheet();
        document.getElementById('rBillModalTitle').textContent = `Bill — ${tableName}`;
        document.getElementById('rBillItemsTable').innerHTML = '<div class="text-muted small py-2">Loading bill…</div>';
        document.getElementById('rBillTotalDisplay').textContent = 'R 0.00';
        document.getElementById('rBillTip').value = '0';
        document.getElementById('rBillError').textContent = '';
        // Reset cash row
        document.getElementById('rBillCashGiven').value = '';
        document.getElementById('rBillChangeDisplay').textContent = '—';
        document.getElementById('rBillChangeDisplay').style.color = '#198754';
        document.getElementById('rBillCashRow').style.display =
            document.getElementById('rBillMethod').value === 'cash' ? '' : 'none';
        // Show/hide cash row when method changes
        document.getElementById('rBillMethod').onchange = function () {
            const isCash = this.value === 'cash';
            document.getElementById('rBillCashRow').style.display = isCash ? '' : 'none';
            document.getElementById('rBillCashGiven').value = '';
            document.getElementById('rBillChangeDisplay').textContent = '—';
            document.getElementById('rBillChangeDisplay').style.color = '#198754';
        };
        // Live change calculation
        document.getElementById('rBillCashGiven').oninput = function () {
            const given  = parseFloat(this.value) || 0;
            const tip    = parseFloat(document.getElementById('rBillTip').value) || 0;
            const total  = (_currentBill ? _currentBill.subtotal : 0) + tip;
            const change = given - total;
            const el     = document.getElementById('rBillChangeDisplay');
            el.textContent = given > 0 ? `R ${Math.max(change, 0).toFixed(2)}` : '—';
            el.style.color = change >= 0 ? '#198754' : '#dc3545';
        };
        _currentBill = null;
        document.getElementById('rBillModal').style.display = 'block';
        try {
            const bill = await api.pluginInvoke('restaurant:get-bill', tableId);
            _currentBill = bill;
            if (!bill.items.length) {
                document.getElementById('rBillItemsTable').innerHTML = '<div class="text-muted small">No items on this table yet.</div>';
                return;
            }
            document.getElementById('rBillItemsTable').innerHTML = `
                <table class="table table-sm mb-0">
                    <thead class="table-light"><tr><th>Item</th><th class="text-end">Qty</th><th class="text-end">Price</th><th class="text-end">Total</th></tr></thead>
                    <tbody>${bill.items.map(i => `<tr>
                        <td>${i.name}</td>
                        <td class="text-end">${i.qty}</td>
                        <td class="text-end" style="font-size:0.84rem;">R ${Number(i.price||0).toFixed(2)}</td>
                        <td class="text-end fw-semibold">R ${(Number(i.price||0)*i.qty).toFixed(2)}</td>
                    </tr>`).join('')}</tbody>
                    <tfoot class="table-light"><tr><td colspan="3" class="text-end fw-bold">Subtotal</td><td class="text-end fw-bold">R ${bill.subtotal.toFixed(2)}</td></tr></tfoot>
                </table>`;
            document.getElementById('rBillTotalDisplay').textContent = `R ${bill.subtotal.toFixed(2)}`;
            document.getElementById('rBillTip').oninput = () => {
                const tip = parseFloat(document.getElementById('rBillTip').value) || 0;
                document.getElementById('rBillTotalDisplay').textContent = `R ${(bill.subtotal + tip).toFixed(2)}`;
            };
        } catch (e) {
            document.getElementById('rBillItemsTable').innerHTML = `<div class="text-danger small">Error loading bill: ${e.message || e}</div>`;
        }
    }

    async function processCheckout() {
        const bill = _currentBill;
        if (!bill) { document.getElementById('rBillError').textContent = 'No bill loaded.'; return; }
        const tip    = parseFloat(document.getElementById('rBillTip').value) || 0;
        const method = document.getElementById('rBillMethod').value;
        const total  = bill.subtotal + tip;
        const errEl  = document.getElementById('rBillError');
        errEl.textContent = '';
        // Validate cash amount
        let cashGiven = 0, changeGiven = 0;
        if (method === 'cash') {
            cashGiven = parseFloat(document.getElementById('rBillCashGiven').value) || 0;
            if (cashGiven < total) {
                errEl.textContent = `Cash received (R ${cashGiven.toFixed(2)}) is less than total (R ${total.toFixed(2)}).`;
                document.getElementById('rBillCashGiven').focus();
                return;
            }
            changeGiven = parseFloat((cashGiven - total).toFixed(2));
        }
        try {
            const result = await api.pluginInvoke('restaurant:checkout', bill.tableId, {
                tip, method, subtotal: bill.subtotal, items: bill.items,
                cash_given: cashGiven, change_given: changeGiven
            });
            // Close & fully reset the bill modal
            document.getElementById('rBillModal').style.display = 'none';
            document.getElementById('rBillItemsTable').innerHTML = '';
            document.getElementById('rBillTip').value = '0';
            document.getElementById('rBillMethod').value = 'cash';
            document.getElementById('rBillCashGiven').value = '';
            document.getElementById('rBillCashRow').style.display = '';
            document.getElementById('rBillChangeDisplay').textContent = '—';
            document.getElementById('rBillChangeDisplay').style.color = '#198754';
            document.getElementById('rBillTotalDisplay').textContent = 'R 0.00';
            document.getElementById('rBillError').textContent = '';
            _currentBill = null;
            await loadRestaurant();
            // Auto-print receipt (cash + card/eft)
            printBillSlipPanel({
                table_name: bill.tableName, items: bill.items,
                subtotal: bill.subtotal, tip, total: result.total,
                method, cash_given: cashGiven, change_given: changeGiven,
                created_at: new Date().toISOString()
            });
        } catch (e) {
            errEl.textContent = 'Checkout failed: ' + (e.message || e);
        }
    }

    // ── New / Edit Order Modal ─────────────────────────────────────────────
    let _rItemCount = 0;

    function openOrderModal(orderId) {
        _rItemCount = 0;
        document.getElementById('rOrderItemsBody').innerHTML = '';
        document.getElementById('rOrderNotes').value = '';
        document.getElementById('rOrderId').value = '';
        document.getElementById('rOrderStatus').value = 'pending';
        // Populate table dropdown
        const sel = document.getElementById('rOrderTable');
        sel.innerHTML = '<option value="">— Select table —</option>' +
            _tables.map(t => `<option value="${t.id}" data-name="${t.name}">${t.name} (${t.status})</option>`).join('');

        if (orderId) {
            const o = _orders.find(x => String(x.id) === String(orderId));
            if (!o) return;
            document.getElementById('rOrderModalTitle').textContent = `Edit Order #${orderId}`;
            document.getElementById('rOrderId').value = orderId;
            document.getElementById('rOrderStatus').value = o.status;
            document.getElementById('rOrderNotes').value = o.notes || '';
            sel.value = o.table_id || '';
            safeParseItems(o.items).forEach(i => addItemRow(i));
        } else {
            document.getElementById('rOrderModalTitle').textContent = 'New Order';
            addItemRow();
        }
        document.getElementById('rOrderModal').style.display = 'block';
    }

    function addItemRow(item) {
        const idx = _rItemCount++;
        const tr = document.createElement('div');
        tr.className = 'd-flex gap-2 mb-1 align-items-center';
        tr.setAttribute('data-r-row', idx);
        tr.innerHTML = `
            <input type="text" class="form-control form-control-sm r-item-name" placeholder="Item name"
                list="rMenuDatalist" value="${item ? item.name : ''}">
            <input type="number" class="form-control form-control-sm r-item-qty" min="1" value="${item ? item.qty : 1}"
                style="width:70px;">
            <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1"
                data-r-action="rRemoveItemRow" data-r-row="${idx}">✕</button>`;
        document.getElementById('rOrderItemsBody').appendChild(tr);
    }

    async function saveOrder() {
        const tableEl = document.getElementById('rOrderTable');
        const tableId = tableEl.value || null;
        const tableName = tableId ? tableEl.options[tableEl.selectedIndex]?.getAttribute('data-name') : '';
        const items = [];
        document.querySelectorAll('#rOrderItemsBody [data-r-row]').forEach(row => {
            const name = row.querySelector('.r-item-name')?.value.trim();
            const qty  = parseInt(row.querySelector('.r-item-qty')?.value) || 1;
            if (name) items.push({ name, qty });
        });
        if (!items.length) { alert('Add at least one item.'); return; }
        const order = {
            id:         document.getElementById('rOrderId').value || null,
            table_id:   tableId,
            table_name: tableName,
            status:     document.getElementById('rOrderStatus').value,
            notes:      document.getElementById('rOrderNotes').value.trim(),
            items
        };
        await api.pluginInvoke('restaurant:save-order', order);
        document.getElementById('rOrderModal').style.display = 'none';
        await loadRestaurant();
        if (_rSubTab === 'kitchen') renderKitchen();
    }

    // ── Table management modal ─────────────────────────────────────────────
    function openTablesModal() {
        renderTablesManageList();
        document.getElementById('rTablesModal').style.display = 'block';
    }

    function renderTablesManageList() {
        const el = document.getElementById('rTablesManageList');
        if (!el) return;
        if (!_tables.length) { el.innerHTML = '<p class="text-muted">No tables.</p>'; return; }
        el.innerHTML = _tables.map(t => `
            <div class="d-flex align-items-center gap-2 mb-1 border-bottom pb-1">
                <span class="flex-grow-1 fw-semibold">${t.name}</span>
                <span class="text-muted small">${t.seats} seats</span>
                <button class="btn btn-xs btn-sm btn-outline-danger py-0 px-1"
                    data-r-action="rDeleteTable" data-id="${t.id}">✕</button>
            </div>`).join('');
    }

    async function addTable() {
        const name  = document.getElementById('rNewTableName').value.trim();
        const seats = parseInt(document.getElementById('rNewTableSeats').value) || 4;
        if (!name) { alert('Table name is required.'); return; }
        await api.pluginInvoke('restaurant:save-table', { name, seats });
        document.getElementById('rNewTableName').value = '';
        document.getElementById('rNewTableSeats').value = '4';
        _tables = await api.pluginInvoke('restaurant:get-tables');
        renderTablesManageList();
        renderTables();
    }

    async function deleteTable(id) {
        if (!confirm('Delete this table?')) return;
        await api.pluginInvoke('restaurant:delete-table', id);
        _tables = await api.pluginInvoke('restaurant:get-tables');
        renderTablesManageList();
        renderTables();
    }

    // ── Menu Item Modal ────────────────────────────────────────────────────
    function openMenuItemModal(id) {
        document.getElementById('rMenuItemId').value = '';
        document.getElementById('rMenuItemName').value = '';
        document.getElementById('rMenuItemCategory').value = '';
        document.getElementById('rMenuItemPrice').value = '';
        document.getElementById('rMenuItemDesc').value = '';
        document.getElementById('rMenuItemModalTitle').textContent = 'Add Menu Item';
        if (id) {
            const item = _menuItems.find(x => String(x.id) === String(id));
            if (!item) return;
            document.getElementById('rMenuItemModalTitle').textContent = 'Edit Menu Item';
            document.getElementById('rMenuItemId').value = item.id;
            document.getElementById('rMenuItemName').value = item.name;
            document.getElementById('rMenuItemCategory').value = item.category || '';
            document.getElementById('rMenuItemPrice').value = item.price || '';
            document.getElementById('rMenuItemDesc').value = item.description || '';
        }
        document.getElementById('rMenuItemModal').style.display = 'block';
    }

    async function saveMenuItem() {
        const name = document.getElementById('rMenuItemName').value.trim();
        if (!name) { alert('Name is required.'); return; }
        const item = {
            id:          document.getElementById('rMenuItemId').value || null,
            name,
            category:    document.getElementById('rMenuItemCategory').value.trim(),
            price:       parseFloat(document.getElementById('rMenuItemPrice').value) || 0,
            description: document.getElementById('rMenuItemDesc').value.trim()
        };
        await api.pluginInvoke('restaurant:save-menu-item', item);
        document.getElementById('rMenuItemModal').style.display = 'none';
        _menuItems = await api.pluginInvoke('restaurant:get-menu-items');
        renderMenuItems();
    }

    async function deleteMenuItem(id) {
        if (!confirm('Delete this menu item?')) return;
        await api.pluginInvoke('restaurant:delete-menu-item', parseInt(id));
        _menuItems = await api.pluginInvoke('restaurant:get-menu-items');
        renderMenuItems();
    }

    // ── Side Dish Modal ────────────────────────────────────────────────────
    function openSideDishModal(id) {
        document.getElementById('rSideDishId').value = '';
        document.getElementById('rSideDishName').value = '';
        document.getElementById('rSideDishPrice').value = '';
        document.getElementById('rSideDishDesc').value = '';
        document.getElementById('rSideDishModalTitle').textContent = 'Add Side Dish';
        if (id) {
            const dish = _sideDishes.find(x => String(x.id) === String(id));
            if (!dish) return;
            document.getElementById('rSideDishModalTitle').textContent = 'Edit Side Dish';
            document.getElementById('rSideDishId').value = dish.id;
            document.getElementById('rSideDishName').value = dish.name;
            document.getElementById('rSideDishPrice').value = dish.price || '';
            document.getElementById('rSideDishDesc').value = dish.description || '';
        }
        document.getElementById('rSideDishModal').style.display = 'block';
    }

    async function saveSideDish() {
        const name = document.getElementById('rSideDishName').value.trim();
        if (!name) { alert('Name is required.'); return; }
        const dish = {
            id:          document.getElementById('rSideDishId').value || null,
            name,
            price:       parseFloat(document.getElementById('rSideDishPrice').value) || 0,
            description: document.getElementById('rSideDishDesc').value.trim()
        };
        await api.pluginInvoke('restaurant:save-side-dish', dish);
        document.getElementById('rSideDishModal').style.display = 'none';
        _sideDishes = await api.pluginInvoke('restaurant:get-side-dishes');
        renderSideDishes();
    }

    async function deleteSideDish(id) {
        if (!confirm('Delete this side dish?')) return;
        await api.pluginInvoke('restaurant:delete-side-dish', parseInt(id));
        _sideDishes = await api.pluginInvoke('restaurant:get-side-dishes');
        renderSideDishes();
    }

    // ── Payments History ────────────────────────────────────────────────────
    async function loadPayments() {
        const el = document.getElementById('r-payments-list');
        if (!el) return;
        let payments = [];
        try { payments = await api.pluginInvoke('restaurant:get-payments'); } catch { payments = []; }
        _payments = payments;
        if (!payments.length) { el.innerHTML = '<p class="text-muted">No payments recorded yet.</p>'; return; }
        const totalRev  = payments.reduce((s, p) => s + Number(p.total || 0), 0);
        const totalTips = payments.reduce((s, p) => s + Number(p.tip   || 0), 0);
        el.innerHTML = `
            <div class="row g-2 mb-3">
                <div class="col-4"><div class="report-kpi"><div class="report-kpi-value" style="color:#6f42c1;">${payments.length}</div><div class="report-kpi-label">Payments</div></div></div>
                <div class="col-4"><div class="report-kpi"><div class="report-kpi-value" style="color:#198754;">R ${Number(totalRev).toFixed(2)}</div><div class="report-kpi-label">Total Revenue</div></div></div>
                <div class="col-4"><div class="report-kpi"><div class="report-kpi-value" style="color:#fd7e14;">R ${Number(totalTips).toFixed(2)}</div><div class="report-kpi-label">Total Tips</div></div></div>
            </div>
            <div style="max-height:58vh;overflow-y:auto;">
            <table class="table table-sm table-bordered table-hover">
                <thead class="table-light"><tr><th>#</th><th>Date</th><th>Table</th><th>Method</th><th>Subtotal</th><th>Tip</th><th>Total</th><th></th></tr></thead>
                <tbody>
                ${payments.map(p => `<tr>
                    <td class="text-muted small">${p.id}</td>
                    <td class="text-muted small" style="white-space:nowrap">${new Date(p.created_at||'').toLocaleString()}</td>
                    <td>${p.table_name||'—'}</td>
                    <td><span class="badge" style="background:#6f42c1;color:#fff;">${p.method||'cash'}</span></td>
                    <td>R ${Number(p.subtotal||0).toFixed(2)}</td>
                    <td>R ${Number(p.tip||0).toFixed(2)}</td>
                    <td class="fw-bold text-success">R ${Number(p.total||0).toFixed(2)}</td>
                    <td><button class="btn btn-xs btn-sm btn-outline-secondary py-0 px-1" data-r-action="rPrintBillSlip" data-id="${p.id}" title="Print Slip">🧾 Slip</button></td>
                </tr>`).join('')}
                </tbody>
            </table></div>`;
    }

    // ── Print: Kitchen order slip ───────────────────────────────────────────
    function printKitchenSlipPanel(order) {
        const bizName = localStorage.getItem('bizName') || 'Restaurant';
        const items   = safeParseItems(order.items);
        const rows    = items.map(i => `<tr><td>${i.name||'—'}</td><td style="text-align:right;font-weight:bold;">${i.qty||1}</td></tr>`).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen Slip #${order.id}</title>
<style>body{font-family:'Courier New',monospace;padding:12px;max-width:260px;font-size:12px;}h2{text-align:center;margin:0 0 2px;font-size:15px;}.sub{text-align:center;font-size:10px;color:#555;margin-bottom:8px;}hr{border:none;border-top:1px dashed #888;margin:6px 0;}table{width:100%;border-collapse:collapse;}td{padding:3px;}.note{background:#fff9c4;padding:5px 6px;margin-top:6px;font-size:11px;border-radius:3px;}</style></head><body>
<h2>\ud83c\udf7d\ufe0f KITCHEN ORDER</h2><div class="sub">${bizName}</div><hr>
<div style="font-size:11px;margin-bottom:4px;"><strong>#${order.id} — ${order.table_name||'—'}</strong><span style="float:right;">${new Date(order.created_at||'').toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>
<hr><table><thead><tr><th style="text-align:left;">Item</th><th style="text-align:right;">Qty</th></tr></thead><tbody>${rows}</tbody></table>
${order.notes ? `<div class="note">📝 ${order.notes}</div>` : ''}<hr>
<div style="text-align:center;font-size:10px;color:#888;">Status: ${(order.status||'').toUpperCase()}</div></body></html>`);
    }

    // ── Print: Customer bill slip ───────────────────────────────────────────
    function printBillSlipPanel(payment) {
        const bizName  = localStorage.getItem('bizName')     || 'Restaurant';
        const bizAddr  = localStorage.getItem('bizAddress')  || '';
        const bizPhone = localStorage.getItem('bizPhone')    || '';
        const logoUrl  = localStorage.getItem('bizLogoUrl')  || '';
        const footer1  = localStorage.getItem('receiptFooter1') || 'Thank you for dining with us!';
        const footer2  = localStorage.getItem('receiptFooter2') || '';
        const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;max-width:180px;margin-bottom:6px;">` : '';
        const items    = safeParseItems(payment.items);
        const rows     = items.map(i => `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.81rem;"><span>${i.name} \u00d7 ${i.qty||1}</span><span>R ${((i.price||0)*(i.qty||1)).toFixed(2)}</span></div>`).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bill \u2014 ${payment.table_name}</title>
<style>body{font-family:'Courier New',monospace;padding:1rem;max-width:290px;margin:0 auto;font-size:0.82rem;}.sep{border:none;border-top:1px dashed #aaa;margin:0.4rem 0;}@media print{body{margin:0;padding:0;}}</style></head><body>
<div style="text-align:center;border-bottom:2px dashed #555;padding-bottom:0.6rem;margin-bottom:0.5rem;">${logoHtml}<div style="font-weight:800;font-size:1.05rem;">${bizName}</div>${bizAddr?`<div style="font-size:0.72rem;color:#555;">${bizAddr}</div>`:''} ${bizPhone?`<div style="font-size:0.72rem;color:#555;">Tel: ${bizPhone}</div>`:''}</div>
<div style="font-size:0.72rem;color:#777;margin-bottom:0.5rem;display:flex;justify-content:space-between;"><span>\ud83c\udf7d\ufe0f ${payment.table_name||'Table'}</span><span>${new Date(payment.created_at||'').toLocaleString()}</span></div>
<hr class="sep">${rows}<hr class="sep">
<div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>R ${Number(payment.subtotal||0).toFixed(2)}</span></div>
${Number(payment.tip)>0?`<div style="display:flex;justify-content:space-between;color:#888;"><span>Tip:</span><span>R ${Number(payment.tip).toFixed(2)}</span></div>`:''}
<div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem;border-top:2px dashed #555;margin-top:0.4rem;padding-top:0.4rem;"><span>TOTAL</span><span>R ${Number(payment.total||0).toFixed(2)}</span></div>
<div style="font-size:0.75rem;color:#777;margin-top:0.3rem;">Paid via: <strong>${(payment.method||'').toUpperCase()}</strong></div>
${Number(payment.cash_given)>0?`<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#777;"><span>Cash Received:</span><span>R ${Number(payment.cash_given).toFixed(2)}</span></div>`:''}
${Number(payment.change_given)>0?`<div style="display:flex;justify-content:space-between;font-size:0.78rem;font-weight:bold;color:#198754;border-top:1px dotted #ccc;padding-top:0.25rem;margin-top:0.2rem;"><span>Change Due:</span><span>R ${Number(payment.change_given).toFixed(2)}</span></div>`:''}
<div style="text-align:center;border-top:1px dashed #aaa;margin-top:0.7rem;padding-top:0.5rem;font-size:0.72rem;color:#666;line-height:1.6;">${[footer1,footer2].filter(Boolean).map(l=>`<div>${l}</div>`).join('')}</div>
</body></html>`);
    }

    // ── Print: Full payment history ─────────────────────────────────────────
    async function printPaymentsHistoryPanel() {
        let payments = _payments;
        if (!payments.length) {
            try { payments = await api.pluginInvoke('restaurant:get-payments'); } catch { return; }
        }
        const bizName  = localStorage.getItem('bizName')    || 'Restaurant';
        const bizAddr  = localStorage.getItem('bizAddress') || '';
        const bizPhone = localStorage.getItem('bizPhone')   || '';
        const logoUrl  = localStorage.getItem('bizLogoUrl') || '';
        const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height:50px;margin-bottom:6px;">` : '';
        const totalRev = payments.reduce((s, p) => s + Number(p.total || 0), 0);
        const rows = [...payments].reverse().map(p => `<tr><td>${new Date(p.created_at||'').toLocaleString()}</td><td>${p.table_name}</td><td>${p.method||'cash'}</td><td style="text-align:right;">R ${Number(p.subtotal||0).toFixed(2)}</td><td style="text-align:right;">R ${Number(p.tip||0).toFixed(2)}</td><td style="text-align:right;font-weight:bold;">R ${Number(p.total||0).toFixed(2)}</td></tr>`).join('');
        _printHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Restaurant Payments</title>
<style>body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#1e293b;}.biz-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:14px;}.biz-name{font-size:14px;font-weight:700;}.biz-sub{color:#555;font-size:10px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #dee2e6;padding:4px 8px;}th{background:#f1f5f9;}tfoot td{font-weight:bold;background:#f8fafc;}@media print{body{padding:8px;}}</style></head><body>
<div class="biz-header"><div>${logoHtml}<div class="biz-name">${bizName}</div>${bizAddr?`<div class="biz-sub">${bizAddr}</div>`:''}${bizPhone?`<div class="biz-sub">Tel: ${bizPhone}</div>`:''}</div><div style="text-align:right;"><div style="font-size:13px;font-weight:700;">\ud83c\udf7d\ufe0f RESTAURANT PAYMENT HISTORY</div><div class="biz-sub">Printed: ${new Date().toLocaleString()}</div></div></div>
<table><thead><tr><th>Date</th><th>Table</th><th>Method</th><th style="text-align:right;">Subtotal</th><th style="text-align:right;">Tip</th><th style="text-align:right;">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">Total Revenue</td><td style="text-align:right;">R ${totalRev.toFixed(2)}</td></tr></tfoot></table></body></html>`);
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    function safeParseItems(raw) {
        try { return JSON.parse(raw || '[]'); } catch { return []; }
    }

    // ── Global click handler (delegated) ───────────────────────────────────
    document.getElementById('plugin-tab-restaurant').addEventListener('click', async function (e) {
        const target = e.target.closest('[data-r-action]');
        if (!target) return;
        const action = target.getAttribute('data-r-action');
        const id     = target.getAttribute('data-id');

        if (action === 'refreshRestaurant')      { await loadRestaurant(); }
        else if (action === 'newOrder')           { openOrderModal(null); }
        else if (action === 'manageTablesModal')  { openTablesModal(); }
        else if (action === 'tableCard') {
            const table = _tables.find(t => String(t.id) === id);
            if (!table) return;
            if (table.status === 'available' && (table.orderCount || 0) === 0) {
                openOrderModal(null);
                document.getElementById('rOrderTable').value = id;
            } else {
                openTableActionSheet(table);
            }
        }
        // Table action sheet
        else if (action === 'rActionNewOrder') {
            const t = _currentActionTable;
            dismissTableActionSheet();
            if (t) { openOrderModal(null); document.getElementById('rOrderTable').value = t.id; }
        }
        else if (action === 'rActionViewBill') {
            const t = _currentActionTable;
            if (t) await openBillModal(t.id, t.name);
        }
        else if (action === 'rDismissActionSheet') { dismissTableActionSheet(); }
        // Bill modal
        else if (action === 'rProcessCheckout')   { await processCheckout(); }
        else if (action === 'rPrintBillPreReceipt') {
            if (_currentBill) {
                const tip = parseFloat(document.getElementById('rBillTip').value) || 0;
                printBillSlipPanel({
                    table_name: _currentBill.tableName, items: _currentBill.items,
                    subtotal: _currentBill.subtotal, tip, total: _currentBill.subtotal + tip,
                    method: document.getElementById('rBillMethod').value,
                    created_at: new Date().toISOString()
                });
            }
        }
        else if (action === 'rCloseBillModal') {
            document.getElementById('rBillModal').style.display = 'none';
            document.getElementById('rBillItemsTable').innerHTML = '';
            document.getElementById('rBillTip').value = '0';
            document.getElementById('rBillMethod').value = 'cash';
            document.getElementById('rBillCashGiven').value = '';
            document.getElementById('rBillCashRow').style.display = '';
            document.getElementById('rBillChangeDisplay').textContent = '—';
            document.getElementById('rBillChangeDisplay').style.color = '#198754';
            document.getElementById('rBillTotalDisplay').textContent = 'R 0.00';
            document.getElementById('rBillError').textContent = '';
            _currentBill = null;
        }
        else if (action === 'editOrder')          { openOrderModal(id); }
        else if (action === 'advanceOrder') {
            await api.pluginInvoke('restaurant:advance-order-status', parseInt(id));
            _orders = await api.pluginInvoke('restaurant:get-active-orders');
            _tables = await api.pluginInvoke('restaurant:get-tables');
            renderKitchen(); renderTables();
        }
        else if (action === 'deleteOrder') {
            if (!confirm('Delete this order?')) return;
            await api.pluginInvoke('restaurant:delete-order', parseInt(id));
            await loadRestaurant();
            if (_rSubTab === 'history') loadHistory();
        }
        else if (action === 'rSaveOrder')         { await saveOrder(); }
        else if (action === 'rCloseOrderModal')   { document.getElementById('rOrderModal').style.display = 'none'; }
        else if (action === 'rAddItemRow')        { addItemRow(); }
        else if (action === 'rRemoveItemRow')     {
            const row = document.querySelector(`#rOrderItemsBody [data-r-row="${target.getAttribute('data-r-row')}"]`);
            if (row) row.remove();
        }
        else if (action === 'rAddTable')          { await addTable(); }
        else if (action === 'rDeleteTable')       { await deleteTable(id); }
        else if (action === 'rCloseTablesModal')  { document.getElementById('rTablesModal').style.display = 'none'; }
        // Menu actions
        else if (action === 'newMenuItem')         { openMenuItemModal(null); }
        else if (action === 'editMenuItem')        { openMenuItemModal(id); }
        else if (action === 'rSaveMenuItem')       { await saveMenuItem(); }
        else if (action === 'rCloseMenuItemModal') { document.getElementById('rMenuItemModal').style.display = 'none'; }
        else if (action === 'rDeleteMenuItem')     { await deleteMenuItem(id); }
        // Side dish actions
        else if (action === 'newSideDish')         { openSideDishModal(null); }
        else if (action === 'editSideDish')        { openSideDishModal(id); }
        else if (action === 'rSaveSideDish')       { await saveSideDish(); }
        else if (action === 'rCloseSideDishModal') { document.getElementById('rSideDishModal').style.display = 'none'; }
        else if (action === 'rDeleteSideDish')     { await deleteSideDish(id); }
        // Payment / Slip actions
        else if (action === 'rPrintOrderSlip') {
            const order = _allOrders.find(o => String(o.id) === id);
            if (order) printKitchenSlipPanel(order);
        }
        else if (action === 'rPrintBillSlip') {
            const payment = _payments.find(p => String(p.id) === id);
            if (payment) printBillSlipPanel(payment);
        }
        else if (action === 'rPrintPaymentsHistory') { await printPaymentsHistoryPanel(); }
    });

    // Sub-tab clicks
    document.getElementById('restaurantSubTabs').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-r-subtab]');
        if (btn) switchRSubTab(btn.getAttribute('data-r-subtab'));
    });

    // ── Auto-refresh every 10 seconds ───────────────────────────────────────
    let _autoRefreshTimer = null;

    function startAutoRefresh() {
        stopAutoRefresh();
        _autoRefreshTimer = setInterval(() => loadRestaurant(), 10_000);
    }

    function stopAutoRefresh() {
        if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
    }

    // Pause refresh when the POS window loses focus, resume on focus
    window.addEventListener('focus', startAutoRefresh);
    window.addEventListener('blur',  stopAutoRefresh);

    // Initial load + start timer
    loadRestaurant();
    startAutoRefresh();

    // ── APK Download buttons (Kitchen tab) ─────────────────────────────────
    const _kitchenBtn  = document.getElementById('r-dl-kitchen-btn');
    const _waitersBtn  = document.getElementById('r-dl-waiters-btn');
    const _progressEl  = document.getElementById('r-apk-progress');
    const _progressLbl = document.getElementById('r-apk-progress-label');
    const _progressBar = document.getElementById('r-apk-progress-bar');
    const _progressPct = document.getElementById('r-apk-progress-pct');

    function _showApkProgress(label, pct) {
        _progressEl.style.display = '';
        _progressLbl.textContent  = label;
        _progressBar.style.width  = pct + '%';
        _progressPct.textContent  = pct + '%';
    }
    function _hideApkProgress() { _progressEl.style.display = 'none'; }

    async function _downloadApk(type) {
        const btn = type === 'kitchen' ? _kitchenBtn : _waitersBtn;
        btn.disabled = true;
        _progressBar.style.background = '#0d6efd';

        // Try direct copy first (APK already cached in userData/apks)
        const quick = await api.downloadApk(type).catch(e => ({ ok: false, error: e.message }));
        if (quick && quick.ok) { btn.disabled = false; _hideApkProgress(); return; }

        // Not cached — download plugin + APKs from GitHub with progress
        _showApkProgress('Connecting to GitHub…', 0);
        api.onPluginDownloadProgress(d => {
            _showApkProgress(d.step || d.label || 'Downloading…', d.pct || 0);
        });

        const dlResult = await api.installRemotePlugin('restaurant').catch(e => ({ success: false, error: e.message }));
        if (!dlResult || !dlResult.success) {
            _progressLbl.textContent  = '⚠️ Download failed — check your internet connection.';
            _progressBar.style.background = '#dc3545';
            btn.disabled = false;
            return;
        }

        _hideApkProgress();
        // APKs are now in userData/apks — copy to Downloads
        const copyResult = await api.downloadApk(type).catch(e => ({ ok: false, error: e.message }));
        btn.disabled = false;
        if (!copyResult || !copyResult.ok) {
            alert('Could not save APK: ' + (copyResult && copyResult.error ? copyResult.error : 'Unknown error'));
        }
    }

    if (_kitchenBtn) _kitchenBtn.addEventListener('click', () => _downloadApk('kitchen'));
    if (_waitersBtn) _waitersBtn.addEventListener('click', () => _downloadApk('waiter'));
})();
