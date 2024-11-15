// a connection must always be closed right away, otherwise there's a multi tab
// issue when version is incremented: callbacks never called
// https://stackoverflow.com/questions/40121865/indexed-db-open-not-trigger-any-callback

export class DiskCache {
    constructor(name) {
        this.name = name;
        this._tables = new Set();
        this._version = undefined;
    }

    _execute(callback) {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.name, this._version);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const dbTables = new Set(db.objectStoreNames);
                const newTables = this._tables.difference(dbTables);
                newTables.forEach((table) => db.createObjectStore(table));
            };
            request.onsuccess = (event) => {
                const db = event.target.result;
                this._version = db.version;
                const dbTables = new Set(db.objectStoreNames);
                const newTables = this._tables.difference(dbTables);
                if (newTables.size !== 0) {
                    db.close();
                    this._version++;
                    return this._execute(callback).then(resolve);
                }
                Promise.resolve(callback(db)).then(resolve);
            };
            request.onerror = (event) => {
                // TODO?
            };
        });
    }

    defineTable(name) {
        this._tables.add(name);
    }

    async insert(table, record, key) {
        return this._execute((db) => {
            const transaction = db.transaction(table, "readwrite");
            const objectStore = transaction.objectStore(table);
            objectStore.add(record, key);
        });
    }

    async read(table, id) {
        return this._execute((db) => {
            return new Promise((resolve) => {
                const transaction = db.transaction(table, "readonly");
                const objectStore = transaction.objectStore(table);
                const r = objectStore.get(id);
                r.onsuccess = () => resolve(r.result);
            });
        });
    }

    async clear(table) {
        return this._execute((db) => {
            const transaction = db.transaction(table, "readwrite");
            const objectStore = transaction.objectStore(table);
            objectStore.clear();
        });
    }

    async clearAll() {
        return this._execute((db) => {
            for (const table of [...db.objectStoreNames]) {
                const transaction = db.transaction(table, "readwrite");
                const objectStore = transaction.objectStore(table);
                objectStore.clear();
            }
        });
    }
}
