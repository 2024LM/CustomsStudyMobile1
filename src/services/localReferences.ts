export type LocalReferenceType = 'pdf' | 'docx' | 'md' | 'txt';
export type LocalReferenceSource = 'upload' | 'download';

export interface LocalReference {
  id: string;
  name: string;
  type: LocalReferenceType;
  mimeType: string;
  size: number;
  addedAt: number;
  domainId: string;
  source: LocalReferenceSource;
  remoteId?: string;
  description?: string;
  categories?: string[];
  originalUrl?: string;
  downloadedVersion?: number;
  remoteUpdatedAt?: string;
  data: Blob;
}

const DB_NAME = 'study_local_references';
const DB_VERSION = 2;
const STORE = 'files';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE)) {
        store = db.createObjectStore(STORE, { keyPath: 'id' });
      } else {
        store = request.transaction!.objectStore(STORE);
      }
      if (!store.indexNames.contains('domainId')) store.createIndex('domainId', 'domainId', { unique: false });
      if (!store.indexNames.contains('addedAt')) store.createIndex('addedAt', 'addedAt', { unique: false });
      if (!store.indexNames.contains('source')) store.createIndex('source', 'source', { unique: false });
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
    source: 'upload',
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

export async function saveDownloadedReference(input: {
  remoteId: string;
  title: string;
  description: string;
  categories: string[];
  originalUrl: string;
  version: number;
  updatedAt: string;
  type: LocalReferenceType;
  mimeType: string;
  data: Blob;
  domainId: string;
}): Promise<LocalReference> {
  if (input.data.size <= 0) throw new Error('المرجع فارغ');
  if (input.data.size > MAX_FILE_BYTES) throw new Error('حجم المرجع يتجاوز 25 MB');

  const id = 'download_' + input.domainId + '_' + input.remoteId;
  const item: LocalReference = {
    id,
    name: input.title.slice(0, 180),
    type: input.type,
    mimeType: input.mimeType || 'application/octet-stream',
    size: input.data.size,
    addedAt: Date.now(),
    domainId: input.domainId,
    source: 'download',
    remoteId: input.remoteId,
    description: input.description.slice(0, 500),
    categories: input.categories.slice(0, 20),
    originalUrl: input.originalUrl,
    downloadedVersion: Math.max(1, Math.floor(input.version || 1)),
    remoteUpdatedAt: input.updatedAt || '',
    data: input.data,
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Unable to save downloaded reference'));
      tx.onabort = () => reject(tx.error || new Error('Reference download save was aborted'));
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
        const items = (request.result as LocalReference[])
          .map((item) => ({ ...item, source: item.source || 'upload' }))
          .sort((a, b) => b.addedAt - a.addedAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error || new Error('Unable to list references'));
    });
  } finally {
    db.close();
  }
}

export async function localReferenceStorageSummary(domainId: string): Promise<{
  totalBytes: number;
  uploadedBytes: number;
  downloadedBytes: number;
  uploadedCount: number;
  downloadedCount: number;
}> {
  const items = await listLocalReferences(domainId);
  return items.reduce((summary, item) => {
    summary.totalBytes += item.size;
    if (item.source === 'download') {
      summary.downloadedBytes += item.size;
      summary.downloadedCount += 1;
    } else {
      summary.uploadedBytes += item.size;
      summary.uploadedCount += 1;
    }
    return summary;
  }, {
    totalBytes: 0,
    uploadedBytes: 0,
    downloadedBytes: 0,
    uploadedCount: 0,
    downloadedCount: 0,
  });
}

export async function clearDownloadedReferences(domainId: string): Promise<number> {
  const items = await listLocalReferences(domainId);
  const targets = items.filter((item) => item.source === 'download');
  if (targets.length === 0) return 0;

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const item of targets) store.delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Unable to clear downloaded references'));
      tx.onabort = () => reject(tx.error || new Error('Clear download operation aborted'));
    });
  } finally {
    db.close();
  }
  return targets.length;
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
