const DB_NAME = 'flux-style-bridge'
const STORE_NAME = 'gallery'
const DB_VERSION = 1

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface StoredGalleryEntry {
  sourceImage: string | null
  resultUrl: string
  prompt: string
  timestamp: number
  settings: Record<string, unknown>
  resultUrl2?: string
  settings2?: Record<string, unknown>
  isCompare?: boolean
  compareWarning?: string
}

export async function loadGallery(): Promise<StoredGalleryEntry[]> {
  try {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const entries = (req.result as StoredGalleryEntry[]).sort((a, b) => b.timestamp - a.timestamp)
        resolve(entries)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function saveEntry(entry: StoredGalleryEntry): Promise<void> {
  try {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silent fail — gallery just won't persist
  }
}

export async function deleteEntry(timestamp: number): Promise<void> {
  try {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(timestamp)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silent fail
  }
}

export async function clearGallery(): Promise<void> {
  try {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // silent fail
  }
}

export async function estimateStorageBytes(): Promise<number> {
  try {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const json = JSON.stringify(req.result)
        resolve(new Blob([json]).size)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return 0
  }
}

export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
