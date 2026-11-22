// Système solaire + un trou noir de passage : N corps newtoniens, saute-mouton, pas réglé sur la paire la plus serrée.
// Unités : UA, année, masse solaire (G = 4π²). Plan de l'écliptique = xz, y vers le nord. Orbites de départ circulaires et coplanaires.
export const G = 4 * Math.PI * Math.PI, KMS = 4.740470; // 1 UA/an = 4,74 km/s
export const BODIES = [
  { id: 'sun', m: 1, a: 0 }, { id: 'mercury', m: 1.660e-7, a: 0.3871, ph: 1.0 }, { id: 'venus', m: 2.448e-6, a: 0.7233, ph: 4.1 }, { id: 'earth', m: 3.003e-6, a: 1, ph: 0 },
  { id: 'moon', m: 3.694e-8, a: 0.002570, ph: 2.0, around: 3 }, { id: 'mars', m: 3.227e-7, a: 1.5237, ph: 5.2 }, { id: 'jupiter', m: 9.545e-4, a: 5.2028, ph: 2.6 },
  { id: 'saturn', m: 2.858e-4, a: 9.5388, ph: 0 }, { id: 'uranus', m: 4.366e-5, a: 19.191, ph: 0.9 }, { id: 'neptune', m: 5.151e-5, a: 30.069, ph: 3.7 }, { id: 'bh', m: 0.05 },
];
export const IDX = Object.fromEntries(BODIES.map((b, i) => [b.id, i]));
// P : { mbh, vbh (UA/an), back, side (ou cross : [x, z], point où il traverse le plan), yoff, tiltX, tiltZ (trajectoire du trou noir), inertial, T0 (années avant le passage), T1, earthPh, sample (jours entre deux échantillons), eta }
export function simulate(P) {
  const n = BODIES.length, m = BODIES.map(b => b.m); m[IDX.bh] = P.mbh;
  const x = new Float64Array(n * 3), v = new Float64Array(n * 3), a = new Float64Array(n * 3);
  for (let i = 1; i < n - 1; i++) {
    const b = BODIES[i], c = b.around || 0, mu = G * (m[c] + m[i]), w = Math.sqrt(mu / (b.a * b.a * b.a));
    // phase au moment du passage (t = 0), ramenée au départ
    const ph = (b.id === 'earth' ? P.earthPh : b.ph) - w * P.T0 * (b.around ? 1 : 1), cs = Math.cos(ph), sn = Math.sin(ph), vv = w * b.a;
    x[i * 3] = b.a * cs; x[i * 3 + 2] = -b.a * sn; v[i * 3] = -vv * sn; v[i * 3 + 2] = -vv * cs;
    if (c) { for (let k = 0; k < 3; k++) { x[i * 3 + k] += x[c * 3 + k]; v[i * 3 + k] += v[c * 3 + k]; } }
  }
  // le trou noir : traverse l'écliptique à t = 0, « back » UA derrière Saturne sur son orbite
  const S = BODIES[IDX.saturn], bi = IDX.bh, cx = P.cross ? P.cross[0] : S.a - P.side, cz = P.cross ? P.cross[1] : P.back; // Saturne est en (a,0,0) à t=0 et avance vers −z
  const dir = [P.tiltX || 0, -1, P.tiltZ || 0], dl = Math.sqrt(dir[0] * dir[0] + 1 + dir[2] * dir[2]); for (let k = 0; k < 3; k++) dir[k] /= dl;
  x[bi * 3] = cx - dir[0] * P.vbh * P.T0; x[bi * 3 + 1] = (P.yoff || 0) - dir[1] * P.vbh * P.T0; x[bi * 3 + 2] = cz - dir[2] * P.vbh * P.T0;
  v[bi * 3] = dir[0] * P.vbh; v[bi * 3 + 1] = dir[1] * P.vbh; v[bi * 3 + 2] = dir[2] * P.vbh;
  let tmin2 = 1;
  const acc = () => {
    a.fill(0); tmin2 = 1e9;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = x[j * 3] - x[i * 3], dy = x[j * 3 + 1] - x[i * 3 + 1], dz = x[j * 3 + 2] - x[i * 3 + 2], r2 = dx * dx + dy * dy + dz * dz, r3 = r2 * Math.sqrt(r2), f = G / r3, td = r3 / (G * (m[i] + m[j]));
      if (td < tmin2) tmin2 = td;
      a[i * 3] += f * m[j] * dx; a[i * 3 + 1] += f * m[j] * dy; a[i * 3 + 2] += f * m[j] * dz; a[j * 3] -= f * m[i] * dx; a[j * 3 + 1] -= f * m[i] * dy; a[j * 3 + 2] -= f * m[i] * dz;
    }
  };
  const H = (P.sample || 1) / 365.25, eta = P.eta || 0.02, ns = Math.floor((P.T0 + P.T1) / H) + 1, N3 = n * 3; let steps = 0, minEM = 9;
  const X = new Float64Array(ns * N3), V = new Float64Array(ns * N3), rel = P.inertial ? 0 : 1; // inertial : repère fixe de départ, sinon positions relatives au Soleil
  acc();
  for (let s = 0; s < ns; s++) {
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { X[s * N3 + i * 3 + k] = x[i * 3 + k] - rel * x[k]; V[s * N3 + i * 3 + k] = v[i * 3 + k] - rel * v[k]; }
    for (let left = H; left > 1e-12;) {
      let h = eta * Math.sqrt(tmin2); if (h >= left) h = left; else if (h > left * 0.5) h = left * 0.5; left -= h; steps++;
      for (let q = 0; q < N3; q++) { v[q] += 0.5 * h * a[q]; x[q] += h * v[q]; }
      acc(); for (let q = 0; q < N3; q++) v[q] += 0.5 * h * a[q];
      const ex = x[9] - x[12], ey = x[10] - x[13], ez = x[11] - x[14], em = ex * ex + ey * ey + ez * ez; if (em < minEM) minEM = em;
    }
  }
  return { X, V, ns, n, step: H, t0: -P.T0, m, steps, minEM: Math.sqrt(minEM) };
}
// éléments de l'orbite autour du Soleil (ou d'un autre corps) à partir d'une position et d'une vitesse relatives
export function elements(rx, ry, rz, vx, vy, vz, mu) {
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, E = v2 / 2 - mu / r, hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx, h2 = hx * hx + hy * hy + hz * hz;
  const a = -mu / (2 * E), e = Math.sqrt(Math.max(0, 1 + 2 * E * h2 / (mu * mu)));
  return { a, e, q: a * (1 - e), Q: a * (1 + e), P: a > 0 ? Math.sqrt(a * a * a / (mu / G)) : Infinity, inc: Math.acos(Math.abs(hy) / Math.sqrt(h2)) };
}
