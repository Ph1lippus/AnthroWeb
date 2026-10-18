/**
 * Builds the maskable PWA icon from the icon that already exists.
 *
 * ## Why this exists
 *
 * `android-chrome-512x512.png` is the artwork with its shape already baked in: a
 * black squircle with transparent corners, and the logo filling most of the square.
 * That is the right file for a plain `purpose: "any"` icon and the wrong one for
 * `purpose: "maskable"`.
 *
 * A maskable icon is not displayed. Android draws its own mask over it -- a circle
 * on most launchers, a squircle on Pixel -- and guarantees only that the centre
 * **80%** stays visible. Two things in the source file break that guarantee:
 *
 *  - The logo spans ~76% of the square width. A circular mask leaves a 409px visible
 *    circle at 512, so the outer tips of the glitch lettering sit right on the edge
 *    and get clipped on a circle launcher.
 *  - The corners are transparent, and the icon is otherwise black. Whatever the
 *    launcher paints behind a transparent corner shows through, so the same app
 *    gets a light halo on a light wallpaper.
 *
 * So a maskable icon has to be **full-bleed** (opaque, edge to edge, no baked-in
 * shape) with the logo scaled into the safe zone. That cannot be done by declaring
 * the existing file a second time -- it has to be a different bitmap, and there is
 * no image library in this project to make one.
 *
 * ## Why a script rather than a committed binary
 *
 * So the icon is regenerable and its provenance is readable, which is the same
 * reason every other artefact here is built by something in `scripts/`. The
 * artwork is the source of truth; this derives the one variant that has to differ.
 *
 *     node scripts/generate-maskable-icon.mjs
 *
 * Output: `public/android-chrome-maskable-512x512.png`
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = join(root, 'public', 'android-chrome-512x512.png');
const OUTPUT = join(root, 'public', 'android-chrome-maskable-512x512.png');

/** The colour the icon is composited onto: the app's own background. */
const BACKGROUND = [0, 0, 0];

/**
 * The fraction of the canvas Android guarantees to leave alone.
 *
 * The spec calls this the "safe zone" and every platform agrees on 80%. Slightly
 * under is deliberate: a squircle mask on a Pixel is not a circle, and a logo sized
 * to exactly 80% of the width has its corners outside the inscribed circle even
 * when the launcher itself would have kept them.
 */
const SAFE_FRACTION = 0.72;

/**
 * How quickly a pixel's greenness becomes full coverage.
 *
 * The mark's green sits at roughly (0, 255, 166), so its greenness is about 89 --
 * green minus the *larger* of the other two channels, which is why the test is not
 * simply "is it green" (that would reject any colour where blue leads). A ramp of 60
 * puts the solid interior comfortably at full coverage while still spending most of
 * the range on the antialiased edge, which is what keeps the letterforms smooth
 * instead of stair-stepped.
 */
const COVERAGE_RAMP = 60;

// ============================================================================
// PNG
// ============================================================================

/**
 * Enough PNG to move pixels between two files.
 *
 * Handles the subset this project actually emits -- 8-bit RGB and RGBA,
 * non-interlaced -- and refuses anything else rather than silently producing wrong
 * colours, which is the failure mode a hand-rolled decoder is most likely to have.
 */

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

const crc32 = buffer => {
    let c = -1;
    for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Reverse the per-scanline filters PNG applies before compression. */
function unfilter(raw, width, height, channels) {
    const stride = width * channels;
    const out = Buffer.alloc(stride * height);
    let position = 0;

    for (let y = 0; y < height; y++) {
        const filter = raw[position++];
        const line = raw.subarray(position, position + stride);
        position += stride;
        const target = out.subarray(y * stride, (y + 1) * stride);
        const above = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

        for (let x = 0; x < stride; x++) {
            const rawByte = line[x];
            const a = x >= channels ? target[x - channels] : 0;
            const b = above ? above[x] : 0;
            const c = above && x >= channels ? above[x - channels] : 0;
            let value;
            switch (filter) {
                case 0: value = rawByte; break;
                case 1: value = rawByte + a; break;
                case 2: value = rawByte + b; break;
                case 3: value = rawByte + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    // The Paeth predictor picks whichever neighbour is closest to
                    // the linear estimate; ties resolve left, then above.
                    value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
                    break;
                }
                default:
                    throw new Error(`Unsupported PNG filter ${filter}`);
            }
            target[x] = value & 0xff;
        }
    }
    return out;
}

function decodePng(buffer) {
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG');

    let header = null;
    const idat = [];

    for (let offset = 8; offset + 8 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;

        if (type === 'IHDR') {
            header = {
                width: data.readUInt32BE(0),
                height: data.readUInt32BE(4),
                bitDepth: data[8],
                colorType: data[9],
                interlace: data[12],
            };
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }

    if (!header) throw new Error('PNG has no IHDR');
    if (header.bitDepth !== 8) throw new Error(`Unsupported bit depth ${header.bitDepth}`);
    if (header.interlace !== 0) throw new Error('Interlaced PNGs are not supported');
    if (header.colorType !== 6 && header.colorType !== 2) {
        throw new Error(`Unsupported colour type ${header.colorType}`);
    }

    const channels = header.colorType === 6 ? 4 : 3;
    const pixels = unfilter(inflateSync(Buffer.concat(idat)), header.width, header.height, channels);
    return { ...header, channels, pixels };
}

/** Straight (non-premultiplied) RGBA, whatever the source was. */
function toRgba(image) {
    if (image.channels === 4) return image.pixels;
    const out = Buffer.alloc(image.width * image.height * 4);
    for (let i = 0, o = 0; i < image.width * image.height; i++, o += 4) {
        const s = i * 3;
        out[o] = image.pixels[s];
        out[o + 1] = image.pixels[s + 1];
        out[o + 2] = image.pixels[s + 2];
        out[o + 3] = 255;
    }
    return out;
}

function encodePng(width, height, rgba) {
    const stride = width * 4;
    // Filter type 0 on every scanline. The output is a flat background with one
    // block of artwork, so there is nothing for a predictor to exploit and deflate
    // handles it well enough -- and it keeps this file free of the filter-selection
    // heuristics that would be the only genuinely fiddly part.
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([length, body, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace

    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ============================================================================
// COMPOSITE
// ============================================================================

const source = decodePng(readFileSync(SOURCE));
const rgba = toRgba(source);

/**
 * The logo's bounding box, found by colour rather than by alpha.
 *
 * An alpha bounding box would measure the black squircle and return the whole
 * canvas, because the artwork and its background are both fully opaque -- only the
 * rounded corners are transparent. The logo is the only saturated green in the
 * image, so thresholding on "green over both other channels" isolates it regardless
 * of what the background happens to be.
 */
let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        if (g - Math.max(r, b) <= 30) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
}
if (maxX < 0) throw new Error('Found no logo in the source icon');

// Fit the logo into the safe zone, preserving aspect, then centre it.
const logoWidth = maxX - minX + 1;
const logoHeight = maxY - minY + 1;
const target = Math.floor(Math.min(source.width, source.height) * SAFE_FRACTION);
const scale = Math.min(target / logoWidth, target / logoHeight);
const drawWidth = logoWidth * scale;
const drawHeight = logoHeight * scale;
// Where the logo's own top-left lands. The source coordinates below are absolute
// canvas coordinates, so this is the offset that puts *the bounding box* in the
// middle rather than the canvas it happens to sit in -- the logo is not centred in
// the source artwork, and centring the canvas would move it off-axis.
const originX = (source.width - drawWidth) / 2;
const originY = (source.height - drawHeight) / 2;

/**
 * How much of a pixel is logo.
 *
 * Not alpha. The source has no transparent artwork -- the logo is fully opaque green
 * sitting on an opaque black field, and only the rounded corners are transparent --
 * so alpha carries the logo's *shape* but not its edge softness, and thresholding on
 * it would both ignore the antialiasing and preserve the corner geometry a maskable
 * icon must not have.
 *
 * Instead, the logo is isolated by colour and used as its own coverage, ramped rather
 * than cut. That does two things at once. It keeps the antialiased letter edges
 * smooth, where a hard cutoff would alias them into stair-steps. And it drops the
 * source's film grain, which is white dust on the black field: a straight copy would
 * leave that dust inside the rectangle this draws into and nowhere else, and a patch
 * of noise around the logo on an otherwise clean black square reads as a rendering
 * fault rather than as texture. The grain is not part of the mark.
 *
 * The glitch lettering's own black scanline breaks survive this untouched -- they are
 * black, so they contribute no coverage and stay black.
 */
const coverage = (r, g, b) => {
    const greenness = g - Math.max(r, b);
    return Math.max(0, Math.min(1, greenness / COVERAGE_RAMP));
};

/**
 * Colour of a pixel, pre-multiplied by its own coverage so bilinear interpolation
 * cannot drag the black field's colour into the edge of a letter.
 */
function sample(x, y) {
    const px = Math.min(source.width - 1, Math.max(0, x));
    const py = Math.min(source.height - 1, Math.max(0, y));
    const i = (Math.round(py) * source.width + Math.round(px)) * 4;
    const cov = coverage(rgba[i], rgba[i + 1], rgba[i + 2]);
    return [rgba[i] * cov, rgba[i + 1] * cov, rgba[i + 2] * cov, cov];
}

const out = Buffer.alloc(source.width * source.height * 4);
for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        // Destination -> absolute source coordinates.
        const u = minX + (x - originX) / scale;
        const v = minY + (y - originY) / scale;

        let r = 0, g = 0, b = 0;
        if (u >= minX - 1 && v >= minY - 1 && u <= maxX + 1 && v <= maxY + 1) {
            const x0 = Math.floor(u), y0 = Math.floor(v);
            const fx = u - x0, fy = v - y0;
            const p00 = sample(x0, y0), p10 = sample(x0 + 1, y0);
            const p01 = sample(x0, y0 + 1), p11 = sample(x0 + 1, y0 + 1);
            const mix = (a, c) => a * (1 - fx) + c * fx;
            r = mix(p00[0], p10[0]) * (1 - fy) + mix(p01[0], p11[0]) * fy;
            g = mix(p00[1], p10[1]) * (1 - fy) + mix(p01[1], p11[1]) * fy;
            b = mix(p00[2], p10[2]) * (1 - fy) + mix(p01[2], p11[2]) * fy;
        }

        // Opaque everywhere: a maskable icon must be full-bleed, or the launcher's
        // wallpaper shows through the corners its mask does not cover.
        out[i] = Math.round(BACKGROUND[0] + r);
        out[i + 1] = Math.round(BACKGROUND[1] + g);
        out[i + 2] = Math.round(BACKGROUND[2] + b);
        out[i + 3] = 255;
    }
}

writeFileSync(OUTPUT, encodePng(source.width, source.height, out));

console.log(
    `Wrote ${OUTPUT.replace(root + '\\', '')}\n`
    + `  logo ${logoWidth}x${logoHeight} -> ${Math.round(drawWidth)}x${Math.round(drawHeight)} `
    + `(${(scale * 100).toFixed(1)}%) inside a ${Math.round(source.width * SAFE_FRACTION)}px safe zone`,
);