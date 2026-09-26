/**
 * PWA icon generator — `npm run icons`.
 *
 * Writes `public/icons/*.png` (plus the `icon.svg` source) from an inline SVG
 * description of the Kno-Notes mark: the accent rounded square with a serif `K`.
 *
 * ── Why it is written this way ───────────────────────────────────────────────
 * Rule #4 of CLAUDE.md is "chi phí = 0đ", and the repo should not grow a heavy
 * native image dependency (sharp, canvas, resvg) or need a browser binary just
 * to produce five small icons. So this script ships its own rasteriser and its
 * own PNG encoder, in ~200 lines, with **zero dependencies** beyond Node's
 * built-in `zlib`:
 *
 *   • the mark is described once, as polygons, and emitted both as SVG and as
 *     pixels, so the two can never drift;
 *   • the rasteriser is an analytic-x / supersampled-y scanline filler —
 *     exact horizontal coverage, 8 sub-scanlines vertically, which is plenty
 *     for a flat two-colour mark;
 *   • the encoder writes a colour-type-6 (RGBA) PNG with filter 0 scanlines
 *     and `zlib.deflateSync` for IDAT.
 *
 * Deterministic: running it twice produces byte-identical files.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ── palette (contracts §5 tokens) ────────────────────────────────────────────

const ACCENT: RGB = [0x17, 0x75, 0x6b]; // --accent  #17756b
const INK: RGB = [0xff, 0xff, 0xff];
const BG: RGB = [0xf6, 0xf6, 0xf3]; // --bg      #f6f6f3

type RGB = readonly [number, number, number];
type Point = readonly [number, number];
type Polygon = readonly Point[];

// ── the mark, described once ─────────────────────────────────────────────────

/**
 * A serif capital `K` in a 100×100 glyph box (y grows downward).
 * Stem with top/bottom serifs, an arm rising to the right, a leg falling to the
 * right; arm and leg overlap the stem so the union is one connected shape.
 */
const K_GLYPH: readonly Polygon[] = [
  rect(10, 4, 18, 92), // stem
  rect(2, 4, 38, 9), // top serif
  rect(2, 87, 38, 9), // bottom serif
  // The arm and the leg both start left of the stem's right edge (x = 28) so
  // that the junction is solid at every scanline — starting them flush leaves
  // a one-pixel dark sliver between the stem and the fork.
  [[18, 62], [64, 4], [86, 4], [44, 62]], // arm
  rect(62, 4, 28, 8), // arm serif
  [[18, 46], [48, 46], [92, 96], [68, 96]], // leg
  rect(64, 87, 32, 9), // leg serif
];

/** Ink bounds of the glyph, used to centre it optically. */
const K_CENTER: Point = [49, 50];

function rect(x: number, y: number, w: number, h: number): Polygon {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** A rounded rectangle as a polygon; each corner is approximated by 12 chords. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): Polygon {
  const radius = Math.min(r, w / 2, h / 2);
  const steps = 12;
  const corners: readonly [number, number, number][] = [
    [x + w - radius, y + radius, -Math.PI / 2], // top-right
    [x + w - radius, y + h - radius, 0], // bottom-right
    [x + radius, y + h - radius, Math.PI / 2], // bottom-left
    [x + radius, y + radius, Math.PI], // top-left
  ];
  const points: Point[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i += 1) {
      const angle = start + (Math.PI / 2) * (i / steps);
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  return points;
}

/** Places `K_GLYPH` so that its optical centre lands on (cx, cy) at `size` px. */
function placeK(cx: number, cy: number, size: number): Polygon[] {
  const scale = size / 100;
  return K_GLYPH.map((poly) =>
    poly.map(([gx, gy]): Point => [cx + (gx - K_CENTER[0]) * scale, cy + (gy - K_CENTER[1]) * scale]),
  );
}

// ── rasteriser ───────────────────────────────────────────────────────────────

const SUBSAMPLES = 8;

/**
 * Per-pixel coverage (0..1) of the union of `polygons`.
 * Analytic in x (span overlap), supersampled in y. Non-zero winding.
 */
function coverage(polygons: readonly Polygon[], size: number): Float32Array {
  const cov = new Float32Array(size * size);
  const weight = 1 / SUBSAMPLES;

  for (const poly of polygons) {
    const n = poly.length;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of poly) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const firstRow = Math.max(0, Math.floor(minY));
    const lastRow = Math.min(size - 1, Math.ceil(maxY));
    // One row of accumulated coverage, so a self-overlapping polygon still
    // saturates at 1 before being merged into the union.
    const row = new Float32Array(size);

    for (let py = firstRow; py <= lastRow; py += 1) {
      row.fill(0);
      for (let s = 0; s < SUBSAMPLES; s += 1) {
        const y = py + (s + 0.5) / SUBSAMPLES;
        const crossings: { x: number; dir: number }[] = [];
        for (let i = 0; i < n; i += 1) {
          const [x1, y1] = poly[i]!;
          const [x2, y2] = poly[(i + 1) % n]!;
          if (y1 === y2) continue;
          if (y < Math.min(y1, y2) || y >= Math.max(y1, y2)) continue;
          crossings.push({ x: x1 + ((y - y1) / (y2 - y1)) * (x2 - x1), dir: y2 > y1 ? 1 : -1 });
        }
        if (crossings.length < 2) continue;
        crossings.sort((a, b) => a.x - b.x);

        let winding = 0;
        for (let i = 0; i < crossings.length - 1; i += 1) {
          winding += crossings[i]!.dir;
          if (winding === 0) continue;
          addSpan(row, crossings[i]!.x, crossings[i + 1]!.x, weight, size);
        }
      }
      const base = py * size;
      for (let px = 0; px < size; px += 1) {
        const value = Math.min(1, row[px]!);
        if (value > cov[base + px]!) cov[base + px] = value;
      }
    }
  }
  return cov;
}

/** Adds `weight * horizontal overlap` of [x0, x1) to every pixel it touches. */
function addSpan(row: Float32Array, x0: number, x1: number, weight: number, size: number): void {
  const left = Math.max(0, x0);
  const right = Math.min(size, x1);
  if (right <= left) return;
  const first = Math.floor(left);
  const last = Math.min(size - 1, Math.ceil(right) - 1);
  for (let px = first; px <= last; px += 1) {
    const overlap = Math.min(px + 1, right) - Math.max(px, left);
    if (overlap > 0) row[px] = row[px]! + overlap * weight;
  }
}

/** Non-premultiplied float RGBA canvas. */
class Canvas {
  readonly size: number;
  private readonly px: Float32Array;

  constructor(size: number, background: RGB | null) {
    this.size = size;
    this.px = new Float32Array(size * size * 4);
    if (background) {
      for (let i = 0; i < size * size; i += 1) {
        this.px[i * 4] = background[0] / 255;
        this.px[i * 4 + 1] = background[1] / 255;
        this.px[i * 4 + 2] = background[2] / 255;
        this.px[i * 4 + 3] = 1;
      }
    }
  }

  /** Source-over composite of a flat colour masked by `cov`. */
  fill(polygons: readonly Polygon[], color: RGB): void {
    const cov = coverage(polygons, this.size);
    const [sr, sg, sb] = [color[0] / 255, color[1] / 255, color[2] / 255];
    for (let i = 0; i < cov.length; i += 1) {
      const sa = cov[i]!;
      if (sa <= 0) continue;
      const o = i * 4;
      const da = this.px[o + 3]!;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) continue;
      this.px[o] = (sr * sa + this.px[o]! * da * (1 - sa)) / outA;
      this.px[o + 1] = (sg * sa + this.px[o + 1]! * da * (1 - sa)) / outA;
      this.px[o + 2] = (sb * sa + this.px[o + 2]! * da * (1 - sa)) / outA;
      this.px[o + 3] = outA;
    }
  }

  toRGBA8(): Uint8Array {
    const out = new Uint8Array(this.px.length);
    for (let i = 0; i < this.px.length; i += 1) out[i] = Math.round(Math.min(1, Math.max(0, this.px[i]!)) * 255);
    return out;
  }
}

// ── PNG encoder (colour type 6, filter 0, zlib IDAT) ─────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, Buffer.from(data), tail]);
}

function encodePng(rgba: Uint8Array, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ── the icon set ─────────────────────────────────────────────────────────────

interface IconSpec {
  file: string;
  size: number;
  /** Canvas background, or null for transparent. */
  background: RGB | null;
  /** Plate inset as a fraction of the canvas; 0 means full bleed. */
  inset: number;
  /** Corner radius as a fraction of the plate; 0 means square. */
  radius: number;
  /** Glyph height as a fraction of the canvas. */
  glyph: number;
}

const ICONS: readonly IconSpec[] = [
  // `purpose: any` — the rounded plate IS the icon silhouette.
  { file: 'icon-192.png', size: 192, background: null, inset: 0, radius: 0.22, glyph: 0.56 },
  { file: 'icon-512.png', size: 512, background: null, inset: 0, radius: 0.22, glyph: 0.56 },
  // `purpose: maskable` — full bleed, glyph inside the 80% safe zone.
  { file: 'maskable-192.png', size: 192, background: ACCENT, inset: 0, radius: 0, glyph: 0.44 },
  { file: 'maskable-512.png', size: 512, background: ACCENT, inset: 0, radius: 0, glyph: 0.44 },
  // iOS applies its own mask, so keep a light margin on the app background.
  { file: 'apple-touch-icon.png', size: 180, background: BG, inset: 0.07, radius: 0.24, glyph: 0.5 },
];

function render(spec: IconSpec): Buffer {
  const { size, inset, radius, glyph } = spec;
  const canvas = new Canvas(size, spec.background);

  const pad = Math.round(size * inset);
  const plate = size - pad * 2;
  if (spec.background !== ACCENT) {
    canvas.fill([roundedRect(pad, pad, plate, plate, plate * radius)], ACCENT);
  }
  canvas.fill(placeK(size / 2, size / 2, size * glyph), INK);

  return encodePng(canvas.toRGBA8(), size);
}

/** The same mark as SVG, for `<link rel="icon" type="image/svg+xml">`. */
function renderSvg(size = 512): string {
  const pathOf = (poly: Polygon) =>
    `M${poly.map(([x, y]) => `${round(x)},${round(y)}`).join('L')}Z`;
  const round = (n: number) => Math.round(n * 100) / 100;
  const plate = roundedRect(0, 0, size, size, size * 0.22);
  const glyph = placeK(size / 2, size / 2, size * 0.56);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Kno-Notes">`,
    `  <path d="${pathOf(plate)}" fill="#17756b"/>`,
    `  <path d="${glyph.map(pathOf).join('')}" fill="#ffffff" fill-rule="nonzero"/>`,
    '</svg>',
    '',
  ].join('\n');
}

function main(): void {
  const out = path.resolve('public/icons');
  mkdirSync(out, { recursive: true });

  for (const spec of ICONS) {
    const png = render(spec);
    writeFileSync(path.join(out, spec.file), png);
    process.stdout.write(`wrote public/icons/${spec.file} (${spec.size}×${spec.size}, ${png.length} B)\n`);
  }

  writeFileSync(path.join(out, 'icon.svg'), renderSvg());
  process.stdout.write('wrote public/icons/icon.svg\n');
}

main();
