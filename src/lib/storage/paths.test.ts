// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { safeSegment, notePath, imagePath, extForContentType } from './paths';

describe('safeSegment', () => {
  it('accepts ordinary ids', () => {
    expect(safeSegment('n1', 'noteId')).toBe('n1');
    expect(safeSegment('n1758891234567', 'noteId')).toBe('n1758891234567');
    expect(safeSegment('3f2a9c10-7b4e-4a1d-9f88-1c2d3e4f5a6b', 'userId')).toBe(
      '3f2a9c10-7b4e-4a1d-9f88-1c2d3e4f5a6b',
    );
    expect(safeSegment('img_a1b2c3', 'imageId')).toBe('img_a1b2c3');
  });

  it('rejects parent-directory traversal', () => {
    expect(() => safeSegment('..', 'noteId')).toThrow(/noteId/);
    expect(() => safeSegment('../../etc/passwd', 'noteId')).toThrow(/noteId/);
    expect(() => safeSegment('n1/../n2', 'noteId')).toThrow(/noteId/);
  });

  it('rejects any slash or backslash', () => {
    expect(() => safeSegment('a/b', 'noteId')).toThrow();
    expect(() => safeSegment('a\\b', 'noteId')).toThrow();
    expect(() => safeSegment('/absolute', 'userId')).toThrow();
  });

  it('rejects URL-encoded separators, which would decode later', () => {
    expect(() => safeSegment('%2e%2e', 'noteId')).toThrow();
    expect(() => safeSegment('a%2Fb', 'noteId')).toThrow();
    expect(() => safeSegment('a%5Cb', 'noteId')).toThrow();
  });

  it('rejects NUL bytes, dot-only names and empty strings', () => {
    expect(() => safeSegment(String.fromCharCode(97, 0, 98), 'noteId')).toThrow();
    expect(() => safeSegment('.', 'noteId')).toThrow();
    expect(() => safeSegment('', 'userId')).toThrow();
  });

  it('rejects anything over 128 characters', () => {
    expect(() => safeSegment('a'.repeat(129), 'noteId')).toThrow();
    expect(safeSegment('a'.repeat(128), 'noteId')).toHaveLength(128);
  });
});

describe('notePath / imagePath', () => {
  it('always nests under data/users/<userId>/', () => {
    expect(notePath('u1', 'n1')).toBe('data/users/u1/notes/n1.json');
    expect(imagePath('u1', 'i1', 'png')).toBe('data/users/u1/images/i1.png');
  });

  it('refuses to build a path from a traversing userId', () => {
    expect(() => notePath('../u2', 'n1')).toThrow(/userId/);
    expect(() => imagePath('..', 'i1', 'png')).toThrow(/userId/);
  });

  it('refuses to build a path from a traversing noteId', () => {
    expect(() => notePath('u1', '../../secret')).toThrow(/noteId/);
  });
});

describe('extForContentType', () => {
  it('maps the allowed image types', () => {
    expect(extForContentType('image/png')).toBe('png');
    expect(extForContentType('image/jpeg')).toBe('jpg');
    expect(extForContentType('image/webp')).toBe('webp');
    expect(extForContentType('image/gif')).toBe('gif');
    expect(extForContentType('image/avif')).toBe('avif');
  });

  it('ignores parameters and casing', () => {
    expect(extForContentType('IMAGE/PNG; charset=binary')).toBe('png');
  });

  it('throws for anything else, including SVG', () => {
    expect(() => extForContentType('image/svg+xml')).toThrow(/content type/i);
    expect(() => extForContentType('application/pdf')).toThrow(/content type/i);
  });
});
