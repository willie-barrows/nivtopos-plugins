/**
 * Restaurant plugin – DB migrations
 * Called once at startup with the plugin's better-sqlite3 instance.
 */
function migrate(db) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS tables (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT NOT NULL,
            seats   INTEGER DEFAULT 4,
            status  TEXT DEFAULT 'available'  -- available | occupied | reserved
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS kitchen_orders (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id     INTEGER,
            table_name   TEXT,
            items        TEXT NOT NULL,   -- JSON array
            notes        TEXT DEFAULT '',
            status       TEXT DEFAULT 'pending',  -- pending | preparing | ready | served
            created_at   TEXT DEFAULT (datetime('now')),
            updated_at   TEXT DEFAULT (datetime('now'))
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS menu_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            category    TEXT DEFAULT '',
            price       REAL DEFAULT 0,
            description TEXT DEFAULT '',
            active      INTEGER DEFAULT 1
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS side_dishes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            price       REAL DEFAULT 0,
            description TEXT DEFAULT '',
            active      INTEGER DEFAULT 1
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS payments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id   INTEGER,
            table_name TEXT,
            subtotal   REAL,
            tip        REAL DEFAULT 0,
            total      REAL,
            method     TEXT DEFAULT 'cash',
            items      TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `).run();

    // Seed a few tables if empty
    const count = db.prepare('SELECT COUNT(*) as c FROM tables').get().c;
    if (count === 0) {
        const ins = db.prepare("INSERT INTO tables (name, seats) VALUES (?,?)");
        [['Table 1', 4], ['Table 2', 4], ['Table 3', 2], ['Table 4', 6],
         ['Table 5', 4], ['Table 6', 4], ['Bar 1', 2], ['Bar 2', 2]].forEach(([n, s]) => ins.run(n, s));
    }
}

module.exports = { migrate };
