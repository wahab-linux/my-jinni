export const LIMITS = { sources: 20, bytes: 5 * 1024 * 1024, characters: 150000, pages: 40 };

export function createSource({ title, pages, kind = 'text', filename = null, is_simulated = false }) {
  if (!title.trim() || title.trim().length > 200) throw new Error('Enter a title of 1–200 characters.');
  const count = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (!count || !pages.some((page) => page.text.trim())) throw new Error('No readable text was found. Scanned PDFs need OCR and are not supported.');
  if (count > LIMITS.characters || pages.length > LIMITS.pages) throw new Error('Use at most 150,000 extracted characters and 40 PDF pages.');
  const id = crypto.randomUUID();
  return { id, title: title.trim(), kind, filename, is_simulated, created_at: new Date().toISOString(), character_count: count,
    chunks: pages.flatMap(({ text, page }) => {
      const chunks = [];
      for (let start = 0; start < text.length; start += 1200) chunks.push({ text: text.slice(start, start + 1200), page });
      return chunks;
    }) };
}

export function searchSources(question, sources, selected) {
  const stop = new Set(['the', 'and', 'for', 'are', 'with', 'what', 'which', 'this', 'that', 'does', 'have', 'can', 'how', 'about', 'from', 'there']);
  const words = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((word) => !stop.has(word));
  return sources.filter((source) => selected.has(source.id)).flatMap((source) => source.chunks.map((chunk, index) => {
    const tokens = new Set(chunk.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    return { source, chunk, index, score: words.filter((word) => tokens.has(word)).length };
  })).filter((item) => item.score).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id) || a.index - b.index).slice(0, 6);
}

export async function openLibrary() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('my-jinni-browser-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable. Allow site storage to save a library. Planning still works.'));
    request.onblocked = () => reject(new Error('Close other Jinni tabs and reload to open the library.'));
  });
  db.onversionchange = () => db.close();
  const transaction = (mode, action) => new Promise((resolve, reject) => {
    const tx = db.transaction('sources', mode);
    let result;
    try { result = action(tx.objectStore('sources')); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = tx.onabort = () => reject(new Error('Could not save the browser library. Check available storage and retry.'));
  });
  return {
    all: () => transaction('readonly', (store) => store.getAll()),
    add: (source) => transaction('readwrite', (store) => {
      const count = store.count();
      count.onsuccess = () => {
        if (count.result >= LIMITS.sources) { store.transaction.abort(); return; }
        store.add(source);
      };
    }),
    remove: (id) => transaction('readwrite', (store) => store.delete(id)),
  };
}
