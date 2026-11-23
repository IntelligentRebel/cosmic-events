// Voie lactée et Andromède : deux halos qui s'attirent, des étoiles-tests qui suivent. Unités : kpc, milliard d'années.
import { rng } from './kit.js';
const Gc = 4.498e-6, KMS = 1.0227;
const GAL = [{ Mh: 1.25e12, ah: 32, Mb: 6e10, b: 2.6, Rd: 3.0, Rmax: 19, n: 12000 }, { Mh: 1.6e12, ah: 36, Mb: 8e10, b: 3.0, Rd: 5.0, Rmax: 27, n: 15000 }];
const encl = (g, d) => g.Mh * d * d / ((d + g.ah) * (d + g.ah)) + g.Mb * d * d * d / Math.pow(d * d + g.b * g.b, 1.5);
export function createSim(vtan, seed = 5, FR = 2.6, FD = 70, NS = 1) {
  const r = rng(seed), N = Math.round(GAL[0].n * NS) + Math.round(GAL[1].n * NS), pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), col = new Float32Array(N * 3), host = new Uint8Array(N);
  // repère galactique : x vers le centre vu du Soleil, z vers le pôle nord galactique
  const dir = [-0.479, 0.797, -0.368], sunP = [-8.2, 0, 0.02];
  const c = [{ p: [0, 0, 0], v: [0, 0, 0] }, { p: [sunP[0] + 780 * dir[0], sunP[1] + 780 * dir[1], sunP[2] + 780 * dir[2]], v: [0, 0, 0] }];
  const perp = (() => { const a = [dir[1], -dir[0], 0], l = Math.hypot(...a); return a.map(x => x / l); })();
  const d0 = Math.hypot(...c[1].p), rad = c[1].p.map(x => x / d0), mu = [GAL[1].Mh / (GAL[0].Mh + GAL[1].Mh), GAL[0].Mh / (GAL[0].Mh + GAL[1].Mh)];
  const vrel = rad.map((x, i) => (-110 * x + vtan * perp[i]) * KMS);
  c[0].v = vrel.map(x => -x * mu[0]); c[1].v = vrel.map(x => x * mu[1]);
  const basis = (n) => { const l = Math.hypot(...n); n = n.map(x => x / l); let a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; let e1 = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]]; const l1 = Math.hypot(...e1); e1 = e1.map(x => x / l1);
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]; return [e1, e2, n]; };
  const nM31 = [0.225 * dir[0] + 0.974 * perp[0] * 0.6 + 0.78, 0.225 * dir[1] + 0.974 * perp[1] * 0.6 - 0.1, 0.225 * dir[2] + 0.62];
  const B = [basis([0, 0, -1]), basis(nM31)];
  let k = 0, sunIdx = 0;
  for (let gi = 0; gi < 2; gi++) { const g = GAL[gi], [e1, e2, n] = B[gi];
    for (let i = 0; i < Math.round(g.n * NS); i++, k++) {
      host[k] = gi; const bulge = r() < 0.16; let x, y, z, vx, vy, vz;
      if (bulge) { const rr = 0.6 + 2.2 * Math.pow(r(), 1.5), th = Math.acos(2 * r() - 1), ph = r() * 6.2832; x = rr * Math.sin(th) * Math.cos(ph); y = rr * Math.sin(th) * Math.sin(ph); z = rr * Math.cos(th) * 0.7;
        const vc = Math.sqrt(Gc * encl(g, rr) / rr) * 0.75, t2 = Math.acos(2 * r() - 1), p2 = r() * 6.2832; vx = vc * Math.sin(t2) * Math.cos(p2); vy = vc * Math.sin(t2) * Math.sin(p2); vz = vc * Math.cos(t2);
        col.set([1, 0.82, 0.58], k * 3);
      } else { let R; do { R = -g.Rd * Math.log(1 - r() * 0.998); } while (R > g.Rmax || R < 0.9); if (gi === 0 && i === 0) R = 8.2;
        const ph = r() * 6.2832 + (gi === 0 && i === 0 ? 0 : 0), arm = 0.5 + 0.5 * Math.cos(2 * (ph - Math.log(R / g.Rd) * 2.2)); if (i > 0 && r() > 0.45 + 0.55 * arm) { i--; k--; continue; }
        x = R * Math.cos(ph); y = R * Math.sin(ph); z = (r() + r() + r() - 1.5) * 0.28; const vc = Math.sqrt(Gc * encl(g, R) / R);
        vx = -vc * Math.sin(ph) + (r() - 0.5) * 12; vy = vc * Math.cos(ph) + (r() - 0.5) * 12; vz = (r() - 0.5) * 8; const young = arm * r();
        col.set([0.75 + 0.25 * (1 - young), 0.8 + 0.1 * (1 - young), 0.85 + 0.15 * young], k * 3); }
      for (let a = 0; a < 3; a++) { pos[k * 3 + a] = c[gi].p[a] + x * e1[a] + y * e2[a] + z * n[a]; vel[k * 3 + a] = c[gi].v[a] + vx * e1[a] + vy * e2[a] + vz * n[a]; }
      if (gi === 0 && i === 0) { sunIdx = k; const s = Math.hypot(pos[k * 3], pos[k * 3 + 1]); }
    } }
  const DT = 0.003; let t = 0; const cps = [];
  const snap = () => ({ t, pos: pos.slice(), vel: vel.slice(), c: JSON.parse(JSON.stringify(c)) });
  function accC() { const d = [c[1].p[0] - c[0].p[0], c[1].p[1] - c[0].p[1], c[1].p[2] - c[0].p[2]], r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], dd = Math.sqrt(r2) + 1e-6;
    const f0 = Gc * encl(GAL[1], dd) / (dd * dd * dd), f1 = Gc * encl(GAL[0], dd) / (dd * dd * dd);
    const fr = FR / (1 + Math.pow(dd / FD, 3));          // frottement dynamique, ajusté pour une fusion après deux passages
    const a0 = [], a1 = []; for (let i = 0; i < 3; i++) { const dv = c[1].v[i] - c[0].v[i]; a0[i] = f0 * d[i] + fr * dv * mu[0]; a1[i] = -f1 * d[i] - fr * dv * mu[1]; } return [a0, a1, dd]; }
  function step() {
    const [a0, a1] = accC(); for (let i = 0; i < 3; i++) { c[0].v[i] += a0[i] * DT; c[1].v[i] += a1[i] * DT; c[0].p[i] += c[0].v[i] * DT; c[1].p[i] += c[1].v[i] * DT; }
    const g0 = GAL[0], g1 = GAL[1], p0 = c[0].p, p1 = c[1].p;
    for (let k = 0, j = 0; k < N; k++, j += 3) {
      const x = pos[j], y = pos[j + 1], z = pos[j + 2];
      let dx = x - p0[0], dy = y - p0[1], dz = z - p0[2], d2 = dx * dx + dy * dy + dz * dz + 0.02, d = Math.sqrt(d2), s = d + g0.ah;
      let q = d2 + g0.b * g0.b, f = -Gc * (g0.Mh / (d * s * s) + g0.Mb / (q * Math.sqrt(q))); let ax = f * dx, ay = f * dy, az = f * dz;
      dx = x - p1[0]; dy = y - p1[1]; dz = z - p1[2]; d2 = dx * dx + dy * dy + dz * dz + 0.02; d = Math.sqrt(d2); s = d + g1.ah;
      q = d2 + g1.b * g1.b; f = -Gc * (g1.Mh / (d * s * s) + g1.Mb / (q * Math.sqrt(q))); ax += f * dx; ay += f * dy; az += f * dz;
      vel[j] += ax * DT; vel[j + 1] += ay * DT; vel[j + 2] += az * DT; pos[j] += vel[j] * DT; pos[j + 1] += vel[j + 1] * DT; pos[j + 2] += vel[j + 2] * DT;
    }
    t += DT; if (t >= cps.length * 0.5 - 1e-9) cps.push(snap());
  }
  cps.push(snap());
  return { N, pos, vel, col, host, c, sunIdx, DT, get t() { return t; }, step,
    sep: () => Math.hypot(c[1].p[0] - c[0].p[0], c[1].p[1] - c[0].p[1], c[1].p[2] - c[0].p[2]),
    relv: () => Math.hypot(c[1].v[0] - c[0].v[0], c[1].v[1] - c[0].v[1], c[1].v[2] - c[0].v[2]) / KMS,
    rewind(target) { if (typeof window !== 'undefined') window.__rw = (window.__rw || 0) + 1; let b = cps[0]; for (const s of cps) if (s.t <= target + 1e-9) b = s; pos.set(b.pos); vel.set(b.vel); for (let i = 0; i < 2; i++) { c[i].p = b.c[i].p.slice(); c[i].v = b.c[i].v.slice(); } t = b.t; } };
}
