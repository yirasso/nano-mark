/**
 * Generates the app icon from scratch: a rounded accent tile carrying three
 * white bars, the same "document reduced to its text" idea the UI is built on.
 *
 * Run with `npm run icon`. Output lands in build/ and is committed, so a normal
 * `npm run build:win` never has to regenerate it.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ACCENT = [74, 108, 247]
const ACCENT_DEEP = [58, 84, 214]
const WHITE = [255, 255, 255]

/* ---------- drawing ---------- */

function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  // Distance to the rounded rectangle, sampled for a soft one-pixel edge.
  const cx = Math.max(left + radius, Math.min(x, right - radius))
  const cy = Math.max(top + radius, Math.min(y, bottom - radius))
  const dx = x - cx
  const dy = y - cy
  const distance = Math.hypot(dx, dy) - radius
  return Math.max(0, Math.min(1, 0.5 - distance))
}

function blend(dst, index, color, alpha) {
  if (alpha <= 0) return
  const inverse = 1 - alpha
  dst[index] = color[0] * alpha + dst[index] * inverse
  dst[index + 1] = color[1] * alpha + dst[index + 1] * inverse
  dst[index + 2] = color[2] * alpha + dst[index + 2] * inverse
  dst[index + 3] = 255 * alpha + dst[index + 3] * inverse
}

function drawIcon(size) {
  const pixels = new Float64Array(size * size * 4)
  const unit = size / 256

  const inset = 16 * unit
  const tileRadius = 58 * unit

  // Bars: full, full, three-quarters. Reads as text without needing a font.
  const bars = [
    { top: 88, height: 15, left: 62, right: 194 },
    { top: 127, height: 15, left: 62, right: 194 },
    { top: 166, height: 15, left: 62, right: 152 }
  ]

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const px = x + 0.5
      const py = y + 0.5

      const tile = roundedRectCoverage(px, py, inset, inset, size - inset, size - inset, tileRadius)
      if (tile <= 0) continue

      // A soft vertical gradient keeps the tile from reading as flat plastic.
      const mix = (y / size) * 0.85
      const base = [
        ACCENT[0] * (1 - mix) + ACCENT_DEEP[0] * mix,
        ACCENT[1] * (1 - mix) + ACCENT_DEEP[1] * mix,
        ACCENT[2] * (1 - mix) + ACCENT_DEEP[2] * mix
      ]
      blend(pixels, index, base, tile)

      for (const bar of bars) {
        const coverage = roundedRectCoverage(
          px,
          py,
          bar.left * unit,
          bar.top * unit,
          bar.right * unit,
          (bar.top + bar.height) * unit,
          (bar.height / 2) * unit
        )
        blend(pixels, index, WHITE, coverage * tile)
      }
    }
  }

  const out = Buffer.alloc(size * size * 4)
  for (let i = 0; i < out.length; i += 1) out[i] = Math.round(pixels[i])
  return out
}

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(rgba, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- ICO ---------- */

function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((entry, i) => {
    const at = i * 16
    directory[at] = entry.size >= 256 ? 0 : entry.size
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size
    directory[at + 2] = 0
    directory[at + 3] = 0
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(entry.png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)])
}

/* ---------- main ---------- */

const outDir = resolve('build')
mkdirSync(outDir, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256]
const entries = sizes.map((size) => ({ size, png: encodePng(drawIcon(size), size) }))

writeFileSync(resolve(outDir, 'icon.ico'), encodeIco(entries))
writeFileSync(resolve(outDir, 'icon.png'), entries[entries.length - 1].png)

console.log('wrote build/icon.ico and build/icon.png')
