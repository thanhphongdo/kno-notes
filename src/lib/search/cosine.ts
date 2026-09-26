/** Cosine similarity and L2 normalisation over `Float32Array` embeddings. */

/**
 * Cosine similarity in [-1, 1].
 * Returns 0 — never NaN — for empty, mismatched or all-zero vectors, so a
 * half-initialised cache can never poison a ranking.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Returns a new unit-length copy. An all-zero vector is returned unchanged
 * rather than turned into NaNs.
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i]! * vector[i]!;
  const length = Math.sqrt(sum);
  if (length === 0) return new Float32Array(vector);

  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i]! / length;
  return out;
}
