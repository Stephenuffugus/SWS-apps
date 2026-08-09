/* A real QR decoder, for tests only.
   ─────────────────────────────────────────────────────────────────────────
   The existing tests asserted on the SVG *string* — its prefix, its length,
   its viewBox — which is why the UTF-8 bug survived them: 'Café' produced a
   perfectly well-formed SVG of a perfectly valid code containing the wrong
   bytes. The only assertion that can see that class of defect is one that
   reads the modules back out and reconstructs the string.

   This walks the symbol the way a scanner does: reserve the function
   patterns, read the format info for the mask, undo the mask, follow the
   zigzag, then parse the byte-mode segment header. No error correction and no
   de-interleaving, so it is restricted to single-RS-block symbols and refuses
   loudly outside them rather than returning plausible garbage. */

// Number of RS blocks, versions 1–10 × [L, M, Q, H].
const BLOCKS = {
  1: { L: 1, M: 1, Q: 1, H: 1 },
  2: { L: 1, M: 1, Q: 1, H: 1 },
  3: { L: 1, M: 1, Q: 2, H: 2 },
  4: { L: 1, M: 2, Q: 2, H: 4 },
  5: { L: 1, M: 2, Q: 4, H: 4 },
  6: { L: 1, M: 2, Q: 4, H: 4 },
  7: { L: 2, M: 4, Q: 6, H: 5 },
  8: { L: 2, M: 4, Q: 6, H: 6 },
  9: { L: 2, M: 5, Q: 8, H: 8 },
  10: { L: 4, M: 5, Q: 8, H: 8 },
};

// Alignment-pattern centre coordinates, versions 1–10.
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// EC level bits in the format information: L=01, M=00, Q=11, H=10.
const EC_BITS = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

function maskAt(pattern, i, j) {
  switch (pattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default: throw new Error('bad mask ' + pattern);
  }
}

function reservedMap(n, version) {
  const res = Array.from({ length: n }, () => new Array(n).fill(false));
  const probe = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      if (row + r < 0 || row + r >= n) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c < 0 || col + c >= n) continue;
        res[row + r][col + c] = true;
      }
    }
  };
  probe(0, 0); probe(n - 7, 0); probe(0, n - 7);

  // Timing patterns occupy the whole of row 6 and column 6.
  for (let i = 0; i < n; i++) { res[6][i] = true; res[i][6] = true; }

  // Alignment patterns, skipping any that collide with a finder.
  const pos = ALIGN[version] || [];
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) res[r + dr][c + dc] = true;
    }
  }

  // Format information (both copies) and the always-dark module.
  for (let i = 0; i <= 8; i++) { res[8][i] = true; res[i][8] = true; }
  for (let i = 0; i < 8; i++) { res[8][n - 1 - i] = true; res[n - 1 - i][8] = true; }
  res[n - 8][8] = true;

  // Version information, present from version 7 up.
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      res[n - 11 + j][i] = true;
      res[i][n - 11 + j] = true;
    }
  }
  return res;
}

function readFormat(qr, n) {
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    let r;
    if (i < 6) r = i;
    else if (i < 8) r = i + 1;
    else r = n - 15 + i;
    if (qr.isDark(r, 8)) bits |= (1 << i);
  }
  const data = ((bits ^ 0x5412) >> 10) & 0x1f;
  return { ec: EC_BITS[(data >> 3) & 3], mask: data & 7 };
}

/**
 * Decode a made qrcode-generator symbol back to the string it carries.
 * Throws with a specific reason rather than guessing.
 */
export function decodeQr(qr) {
  const n = qr.getModuleCount();
  const version = (n - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 10) {
    throw new Error('test decoder handles versions 1–10, got module count ' + n);
  }
  const { ec, mask } = readFormat(qr, n);
  const blocks = BLOCKS[version][ec];
  if (blocks !== 1) {
    throw new Error(
      'test decoder handles single-RS-block symbols only; version ' + version +
      ' at EC ' + ec + ' has ' + blocks + ' blocks. Use a shorter payload or EC "L".');
  }

  const res = reservedMap(n, version);
  const bits = [];
  let inc = -1;
  let row = n - 1;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (!res[row][cc]) {
          let dark = qr.isDark(row, cc);
          if (maskAt(mask, row, cc)) dark = !dark;
          bits.push(dark ? 1 : 0);
        }
      }
      row += inc;
      if (row < 0 || row >= n) { row -= inc; inc = -inc; break; }
    }
  }

  let p = 0;
  const take = (k) => {
    let v = 0;
    for (let i = 0; i < k; i++) {
      if (p >= bits.length) throw new Error('ran off the end of the symbol');
      v = (v << 1) | bits[p++];
    }
    return v;
  };
  const mode = take(4);
  if (mode !== 4) throw new Error('expected 8-bit byte mode (0100), read mode ' + mode.toString(2));
  const len = take(version <= 9 ? 8 : 16);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = take(8);
  return {
    text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    bytes: Array.from(bytes),
    version, ec, mask, modules: n,
  };
}
