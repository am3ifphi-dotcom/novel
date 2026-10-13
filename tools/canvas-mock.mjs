/**
 * tools/canvas-mock.mjs — Node 側テスト用の Canvas 2D モック
 *
 * 重要: 本物の Canvas API と同じように「おかしい引数で例外を投げる」実装にしてある。
 * （素朴な noop モックだと addColorStop(NaN) のようなバグをすり抜けてしまうため）
 *   - addColorStop(offset, color) : offset が非有限 or 範囲外 → 例外
 *   - createLinear/RadialGradient : 引数が非有限、半径が負 → 例外
 *   - arc / ellipse                : 半径が負 → 例外
 */
const FINITE = (v) => typeof v === 'number' && Number.isFinite(v);

function bad(msg) {
  // ブラウザは DOMException。Node には無いので同名の Error を投げる
  const e = new Error(msg);
  e.name = 'DOMException';
  throw e;
}

function makeGradient() {
  const stops = [];
  return {
    __stops: stops,
    addColorStop(offset, color) {
      if (!FINITE(offset)) {
        bad(`Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is non-finite.`);
      }
      if (offset < 0 || offset > 1) {
        bad(`Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is outside the range [0, 1]. (offset=${offset})`);
      }
      if (typeof color !== 'string' || color === '') {
        bad(`Failed to execute 'addColorStop' on 'CanvasGradient': The provided value ('${color}') is not a valid color.`);
      }
      stops.push([offset, color]);
    },
  };
}

function checkNums(name, args, { radii = [] } = {}) {
  args.forEach((v, i) => {
    if (typeof v === 'number' && !Number.isFinite(v)) {
      bad(`Failed to execute '${name}' on 'CanvasRenderingContext2D': The provided double value is non-finite. (arg #${i} = ${v})`);
    }
  });
  radii.forEach((i) => {
    if (FINITE(args[i]) && args[i] < 0) {
      bad(`Failed to execute '${name}' on 'CanvasRenderingContext2D': The radius provided (${args[i]}) is negative.`);
    }
  });
}

export function makeCtx(canvas) {
  const noop = () => {};
  const ctx = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    globalCompositeOperation: 'source-over', shadowColor: '#000', shadowBlur: 0,
    lineCap: 'butt', lineJoin: 'miter', filter: 'none', imageSmoothingEnabled: true,

    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, translate: noop, rotate: noop, scale: noop,
    setTransform: noop, transform: noop, clip: noop, quadraticCurveTo: noop,
    bezierCurveTo: noop, setLineDash: noop, drawImage: noop, arcTo: noop,

    arc(x, y, r, a0, a1, ccw) {
      checkNums('arc', [x, y, r, a0, a1], { radii: [2] });
      void ccw;
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      checkNums('ellipse', [x, y, rx, ry, rot, a0, a1], { radii: [2, 3] });
      void ccw;
    },
    createLinearGradient(x0, y0, x1, y1) {
      checkNums('createLinearGradient', [x0, y0, x1, y1]);
      return makeGradient();
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      checkNums('createRadialGradient', [x0, y0, r0, x1, y1, r1], { radii: [2, 5] });
      return makeGradient();
    },
    createPattern: () => null,
    measureText: (t) => ({ width: String(t).length * 8 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop,
  };
  return ctx;
}

export function makeCanvas(w = 300, h = 150) {
  const c = {
    width: w, height: h, style: {}, nodeType: 1, tagName: 'CANVAS',
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
    toDataURL: () => 'data:,',
  };
  c.getContext = (kind) => (kind === '2d' ? makeCtx(c) : null);
  return c;
}

/** 3つのスモークテストで共有する最小 DOM */
export function installDom() {
  globalThis.self = globalThis;
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, setAttribute() {} }),
    createElementNS: () => makeCanvas(),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} }, head: { appendChild() {} },
    documentElement: { style: {} },
  };
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'node', clipboard: { writeText: async () => {} } }, configurable: true,
    });
  } catch (e) { void e; }
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.HTMLCanvasElement = function () {};
  globalThis.ImageData = function (w, h) {
    this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h;
  };
  globalThis.fetch = async () => { throw new Error('offline (smoke test)'); };
  globalThis.AbortController = globalThis.AbortController
    || class { constructor() { this.signal = {}; } abort() {} };
}
