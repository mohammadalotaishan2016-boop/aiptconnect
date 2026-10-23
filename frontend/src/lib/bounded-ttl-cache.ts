type Entry<T> = { value: T; expiresAt: number; weight: number };

/** A small in-memory LRU cache that also removes expired entries. */
export class BoundedTtlCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();

  constructor(private readonly maxEntries: number, private readonly maxWeight = Number.POSITIVE_INFINITY) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || !(maxWeight > 0)) {
      throw new Error('Cache limits must be positive.');
    }
  }

  private totalWeight = 0;

  private remove(key: K) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.totalWeight -= entry.weight;
    return true;
  }

  get(key: K, now = Date.now()): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.remove(key);
      return undefined;
    }

    // Map insertion order tracks least to most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  has(key: K, now = Date.now()) {
    return this.get(key, now) !== undefined;
  }

  set(key: K, value: V, ttlMs: number, weight = 1, now = Date.now()) {
    if (ttlMs <= 0) {
      this.remove(key);
      return;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error('Cache entry weight must be finite and non-negative.');
    }
    const entryWeight = Math.max(1, Math.ceil(weight));
    this.remove(key);
    if (entryWeight > this.maxWeight) return;

    for (const [candidate, entry] of this.entries) {
      if (entry.expiresAt <= now) this.remove(candidate);
    }
    while (this.entries.size >= this.maxEntries || this.totalWeight + entryWeight > this.maxWeight) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.remove(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: now + ttlMs, weight: entryWeight });
    this.totalWeight += entryWeight;
  }

  delete(key: K) {
    return this.remove(key);
  }

  deleteWhere(predicate: (key: K, value: V) => boolean) {
    for (const [key, entry] of this.entries) {
      if (predicate(key, entry.value)) this.remove(key);
    }
  }

  clear() {
    this.entries.clear();
    this.totalWeight = 0;
  }
}
