// src/lib/storage/lru.ts

/** LRU tối giản dựa trên thứ tự chèn của Map. Không phụ thuộc bên ngoài. */
export class Lru<T> {
  private readonly map = new Map<string, T>();

  constructor(private readonly max: number) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): T | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Re-insert so this key becomes the most recently used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    if (this.max <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
