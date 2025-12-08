// ===================== Basic Geometry & Utils =====================

function sqr(x) { return x * x; }
function dist2(a, b) { return sqr(a.x - b.x) + sqr(a.y - b.y); }

function signedArea(vertices) {
  let A = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % n];
    A += p.x * q.y - q.x * p.y;
  }
  return 0.5 * A;
}

function isClockwise(vertices) {
  return signedArea(vertices) < 0;
}

function boundingBoxVertices(vertices) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of vertices) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

// cross product sign at B for triangle A-B-C
function cross(A, B, C) {
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const bcx = C.x - B.x;
  const bcy = C.y - B.y;
  return abx * bcy - aby * bcx;
}

// stroke simplification
function simplifyStroke(points, minDist = 3) {
  if (points.length <= 2) return points.slice();
  const out = [points[0]];
  let last = points[0];
  const md2 = minDist * minDist;
  for (const p of points) {
    if (dist2(p, last) >= md2) {
      out.push(p);
      last = p;
    }
  }
  if (out.length < 2) out.push(points[points.length - 1]);
  return out;
}

// stroke -> polygon (single loop)
function polygonFromStroke(stroke, closeThreshold = 10) {
  if (stroke.length < 3) return null;
  const simp = simplifyStroke(stroke, 4);
  if (simp.length < 3) return null;

  const v = simp.slice();
  const first = v[0], last = v[v.length - 1];
  if (Math.sqrt(dist2(first, last)) > closeThreshold) {
    v.push({ x: first.x, y: first.y });
  }
  if (v.length < 3) return null;
  if (isClockwise(v)) v.reverse();
  return { vertices: v };
}

// concave detection for a polygon (true/false per vertex)
function findConcaveVertices(poly) {
  const v = poly.vertices;
  const n = v.length;
  const out = new Array(n).fill(false);
  const area = signedArea(v);
  if (area === 0) return out;
  const ccw = area > 0;

  for (let i = 0; i < n; i++) {
    const prev = v[(i - 1 + n) % n];
    const curr = v[i];
    const next = v[(i + 1) % n];
    const z = cross(prev, curr, next);
    if ((ccw && z < 0) || (!ccw && z > 0)) out[i] = true;
  }
  return out;
}

// axis-aligned snap, as in your demos
function snapPolygonAxisAligned(poly, grid = 25) {
  const raw = poly.vertices;
  if (raw.length < 2) return poly;
  const snapped = [];
  let prev = {
    x: Math.round(raw[0].x / grid) * grid,
    y: Math.round(raw[0].y / grid) * grid
  };
  snapped.push(prev);

  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let nx, ny;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // horizontal
      nx = Math.round(b.x / grid) * grid;
      ny = prev.y;
    } else {
      // vertical
      nx = prev.x;
      ny = Math.round(b.y / grid) * grid;
    }
    if (nx !== prev.x || ny !== prev.y) {
      prev = { x: nx, y: ny };
      snapped.push(prev);
    }
  }

  const first = snapped[0], last = snapped[snapped.length - 1];
  if (dist2(first, last) > 1) snapped.push({ x: first.x, y: first.y });
  return { vertices: snapped };
}

// centroid of polygon
function centroid(poly) {
  const v = poly.vertices;
  let sx = 0, sy = 0;
  for (const p of v) {
    sx += p.x;
    sy += p.y;
  }
  const n = v.length;
  return { x: sx / n, y: sy / n };
}

// simple circle fit, as in donut demo
function circleFitSimple(poly) {
  const v = poly.vertices;
  const c = centroid(poly);
  const rs = [];
  for (const p of v) {
    const dx = p.x - c.x, dy = p.y - c.y;
    rs.push(Math.sqrt(dx * dx + dy * dy));
  }
  const n = rs.length;
  let sum = 0;
  for (const r of rs) sum += r;
  const mean = sum / n;
  let varSum = 0;
  for (const r of rs) {
    const d = r - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  const ratio = std / mean;
  return { cx: c.x, cy: c.y, r: mean, ratio };
}

function isRound(poly, threshold = 0.2) {
  const fit = circleFitSimple(poly);
  return { round: fit.ratio < threshold, fit };
}

// point in polygon (ray casting)
function pointInPolygon(p, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// triangle centroid
function triCentroid(a, b, c) {
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

// ===================== Ear-Clipping Triangulation =====================

function pointInTriangle(p, a, b, c) {
  function sign(p1, p2, p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  }
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function earClipTriangulate(poly) {
  const verts = poly.vertices.slice();
  // remove duplicate last vertex if present
  if (verts.length > 1) {
    const f = verts[0], l = verts[verts.length - 1];
    if (dist2(f, l) < 1e-6) verts.pop();
  }
  if (verts.length < 3) return [];

  if (signedArea(verts) < 0) verts.reverse();
  const n = verts.length;
  const indices = [];
  for (let i = 0; i < n; i++) indices.push(i);

  const triangles = [];

  function isEar(iIndex) {
    const nI = indices.length;
    const iPrev = indices[(iIndex - 1 + nI) % nI];
    const i = indices[iIndex];
    const iNext = indices[(iIndex + 1) % nI];
    const A = verts[iPrev], B = verts[i], C = verts[iNext];

    // convex check
    if (cross(A, B, C) <= 0) return false;

    // ensure no other vertex inside
    for (let jIdx = 0; jIdx < nI; jIdx++) {
      const j = indices[jIdx];
      if (j === iPrev || j === i || j === iNext) continue;
      const P = verts[j];
      if (pointInTriangle(P, A, B, C)) return false;
    }
    return true;
  }

  while (indices.length > 3) {
    let earFound = false;
    for (let iIdx = 0; iIdx < indices.length; iIdx++) {
      if (!isEar(iIdx)) continue;
      const nI = indices.length;
      const iPrev = indices[(iIdx - 1 + nI) % nI];
      const i = indices[iIdx];
      const iNext = indices[(iIdx + 1) % nI];
      const A = verts[iPrev], B = verts[i], C = verts[iNext];

      triangles.push({ a: A, b: B, c: C });
      indices.splice(iIdx, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }
  if (indices.length === 3) {
    const A = verts[indices[0]], B = verts[indices[1]], C = verts[indices[2]];
    triangles.push({ a: A, b: B, c: C });
  }
  return triangles;
}

// ===================== L-Shape Rectangular Decomposition =====================

function computeLDecompositionRects(snappedPoly) {
  const v = snappedPoly.vertices;
  const concave = findConcaveVertices(snappedPoly);
  const ci = concave.findIndex(f => f);
  if (ci === -1) return [];

  const C = v[ci];
  const box = boundingBoxVertices(v);

  const Rbottom = {
    minX: box.minX,
    maxX: box.maxX,
    minY: box.minY,
    maxY: C.y
  };

  const Rleft = {
    minX: box.minX,
    maxX: C.x,
    minY: C.y,
    maxY: box.maxY
  };

  return [Rbottom, Rleft];
}

// ===================== Donut Helpers =====================

function classifyDonutFromStrokes(strokes) {
  if (strokes.length < 1) return null;
  const polyA = polygonFromStroke(strokes[0]);
  if (!polyA) return null;
  if (strokes.length === 1) {
    // outer-only preview
    // ensure CCW
    if (signedArea(polyA.vertices) < 0) polyA.vertices.reverse();
    const snappedOuter = snapPolygonAxisAligned(polyA);
    return {
      mode: "outer-only",
      outerRaw: polyA,
      snappedOuter,
      innerRaw: null,
      snappedInner: null
    };
  } else {
    // full donut
    const polyB = polygonFromStroke(strokes[1]);
    if (!polyB) return null;
    const areaA = Math.abs(signedArea(polyA.vertices));
    const areaB = Math.abs(signedArea(polyB.vertices));
    let outerRaw, innerRaw;
    if (areaA > areaB) {
      outerRaw = polyA; innerRaw = polyB;
    } else {
      outerRaw = polyB; innerRaw = polyA;
    }
    if (signedArea(outerRaw.vertices) < 0) outerRaw.vertices.reverse();
    if (signedArea(innerRaw.vertices) > 0) innerRaw.vertices.reverse();

    const snappedOuter = snapPolygonAxisAligned(outerRaw);
    const snappedInner = snapPolygonAxisAligned(innerRaw);

    return {
      mode: "full",
      outerRaw,
      innerRaw,
      snappedOuter,
      snappedInner
    };
  }
}

function donutRectangles(snappedOuter, snappedInner) {
  return {
    rectOuter: boundingBoxVertices(snappedOuter.vertices),
    rectInner: snappedInner ? boundingBoxVertices(snappedInner.vertices) : null
  };
}

function donutCircles(outerRaw, innerRaw) {
  if (!outerRaw || !innerRaw) return { isCircular: false, circleOuter: null, circleInner: null };
  const { round: roundOuter, fit: fitOuter } = isRound(outerRaw, 0.2);
  const { round: roundInner, fit: fitInner } = isRound(innerRaw, 0.2);
  if (roundOuter && roundInner) {
    return {
      isCircular: true,
      circleOuter: { cx: fitOuter.cx, cy: fitOuter.cy, r: fitOuter.r },
      circleInner: { cx: fitInner.cx, cy: fitInner.cy, r: fitInner.r }
    };
  }
  return { isCircular: false, circleOuter: null, circleInner: null };
}

function donutTriangulation(snappedOuter, snappedInner) {
  if (!snappedOuter) return { triangles: [], boxes: [] };
  const trisAll = earClipTriangulate(snappedOuter);
  const holeVerts = snappedInner ? snappedInner.vertices : null;
  const kept = [];
  if (holeVerts) {
    for (const tri of trisAll) {
      const c = triCentroid(tri.a, tri.b, tri.c);
      if (!pointInPolygon(c, holeVerts)) {
        kept.push(tri);
      }
    }
  } else {
    kept.push(...trisAll);
  }
  const boxes = kept.map(t => boundingBoxVertices([t.a, t.b, t.c]));
  return { triangles: kept, boxes };
}

// ===================== Global State =====================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const state = {
  mode: "l_rect",
  triMode: "wire", // "wire", "fill", "both"

  // toggles
  showRaw: true,
  showSnap: true,
  showBoxes: true,
  showRects: true,
  showCircles: true,
  showConcave: true,

  drawing: false,
  currentStroke: [],
  strokes: [],

  // single-shape modes (L + general)
  rawPoly: null,
  snappedPoly: null,
  concaveFlags: [],
  bigBox: null,
  decompRects: [],
  triangles: [],
  triBoxes: [],

  // donut modes
  outerRaw: null,
  innerRaw: null,
  snappedOuter: null,
  snappedInner: null,
  donutRectOuter: null,
  donutRectInner: null,
  donutIsCircular: false,
  donutCircleOuter: null,
  donutCircleInner: null
};

// ===================== Canvas & Resize =====================

function resizeCanvas() {
  canvas.width = window.innerWidth - 260; // sidebar width
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", () => { resizeCanvas(); draw(); });
resizeCanvas();

// ===================== Drawing Helpers =====================

function drawGrid() {
  const w = canvas.width, h = canvas.height, step = 25;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawStroke() {
  const { strokes, currentStroke } = state;
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const s of strokes) {
    if (s.length < 2) continue;
    ctx.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
  }
  if (currentStroke.length > 1) {
    ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
    for (let i = 1; i < currentStroke.length; i++) ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
  }
  ctx.stroke();
}

function drawPolygonOutline(vertices, color, width) {
  if (!vertices || vertices.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.stroke();
}

function drawBox(box, strokeColor, lineWidth) {
  if (!box) return;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(
    box.minX,
    box.minY,
    box.maxX - box.minX,
    box.maxY - box.minY
  );
}

function drawFilledRectBox(box, fillColor, strokeColor, lineWidth) {
  if (!box) return;
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.fillRect(
    box.minX,
    box.minY,
    box.maxX - box.minX,
    box.maxY - box.minY
  );
  ctx.strokeRect(
    box.minX,
    box.minY,
    box.maxX - box.minX,
    box.maxY - box.minY
  );
}

// random pastel color
function pastelColor() {
  const r = 200 + Math.floor(Math.random() * 55);
  const g = 200 + Math.floor(Math.random() * 55);
  const b = 200 + Math.floor(Math.random() * 55);
  return `rgba(${r},${g},${b},0.8)`;
}

// ===================== Main Draw =====================

function draw() {
  drawGrid();
  drawStroke();

  const s = state;

  // Raw polygons
  if (s.showRaw) {
    if (s.mode === "donut_rect" || s.mode === "donut_tri") {
      if (s.outerRaw) drawPolygonOutline(s.outerRaw.vertices, "black", 1.5);
      if (s.innerRaw) drawPolygonOutline(s.innerRaw.vertices, "black", 1.5);
    } else {
      if (s.rawPoly) drawPolygonOutline(s.rawPoly.vertices, "black", 1.5);
    }
  }

  // Snapped polygons
  if (s.showSnap) {
    if (s.mode === "donut_rect" || s.mode === "donut_tri") {
      if (s.snappedOuter) drawPolygonOutline(s.snappedOuter.vertices, "blue", 3);
      if (s.snappedInner) drawPolygonOutline(s.snappedInner.vertices, "blue", 3);
    } else {
      if (s.snappedPoly) drawPolygonOutline(s.snappedPoly.vertices, "blue", 3);
    }
  }

  // Concave markers (L modes)
  if (s.showConcave && (s.mode === "l_rect" || s.mode === "l_tri")) {
    if (s.rawPoly && s.concaveFlags && s.concaveFlags.length > 0) {
      const v = s.rawPoly.vertices;
      ctx.fillStyle = "red";
      for (let i = 0; i < v.length; i++) {
        if (!s.concaveFlags[i]) continue;
        ctx.beginPath();
        ctx.arc(v[i].x, v[i].y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Big bounding box for L rect (optional) – not strictly needed, but we kept from original
  if (s.showBoxes && s.bigBox && (s.mode === "l_rect" || s.mode === "l_tri")) {
    drawBox(s.bigBox, "green", 2);
  }

  // Decomposition rectangles (L-Rect mode)
  if (s.showRects && s.mode === "l_rect" && s.decompRects && s.decompRects.length > 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = 2;
    for (const r of s.decompRects) {
      ctx.fillRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
      ctx.strokeRect(r.minX, r.minY, r.maxX - r.minX, r.maxY - r.minY);
    }
  }

  // Triangles (L-Tri, Donut-Tri, General)
  if (s.triangles && s.triangles.length > 0) {
    for (const tri of s.triangles) {
      const { a, b, c } = tri;
      if (s.triMode === "fill" || s.triMode === "both") {
        ctx.fillStyle = pastelColor();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
      }
      if (s.triMode === "wire" || s.triMode === "both") {
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  // Triangle boxes
  if (s.showBoxes && s.triBoxes && s.triBoxes.length > 0) {
    ctx.strokeStyle = "green";
    ctx.lineWidth = 1.5;
    for (const b of s.triBoxes) {
      ctx.strokeRect(
        b.minX,
        b.minY,
        b.maxX - b.minX,
        b.maxY - b.minY
      );
    }
  }

  // Donut rectangular overlay
  if (s.showRects && (s.mode === "donut_rect" || s.mode === "donut_tri")) {
    if (s.donutRectOuter && s.donutRectInner) {
      // outer rect
      drawFilledRectBox(s.donutRectOuter, "rgba(0,0,0,0.08)", "rgba(0,0,0,0.6)", 2);
      // inner "hole"
      const box = s.donutRectInner;
      const iw = box.maxX - box.minX;
      const ih = box.maxY - box.minY;
      ctx.clearRect(box.minX, box.minY, iw, ih);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.minX, box.minY, iw, ih);
    }
  }

  // Donut circles
  if (s.showCircles && s.donutIsCircular && s.donutCircleOuter && s.donutCircleInner) {
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "purple";
    ctx.beginPath();
    ctx.arc(s.donutCircleOuter.cx, s.donutCircleOuter.cy, s.donutCircleOuter.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.donutCircleInner.cx, s.donutCircleInner.cy, s.donutCircleInner.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ===================== Processing per Mode =====================

function resetComputed() {
  state.rawPoly = null;
  state.snappedPoly = null;
  state.concaveFlags = [];
  state.bigBox = null;
  state.decompRects = [];
  state.triangles = [];
  state.triBoxes = [];

  state.outerRaw = null;
  state.innerRaw = null;
  state.snappedOuter = null;
  state.snappedInner = null;
  state.donutRectOuter = null;
  state.donutRectInner = null;
  state.donutIsCircular = false;
  state.donutCircleOuter = null;
  state.donutCircleInner = null;
}

function processSingleStroke() {
  resetComputed();
  const poly = polygonFromStroke(state.strokes[0]);
  if (!poly) return;

  state.rawPoly = poly;
  state.concaveFlags = findConcaveVertices(poly);
  const snapped = snapPolygonAxisAligned(poly);
  state.snappedPoly = snapped;
  state.bigBox = boundingBoxVertices(snapped.vertices);

  if (state.mode === "l_rect") {
    state.decompRects = computeLDecompositionRects(snapped);
  } else if (state.mode === "l_tri") {
    const tris = earClipTriangulate(snapped);
    state.triangles = tris;
    state.triBoxes = tris.map(t => boundingBoxVertices([t.a, t.b, t.c]));
  } else if (state.mode === "general") {
    const tris = earClipTriangulate(snapped);
    state.triangles = tris;
    state.triBoxes = tris.map(t => boundingBoxVertices([t.a, t.b, t.c]));
  }
}

function processDonutStrokes() {
  resetComputed();
  const result = classifyDonutFromStrokes(state.strokes);
  if (!result) return;

  if (result.mode === "outer-only") {
    state.outerRaw = result.outerRaw;
    state.snappedOuter = result.snappedOuter;
    // preview only; no donut overlays yet
    return;
  }

  // full donut
  state.outerRaw = result.outerRaw;
  state.innerRaw = result.innerRaw;
  state.snappedOuter = result.snappedOuter;
  state.snappedInner = result.snappedInner;

  const rects = donutRectangles(state.snappedOuter, state.snappedInner);
  state.donutRectOuter = rects.rectOuter;
  state.donutRectInner = rects.rectInner;

  const circ = donutCircles(state.outerRaw, state.innerRaw);
  state.donutIsCircular = circ.isCircular;
  state.donutCircleOuter = circ.circleOuter;
  state.donutCircleInner = circ.circleInner;

  if (state.mode === "donut_tri") {
    const triRes = donutTriangulation(state.snappedOuter, state.snappedInner);
    state.triangles = triRes.triangles;
    state.triBoxes = triRes.boxes;
  }
}

// ===================== Mouse Handling =====================

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  state.drawing = true;
  state.currentStroke = [{ x: e.clientX - rect.left, y: e.clientY - rect.top }];
});

canvas.addEventListener("mousemove", (e) => {
  if (!state.drawing) return;
  const rect = canvas.getBoundingClientRect();
  state.currentStroke.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  draw();
});

canvas.addEventListener("mouseup", (e) => {
  if (!state.drawing) return;
  state.drawing = false;
  const rect = canvas.getBoundingClientRect();
  state.currentStroke.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });

  if (state.mode === "donut_rect" || state.mode === "donut_tri") {
    if (state.strokes.length < 2) {
      state.strokes.push(state.currentStroke.slice());
      state.currentStroke = [];
      processDonutStrokes();
    }
  } else {
    state.strokes = [state.currentStroke.slice()];
    state.currentStroke = [];
    processSingleStroke();
  }
  draw();
});

canvas.addEventListener("mouseleave", () => {
  state.drawing = false;
});

// ===================== UI Wiring =====================

const modeSelect = document.getElementById("modeSelect");
const clearBtn = document.getElementById("clearBtn");
const showRawCb = document.getElementById("showRaw");
const showSnapCb = document.getElementById("showSnap");
const showBoxesCb = document.getElementById("showBoxes");
const showRectsCb = document.getElementById("showRects");
const showCirclesCb = document.getElementById("showCircles");
const showConcaveCb = document.getElementById("showConcave");
const triModeBtn = document.getElementById("triModeBtn");
const hintText = document.getElementById("hintText");

function updateHint() {
  switch (state.mode) {
    case "l_rect":
      hintText.textContent = "L-Shape Rectangular: draw a rough L-shape as one closed stroke.";
      break;
    case "l_tri":
      hintText.textContent = "L-Shape Triangulation: draw a rough L-shape as one closed stroke.";
      break;
    case "donut_rect":
      hintText.textContent = "Donut Rectangular: draw outer loop, then inner loop (hole).";
      break;
    case "donut_tri":
      hintText.textContent = "Donut Triangulation: draw outer loop, then inner loop (hole).";
      break;
    case "general":
      hintText.textContent = "General Polygon: draw any simple closed shape as one stroke.";
      break;
  }
}

modeSelect.addEventListener("change", () => {
  state.mode = modeSelect.value;
  // reset strokes & computed state
  state.strokes = [];
  state.currentStroke = [];
  resetComputed();
  updateHint();
  draw();
});

clearBtn.addEventListener("click", () => {
  state.strokes = [];
  state.currentStroke = [];
  resetComputed();
  draw();
});

showRawCb.addEventListener("change", () => {
  state.showRaw = showRawCb.checked;
  draw();
});
showSnapCb.addEventListener("change", () => {
  state.showSnap = showSnapCb.checked;
  draw();
});
showBoxesCb.addEventListener("change", () => {
  state.showBoxes = showBoxesCb.checked;
  draw();
});
showRectsCb.addEventListener("change", () => {
  state.showRects = showRectsCb.checked;
  draw();
});
showCirclesCb.addEventListener("change", () => {
  state.showCircles = showCirclesCb.checked;
  draw();
});
showConcaveCb.addEventListener("change", () => {
  state.showConcave = showConcaveCb.checked;
  draw();
});

triModeBtn.addEventListener("click", () => {
  if (state.triMode === "wire") state.triMode = "fill";
  else if (state.triMode === "fill") state.triMode = "both";
  else state.triMode = "wire";

  if (state.triMode === "wire") triModeBtn.textContent = "Triangles: Wireframe";
  else if (state.triMode === "fill") triModeBtn.textContent = "Triangles: Filled";
  else triModeBtn.textContent = "Triangles: Wire+Fill";

  draw();
});

// init
updateHint();
draw();

