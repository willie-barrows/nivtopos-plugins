# NivtoPOS Plugins

Official plugin repository for [NivtoPOS](https://github.com/willie-barrows).

## Available Plugins

| Plugin | Status | Description |
|--------|--------|-------------|
| `restaurant` | ✅ Available | Table management, kitchen display, waiter app |

## Android Apps (bundled with Restaurant plugin)

| App | Download |
|-----|----------|
| NIVTO Kitchen Display | [NIVTOKitchen.apk](https://github.com/willie-barrows/nivtopos-plugins/releases/latest/download/NIVTOKitchen.apk) |
| NIVTO Waiters App | [NIVTOWaiters.apk](https://github.com/willie-barrows/nivtopos-plugins/releases/latest/download/NIVTOWaiters.apk) |

## Structure

```
plugins/
  restaurant/
    manifest.json    ← plugin metadata + file + APK lists
    db.js            ← database schema & queries
    handlers.js      ← IPC handlers
    integration.js   ← main process integration
    panel.html       ← UI panel
    panel.js         ← UI logic
```
