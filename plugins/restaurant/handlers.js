/**
 * Restaurant plugin – IPC handlers
 */
function register(ipcMain, db) {

    // ── Startup migration: legacy 'served' orders for available tables ────────
    // Old code marked orders 'served' and freed the table. Those orphaned orders
    // must be marked 'paid' so they never appear on future bills.
    try {
        db.prepare(
            "UPDATE kitchen_orders SET status='paid' WHERE status='served' " +
            "AND table_id IN (SELECT id FROM tables WHERE status='available')"
        ).run();
    } catch (_) {}

    // ── Tables ──────────────────────────────────────────────────────────────
    ipcMain.handle('restaurant:get-tables', () => {
        const tables = db.prepare("SELECT * FROM tables ORDER BY name COLLATE NOCASE, CAST(SUBSTR(name, INSTR(name,' ')+1) AS INTEGER)").all();
        const cntStmt = db.prepare("SELECT COUNT(*) as c FROM kitchen_orders WHERE table_id=? AND status IN ('pending','preparing','ready')");
        return tables.map(t => ({ ...t, orderCount: cntStmt.get(t.id)?.c || 0 }));
    });

    ipcMain.handle('restaurant:save-table', (event, table) => {
        if (table.id) {
            db.prepare('UPDATE tables SET name=?, seats=?, status=? WHERE id=?')
              .run(table.name, table.seats || 4, table.status || 'available', table.id);
            return { id: table.id };
        }
        const r = db.prepare('INSERT INTO tables (name, seats, status) VALUES (?,?,?)')
            .run(table.name, table.seats || 4, table.status || 'available');
        return { id: r.lastInsertRowid };
    });

    ipcMain.handle('restaurant:set-table-status', (event, id, status) => {
        db.prepare('UPDATE tables SET status=? WHERE id=?').run(status, id);
        return { ok: true };
    });

    ipcMain.handle('restaurant:delete-table', (event, id) => {
        db.prepare('DELETE FROM tables WHERE id=?').run(id);
        return { ok: true };
    });

    // ── Kitchen Orders ───────────────────────────────────────────────────────
    ipcMain.handle('restaurant:get-orders', () =>
        db.prepare("SELECT * FROM kitchen_orders ORDER BY created_at DESC").all()
    );

    ipcMain.handle('restaurant:get-payments', () => {
        try {
            return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
        } catch { return []; }
    });

    ipcMain.handle('restaurant:get-active-orders', () =>
        db.prepare("SELECT * FROM kitchen_orders WHERE status IN ('pending','preparing','ready') ORDER BY created_at ASC").all()
    );

    ipcMain.handle('restaurant:save-order', (event, order) => {
        const items = typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []);
        if (order.id) {
            db.prepare('UPDATE kitchen_orders SET table_id=?,table_name=?,items=?,notes=?,status=?,updated_at=datetime(\'now\') WHERE id=?')
              .run(order.table_id || null, order.table_name || '', items, order.notes || '', order.status || 'pending', order.id);
            return { id: order.id };
        }
        const r = db.prepare('INSERT INTO kitchen_orders (table_id,table_name,items,notes,status) VALUES (?,?,?,?,?)')
            .run(order.table_id || null, order.table_name || '', items, order.notes || '', order.status || 'pending');
        // Mark table as occupied
        if (order.table_id) {
            db.prepare("UPDATE tables SET status='occupied' WHERE id=?").run(order.table_id);
        }
        return { id: r.lastInsertRowid };
    });

    ipcMain.handle('restaurant:advance-order-status', (event, id) => {
        const order = db.prepare('SELECT * FROM kitchen_orders WHERE id=?').get(id);
        if (!order) return { ok: false };
        const next = { pending: 'preparing', preparing: 'ready', ready: 'served' };
        const newStatus = next[order.status] || 'served';
        db.prepare("UPDATE kitchen_orders SET status=?, updated_at=datetime('now') WHERE id=?").run(newStatus, id);
        // Table stays occupied until checkout payment — do NOT free it here
        return { ok: true, newStatus };
    });

    ipcMain.handle('restaurant:delete-order', (event, id) => {
        const order = db.prepare('SELECT * FROM kitchen_orders WHERE id=?').get(id);
        db.prepare('DELETE FROM kitchen_orders WHERE id=?').run(id);
        if (order && order.table_id) {
            // Only free table when zero orders remain (any status) — table stays occupied until checkout
            const remaining = db.prepare('SELECT COUNT(*) as c FROM kitchen_orders WHERE table_id=?').get(order.table_id).c;
            if (remaining === 0) {
                db.prepare("UPDATE tables SET status='available' WHERE id=?").run(order.table_id);
            }
        }
        return { ok: true };
    });

    // ── Bill & Checkout (IPC) ────────────────────────────────────────────────
    ipcMain.handle('restaurant:get-bill', (event, tableId) => {
        // Safety-net: clean any 'served' orders left over from old code on available tables
        db.prepare(
            "UPDATE kitchen_orders SET status='paid' WHERE status='served' " +
            "AND table_id IN (SELECT id FROM tables WHERE status='available')"
        ).run();
        const table = db.prepare('SELECT * FROM tables WHERE id=?').get(tableId);
        // Only orders that are active or served-but-not-yet-paid for this table
        const orders = db.prepare("SELECT * FROM kitchen_orders WHERE table_id=? AND status NOT IN ('cancelled','paid') ORDER BY created_at ASC").all(tableId);
        const itemMap = {};
        orders.forEach(o => {
            JSON.parse(o.items || '[]').forEach(i => {
                const key = (i.name || '').toLowerCase();
                if (itemMap[key]) { itemMap[key].qty += (i.qty || 1); }
                else { itemMap[key] = { name: i.name, qty: i.qty || 1 }; }
            });
        });
        const priceMap = {};
        db.prepare('SELECT name, price FROM menu_items').all().forEach(m => { priceMap[m.name.toLowerCase()] = m.price || 0; });
        const items = Object.values(itemMap).map(i => ({ name: i.name, qty: i.qty, price: priceMap[i.name.toLowerCase()] || 0 }));
        const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
        return { tableId, tableName: table ? table.name : '', items, subtotal };
    });

    ipcMain.handle('restaurant:checkout', (event, tableId, payload) => {
        const { tip = 0, method = 'cash', subtotal = 0, items = [], cash_given = 0, change_given = 0 } = payload || {};
        const total = parseFloat(subtotal) + parseFloat(tip);
        const table = db.prepare('SELECT * FROM tables WHERE id=?').get(tableId);
        db.prepare(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER, table_name TEXT,
            subtotal REAL, tip REAL DEFAULT 0, total REAL, method TEXT DEFAULT 'cash',
            items TEXT, cash_given REAL DEFAULT 0, change_given REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`).run();
        // Migrate existing table — safe to run multiple times
        try { db.prepare('ALTER TABLE payments ADD COLUMN cash_given REAL DEFAULT 0').run(); } catch {}
        try { db.prepare('ALTER TABLE payments ADD COLUMN change_given REAL DEFAULT 0').run(); } catch {}
        const r = db.prepare('INSERT INTO payments (table_id,table_name,subtotal,tip,total,method,items,cash_given,change_given) VALUES (?,?,?,?,?,?,?,?,?)').run(
            tableId, table ? table.name : '', subtotal, tip, total, method, JSON.stringify(items), cash_given, change_given
        );
        db.prepare("UPDATE kitchen_orders SET status='paid', updated_at=datetime('now') WHERE table_id=? AND status NOT IN ('paid','cancelled')").run(tableId);
        db.prepare("UPDATE tables SET status='available' WHERE id=?").run(tableId);
        return { paymentId: r.lastInsertRowid, total, change: change_given };
    });

    // ── Menu Items ───────────────────────────────────────────────────────────
    ipcMain.handle('restaurant:get-menu-items', () =>
        db.prepare('SELECT * FROM menu_items ORDER BY category, name').all()
    );

    ipcMain.handle('restaurant:save-menu-item', (event, item) => {
        if (item.id) {
            db.prepare('UPDATE menu_items SET name=?,category=?,price=?,description=? WHERE id=?')
              .run(item.name, item.category || '', item.price || 0, item.description || '', item.id);
            return { id: item.id };
        }
        const r = db.prepare('INSERT INTO menu_items (name,category,price,description) VALUES (?,?,?,?)')
            .run(item.name, item.category || '', item.price || 0, item.description || '');
        return { id: r.lastInsertRowid };
    });

    ipcMain.handle('restaurant:delete-menu-item', (event, id) => {
        db.prepare('DELETE FROM menu_items WHERE id=?').run(id);
        return { ok: true };
    });

    // ── Side Dishes ──────────────────────────────────────────────────────────
    ipcMain.handle('restaurant:get-side-dishes', () =>
        db.prepare('SELECT * FROM side_dishes ORDER BY name').all()
    );

    ipcMain.handle('restaurant:save-side-dish', (event, dish) => {
        if (dish.id) {
            db.prepare('UPDATE side_dishes SET name=?,price=?,description=? WHERE id=?')
              .run(dish.name, dish.price || 0, dish.description || '', dish.id);
            return { id: dish.id };
        }
        const r = db.prepare('INSERT INTO side_dishes (name,price,description) VALUES (?,?,?)')
            .run(dish.name, dish.price || 0, dish.description || '');
        return { id: r.lastInsertRowid };
    });

    ipcMain.handle('restaurant:delete-side-dish', (event, id) => {
        db.prepare('DELETE FROM side_dishes WHERE id=?').run(id);
        return { ok: true };
    });
}

module.exports = { register };
