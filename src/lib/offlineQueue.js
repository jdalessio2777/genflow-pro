import { openDB } from 'idb';

const DB_NAME = 'genflow-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-ops';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
      }
    },
  });
}

export async function queueOperation(op) {
  const db = await getDB();
  await db.add(STORE_NAME, {
    ...op,
    timestamp: Date.now(),
    status: 'pending',
  });
}

export async function getPendingOperations() {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, 'timestamp');
}

export async function removeOperation(id) {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function clearAllOperations() {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function getPendingCount() {
  const db = await getDB();
  return db.count(STORE_NAME);
}