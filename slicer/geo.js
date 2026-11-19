// AI slicer — geometry checks done in code (not guessed by the AI). Pure functions on a flat triangle list:
// 9 numbers per triangle (x,y,z of 3 vertices), millimetres, Z up. Shared by the page and node unit tests (no browser APIs here).
export const OVERHANG_DEG = 40;                    // house rule: a surface more than 40° from vertical is an overhang
const SIN_OVER = Math.sin(OVERHANG_DEG * Math.PI / 180);
const BED_TOL = 0.3;                               // mm: a triangle this close to the plate rests on it
export const DENSITY = { PLA: 1.24, 'PLA Silk': 1.24, 'PLA Matte': 1.24, 'PLA-CF': 1.29, PETG: 1.27, 'PETG-CF': 1.3, ASA: 1.07, ABS: 1.04, TPU: 1.21 };
export const MATERIALS = Object.keys(DENSITY);

// quarter turns: rx about X, then ry about Y (the 6 "which side is down" choices; turning about Z changes nothing here)
export const ORIENTATIONS = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 3]];
export function rotate(pos, rx, ry) {
  const out = new Float32Array(pos.length), nx = ((rx % 4) + 4) % 4, ny = ((ry % 4) + 4) % 4;
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2], t;
    for (let k = 0; k < nx; k++) { t = y; y = -z; z = t; }      // +90° about X: (x, y, z) → (x, −z, y)
    for (let k = 0; k < ny; k++) { t = x; x = z; z = -t; }      // +90° about Y: (x, y, z) → (z, y, −x)
    out[i] = x; out[i + 1] = y; out[i + 2] = z;
  }
  return out;
}

export function analyze(pos) {
  const n = pos.length / 9, mask = new Uint8Array(n);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  let vol = 0, area = 0, over = 0, bottom = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5], cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const a = len / 2; area += a;
    const down = -nz / len, onBed = Math.max(az, bz, cz) - lo[2] <= BED_TOL;
    if (onBed && down > 0.99) bottom += a;
    else if (down > SIN_OVER) { over += a; mask[t] = 1; }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    size: [0, 1, 2].map((k) => r1(hi[k] - lo[k])), min: lo,
    volume_cm3: r1(Math.abs(vol) / 1000), area_cm2: r1(area / 100),
    overhang_cm2: r1(over / 100), overhang_pct: area ? Math.round((over / area) * 1000) / 10 : 0,
    bottom_cm2: r1(bottom / 100), triangles: n, mask,
  };
}

// lowest overhang wins; nearly equal → bigger contact with the plate; then lower height
export function bestOrientation(pos) {
  let best = null;
  for (const [rx, ry] of ORIENTATIONS) {
    const s = analyze(rotate(pos, rx, ry));
    if (!best || better(s, best.s)) best = { rx, ry, s };
  }
  return best;
}
function better(a, b) {
  const tol = 0.02 * Math.max(a.area_cm2, 1);
  if (Math.abs(a.overhang_cm2 - b.overhang_cm2) > tol) return a.overhang_cm2 < b.overhang_cm2;
  if (Math.abs(a.bottom_cm2 - b.bottom_cm2) > 0.5) return a.bottom_cm2 > b.bottom_cm2;
  return a.size[2] < b.size[2];
}

export function fits(size, p) {
  const [x, y, z] = size;
  return z <= p.bed_z && ((x <= p.bed_x && y <= p.bed_y) || (y <= p.bed_x && x <= p.bed_y));
}

// rough filament estimate until the real slicer reports it: shell (walls) + infill share of the inside
export function estimateGrams(stats, s, material = 'PLA') {
  const shell = Math.min(stats.volume_cm3, stats.area_cm2 * (s.walls ?? 2) * 0.045);
  const cm3 = shell + (stats.volume_cm3 - shell) * ((s.infill_pct ?? 15) / 100);
  return Math.round(cm3 * (DENSITY[material] ?? 1.24) * 1.05);
}
