// GPS: rute lewat jalan menuju tujuan aktif.
// Graf dibuat dari titik-titik di sepanjang garis tengah tiap jalan; jalan yang bersilangan disambung
// di titik yang berdekatan. Rute dicari dengan A*. Tujuan di luar jalan (gubuk di lereng) disambung
// dari titik jalan terdekat yang tidak lebih rendah dari tujuannya (van tidak bisa memanjat undakan).
import { resample, distance } from './geometry.js';

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(node, priority) {
    const a = this.items;
    a.push({ node, priority });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= a[i].priority) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority < a[m].priority) m = l;
        if (r < a.length && a[r].priority < a[m].priority) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.node;
  }
}

export function buildRoadGraph(world, { nodeSpacing = 4, linkDistance = 6 } = {}) {
  const nodes = [];
  const edges = [];
  const link = (a, b) => {
    const d = distance(nodes[a], nodes[b]);
    edges[a].push({ to: b, cost: d });
    edges[b].push({ to: a, cost: d });
  };
  for (const road of world.roads) {
    const pts = resample(road.points, nodeSpacing, road.closed);
    const first = nodes.length;
    for (const p of pts) {
      nodes.push({ x: p.x, z: p.z, h: world.heightAt(p.x, p.z), road });
      edges.push([]);
    }
    for (let i = first + 1; i < nodes.length; i++) link(i - 1, i);
    if (road.closed && pts.length > 2) link(nodes.length - 1, first);
  }
  // Sambungkan jalan yang bersilangan/bertemu (titik berdekatan dari jalan berbeda).
  const cell = linkDistance;
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  nodes.forEach((n, i) => {
    const k = key(n.x, n.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  nodes.forEach((n, i) => {
    const cx = Math.floor(n.x / cell);
    const cz = Math.floor(n.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i || nodes[j].road === n.road) continue;
          if (distance(n, nodes[j]) <= linkDistance) link(i, j);
        }
      }
    }
  });
  return { nodes, edges, grid, cell };
}

// Titik jalan di sekitar (x, z), terdekat dulu.
function nearbyNodes(graph, x, z, radius, filter = () => true) {
  const out = [];
  const r = Math.ceil(radius / graph.cell);
  const cx = Math.floor(x / graph.cell);
  const cz = Math.floor(z / graph.cell);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (const i of graph.grid.get(`${cx + dx},${cz + dz}`) ?? []) {
        const n = graph.nodes[i];
        const d = Math.hypot(n.x - x, n.z - z);
        if (d <= radius && filter(n)) out.push({ i, d });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

function connectors(graph, x, z, filter) {
  for (const radius of [15, 40, 90, 200]) {
    const found = nearbyNodes(graph, x, z, radius, filter);
    if (found.length) return found.slice(0, 6);
  }
  return [];
}

// Rute dari `from` ke `to` (titik dunia). Mengembalikan daftar titik, atau null.
export function findRoute(graph, from, to, { offroadPenalty = 1.6, heightAt } = {}) {
  const starts = connectors(graph, from.x, from.z, () => true);
  // Jangan sambungkan tujuan dari jalan yang lebih rendah darinya (tidak bisa memanjat undakan).
  const targetH = heightAt ? heightAt(to.x, to.z) : 0;
  const ends = connectors(graph, to.x, to.z, (n) => n.h >= targetH - 0.5);
  if (!starts.length || !ends.length) return null;
  const endCost = new Map(ends.map((e) => [e.i, e.d * offroadPenalty]));
  const g = new Map();
  const came = new Map();
  const heap = new MinHeap();
  const h = (i) => Math.hypot(graph.nodes[i].x - to.x, graph.nodes[i].z - to.z);
  for (const s of starts) {
    const cost = s.d * offroadPenalty;
    g.set(s.i, cost);
    heap.push(s.i, cost + h(s.i));
  }
  let best = null;
  let bestCost = Infinity;
  while (heap.size) {
    const i = heap.pop();
    const gi = g.get(i);
    if (gi + h(i) >= bestCost) break;
    if (endCost.has(i) && gi + endCost.get(i) < bestCost) {
      bestCost = gi + endCost.get(i);
      best = i;
    }
    for (const { to: j, cost } of graph.edges[i]) {
      const ng = gi + cost;
      if (ng < (g.get(j) ?? Infinity)) {
        g.set(j, ng);
        came.set(j, i);
        heap.push(j, ng + h(j));
      }
    }
  }
  if (best === null) return null;
  const path = [];
  for (let i = best; i !== undefined; i = came.get(i)) path.push({ x: graph.nodes[i].x, z: graph.nodes[i].z });
  path.reverse();
  return [{ x: from.x, z: from.z }, ...path, { x: to.x, z: to.z }];
}

export function routeLength(route) {
  let sum = 0;
  for (let i = 1; i < route.length; i++) sum += distance(route[i - 1], route[i]);
  return sum;
}

// Navigator: memilih tujuan aktif dan menghitung ulang rute secara berkala.
export class Navigator {
  constructor(world, cfg) {
    this.world = world;
    this.cfg = cfg;
    this.enabled = cfg.enabled;
    this.graph = null; // dibuat saat pertama dipakai
    this.route = [];
    this.target = null;
    this.timer = 0;
  }

  // Prioritas: badai → HQ; paket kilat; tujuan paket terdekat; paket Zeus yang menunggu; HQ setelah senja;
  // selain itu paket terdekat untuk diambil.
  pickTarget(game) {
    const { car, packages, clock } = game;
    const hq = game.world.hq.spawn;
    // Hari Pelatihan: langkah tutorial boleh menentukan tujuannya sendiri (penanda, HQ).
    if (game.mode === 'tutorial' && game.tutorial?.target) return { ...game.tutorial.target };
    if (clock.phase === 'storm' || clock.phase === 'limit') return game.inHQ ? null : { ...hq, kind: 'hq', label: 'HQ' };
    const express = packages.cargo.find((p) => p.type === 'express' && !p.late);
    if (express) return { ...express.dest, kind: 'express', label: express.dest.name, pkg: express, deliver: true };
    if (packages.cargo.length) {
      const pkg = packages.cargo.reduce((a, b) => (distance(b.dest, car) < distance(a.dest, car) ? b : a));
      return { ...pkg.dest, kind: pkg.type === 'zeus' ? 'zeus' : 'dest', label: pkg.dest.name, pkg, deliver: true };
    }
    const zeus = packages.waiting.find((p) => p.type === 'zeus');
    if (zeus && game.run.scripted) return { ...zeus.pickup, kind: 'zeus', label: 'Paket Zeus', pkg: zeus, deliver: false };
    if (clock.phase === 'dusk') return game.inHQ ? null : { ...hq, kind: 'hq', label: 'HQ' };
    const waiting = packages.waiting.reduce((a, b) => (!a || distance(b.pickup, car) < distance(a.pickup, car) ? b : a), null);
    return waiting ? { ...waiting.pickup, kind: 'pickup', label: waiting.pickup.name, pkg: waiting, deliver: false } : null;
  }

  // Tujuan aktif selalu dihitung (dipakai strip objektif di HUD); rute hanya saat GPS menyala.
  update(dt, game) {
    this.timer -= dt;
    const target = this.pickTarget(game);
    const changed = (target?.x ?? null) !== (this.target?.x ?? null) || (target?.z ?? null) !== (this.target?.z ?? null);
    this.target = target;
    if (!this.enabled) {
      this.route = [];
      return;
    }
    if (!changed && this.timer > 0) return;
    this.timer = this.cfg.recompute;
    const { car } = game;
    if (!target || Math.hypot(target.x - car.x, target.z - car.z) < 8) {
      this.route = [];
      return;
    }
    this.graph ??= buildRoadGraph(this.world, this.cfg);
    this.route = findRoute(this.graph, car, target, { offroadPenalty: this.cfg.offroadPenalty, heightAt: this.world.heightAt }) ?? [];
  }
}
