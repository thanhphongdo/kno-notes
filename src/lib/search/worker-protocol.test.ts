import { describe, it, expect, afterEach } from 'vitest';
import {
  MODEL_ID,
  EMBEDDING_DIM,
  E5_QUERY_PREFIX,
  E5_PASSAGE_PREFIX,
  MAX_PLAIN_CHARS,
  embedText,
  passageInput,
  queryInput,
  isSemanticSearchEnabled,
} from './worker-protocol';

describe('e5 prefixes', () => {
  it('pins the model id and dimension', () => {
    expect(MODEL_ID).toBe('Xenova/multilingual-e5-small');
    expect(EMBEDDING_DIM).toBe(384);
  });

  it('uses the exact e5 prefixes, trailing space included', () => {
    expect(E5_QUERY_PREFIX).toBe('query: ');
    expect(E5_PASSAGE_PREFIX).toBe('passage: ');
  });

  it('prefixes documents with "passage: " and queries with "query: "', () => {
    expect(passageInput('sốc phản vệ')).toBe('passage: sốc phản vệ');
    expect(queryInput('sốc phản vệ')).toBe('query: sốc phản vệ');
  });

  it('never double-prefixes', () => {
    expect(queryInput(queryInput('a'))).toBe('query: a');
    expect(passageInput(passageInput('a'))).toBe('passage: a');
  });

  it('trims the query before prefixing and tolerates an empty query', () => {
    expect(queryInput('  ecg  ')).toBe('query: ecg');
    expect(queryInput('   ')).toBe('query: ');
  });
});

describe('embedText', () => {
  const doc = { title: 'Đọc ECG trong 10 bước', desc: 'Trình tự hệ thống', tags: ['Tim mạch', 'ECG'], plain: 'Bước 1. Tần số.' };

  it('joins title, description, tags and the plaintext body', () => {
    expect(embedText(doc)).toBe('Đọc ECG trong 10 bước. Trình tự hệ thống. Tim mạch, ECG. Bước 1. Tần số.');
  });

  it('collapses runs of whitespace', () => {
    expect(embedText({ ...doc, plain: 'a\n\n  b\t c' })).toContain('a b c');
  });

  it('truncates the body to MAX_PLAIN_CHARS', () => {
    const long = 'x'.repeat(MAX_PLAIN_CHARS + 500);
    expect(embedText({ title: 't', desc: 'd', tags: [], plain: long })).toHaveLength('t. d. . '.length + MAX_PLAIN_CHARS);
  });

  it('survives empty fields', () => {
    expect(embedText({ title: '', desc: '', tags: [], plain: '' })).toBe('. . .');
  });

  it('is passage-prefixed when handed to passageInput', () => {
    expect(passageInput(embedText(doc)).startsWith(E5_PASSAGE_PREFIX)).toBe(true);
  });
});

describe('isSemanticSearchEnabled', () => {
  const original = process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH;
  afterEach(() => { process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH = original; });

  it('is disabled when the kill switch is exactly "1"', () => {
    process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH = '1';
    expect(isSemanticSearchEnabled()).toBe(false);
  });

  it('is enabled when the kill switch is absent or any other value', () => {
    delete process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH;
    expect(isSemanticSearchEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_DISABLE_SEMANTIC_SEARCH = '0';
    expect(isSemanticSearchEnabled()).toBe(true);
  });
});
