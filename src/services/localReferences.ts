export type LocalReferenceType = 'pdf' | 'docx' | 'md' | 'txt';

export interface LocalReference {
  id: string;
  name: string;
  type: LocalReferenceType;
  mimeType: string;
  size: number;
  addedAt: number;
  domainId: string;
  data: Blob;
}

const DB_NAME = 'study_local_references';
const DB_VERSION = 1;
const STORE = 'files';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('domainId', 'domainId', { unique: false });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open local reference database'));
  });
}

function extension(name: string): string {
  const value = name.toLowerCase().trim();
  const dot = value.lastIndexOf('.');
  return dot >= 0 ? value.slice(dot + 1) : '';
}

function detectType(file: File): LocalReferenceType | null {
  const ext = extension(file.name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  return null;
}

export async function addLocalReference(file: File, domainId: string): Promise<LocalReference> {
  if (file.size <= 0) throw new Error('الملف فارغ');
  if (file.size > MAX_FILE_BYTES) throw new Error('حجم المرجع يتجاوز 25 MB');

  const type = detectType(file);
  if (!type) throw new Error('الأنواع المدعومة: PDF و DOCX و MD و TXT');

  // Do not trust MIME alone; Android file pickers often provide a generic MIME.
  const id = 'ref_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const item: LocalReference = {
    id,
    name: file.name.slice(0, 180),
    type,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: Date.now(),
    domainId,
    data: file.slice(0, file.size, file.type || undefined),
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Unable to save reference'));
      tx.onabort = () => reject(tx.error || new Error('Reference save was aborted'));
    });
  } finally {
    db.close();
  }

  return item;
}

export async function listLocalReferences(domainId: string): Promise<LocalReference[]> {
  const db = await openDb();
  try {
    return await new Promise<LocalReference[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('domainId');
      const request = index.getAll(IDBKeyRange.only(domainId));
      request.onsuccess = () => {
        const items = (request.result as LocalReference[]).sort((a, b) => b.addedAt - a.addedAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error || new Error('Unable to list references'));
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalReference(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Unable to delete reference'));
    });
  } finally {
    db.close();
  }
}
