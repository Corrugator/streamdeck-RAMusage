export type Thresholds = {
  /** Value (%) at/above which the display turns yellow. */
  warn: number;
  /** Value (%) at/above which the display turns red. */
  crit: number;
};

export type Palette = {
  green: string;
  yellow: string;
  red: string;
};

/**
 * How the history is drawn:
 * - `off`        – ring only
 * - `sparkline`  – ring + small line at the bottom
 * - `bars-mini`  – ring + small bars at the bottom
 * - `area`       – ring + filled history area behind the text
 * - `line`       – no ring, large colored %, prominent line chart
 * - `bars`       – no ring, large colored %, prominent bar chart
 * - `background` – history fills the whole key, % as overlay
 */
export type GraphStyle =
  | 'off'
  | 'sparkline'
  | 'bars-mini'
  | 'area'
  | 'line'
  | 'bars'
  | 'background';

export const DEFAULT_THRESHOLDS: Thresholds = { warn: 50, crit: 75 };

export const DEFAULT_PALETTE: Palette = {
  green: '#30D158',
  yellow: '#FFD60A',
  red: '#FF453A',
};

export function colorForValue(
  value: number,
  thresholds: Thresholds,
  palette: Palette,
): string {
  if (value >= thresholds.crit) return palette.red;
  if (value >= thresholds.warn) return palette.yellow;
  return palette.green;
}

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Formats used/total bytes as e.g. "34 / 64 GB" (1 decimal below 10 GB). */
export function formatGB(usedBytes: number, totalBytes: number): string {
  const used = usedBytes / BYTES_PER_GB;
  const total = Math.round(totalBytes / BYTES_PER_GB);
  const usedStr = used >= 10 ? Math.round(used).toString() : used.toFixed(1);
  return `${usedStr} / ${total} GB`;
}

export type RenderOptions = {
  /** 0–100, the metric to display (pressure or usage). */
  value: number;
  /** Ring / chart accent color. */
  color: string;
  /** Short label shown when no GB sub-line is present (e.g. "RAM"). */
  label: string;
  /** Optional second line, e.g. "34 / 64 GB". Replaces the label when set. */
  subline?: string;
  /** Optional history (0–100, oldest first) for the graph. */
  history?: number[];
  /** How to draw the history. Defaults to "sparkline". */
  graphStyle?: GraphStyle;
};

const FONT = '-apple-system, Helvetica Neue, Helvetica, Arial, sans-serif';
const BG = `<rect width="144" height="144" rx="18" fill="#1C1C1E"/>`;
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

function historyOf(opts: RenderOptions): number[] {
  const h = opts.history;
  return Array.isArray(h) && h.length >= 1 ? h : [opts.value];
}

/** Maps history values to [x,y] points within the given box. */
function graphPoints(
  history: number[],
  x0: number,
  x1: number,
  yTop: number,
  yBot: number,
): Array<[number, number]> {
  const h = history.length >= 2 ? history : [history[0] ?? 0, history[0] ?? 0];
  const dx = (x1 - x0) / (h.length - 1);
  return h.map((v, i) => [x0 + i * dx, yBot - (clampPct(v) / 100) * (yBot - yTop)]);
}

const linePath = (pts: Array<[number, number]>) =>
  'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');

const areaPath = (pts: Array<[number, number]>, yBot: number) =>
  `${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)},${yBot.toFixed(1)} L${pts[0][0].toFixed(1)},${yBot.toFixed(1)} Z`;

function barRects(
  history: number[],
  x0: number,
  x1: number,
  yTop: number,
  yBot: number,
  fill: string,
  op: number,
): string {
  const n = history.length;
  const step = (x1 - x0) / n;
  const bw = Math.max(1, step - Math.min(2, step * 0.25));
  return history
    .map((v, i) => {
      const h = Math.max(0.5, (clampPct(v) / 100) * (yBot - yTop));
      const x = x0 + i * step;
      return `<rect x="${x.toFixed(1)}" y="${(yBot - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${fill}" fill-opacity="${op}"/>`;
    })
    .join('');
}

function valueText(pct: number, y: number, size: number, fill: string): string {
  return `<text x="72" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${fill}">${pct}%</text>`;
}

function subText(opts: RenderOptions, y: number, labelColor: string): string {
  return opts.subline
    ? `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="#D0D0D2">${opts.subline}</text>`
    : `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="600" letter-spacing="1.5" fill="${labelColor}">${opts.label}</text>`;
}

function svgWrap(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${inner}</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

/** Ring layout. `deco` adds a sparkline, mini bars, or a background area. */
function renderRing(opts: RenderOptions, deco: 'none' | 'sparkline' | 'bars' | 'area'): string {
  const { color } = opts;
  const pct = Math.round(clampPct(opts.value));
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const valueFontSize = pct >= 100 ? 33 : 40;
  const compact = deco === 'sparkline' || deco === 'bars';
  const valueY = compact ? 54 : 64;
  const subY = compact ? 80 : 95;

  const layers: string[] = [BG];

  if (deco === 'area') {
    const pts = graphPoints(historyOf(opts), 8, 136, 42, 132);
    layers.push(
      `<path d="${areaPath(pts, 132)}" fill="${color}" fill-opacity="0.15"/>`,
      `<path d="${linePath(pts)}" fill="none" stroke="${color}" stroke-width="2" stroke-opacity="0.5"/>`,
    );
  }

  layers.push(
    `<g transform="rotate(-90 72 72)">`,
    `<circle cx="72" cy="72" r="${r}" fill="none" stroke="#3A3A3C" stroke-width="10"/>`,
    `<circle cx="72" cy="72" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circ.toFixed(2)}"/>`,
    `</g>`,
  );

  if (deco === 'sparkline') {
    const pts = graphPoints(historyOf(opts), 30, 114, 102, 124);
    layers.push(
      `<path d="${areaPath(pts, 124)}" fill="#FFFFFF" fill-opacity="0.10"/>`,
      `<path d="${linePath(pts)}" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  } else if (deco === 'bars') {
    layers.push(barRects(historyOf(opts), 30, 114, 102, 124, '#FFFFFF', 0.9));
  }

  layers.push(valueText(pct, valueY, valueFontSize, '#FFFFFF'), subText(opts, subY, color));
  return svgWrap(layers.join(''));
}

/** No-ring layout: large colored %, prominent line or bar chart below. */
function renderBig(opts: RenderOptions, kind: 'line' | 'bars'): string {
  const { color } = opts;
  const pct = Math.round(clampPct(opts.value));
  const valueFontSize = pct >= 100 ? 36 : 42;
  const hist = historyOf(opts);

  const chart =
    kind === 'line'
      ? `<path d="${areaPath(graphPoints(hist, 14, 130, 80, 126), 126)}" fill="${color}" fill-opacity="0.22"/>` +
        `<path d="${linePath(graphPoints(hist, 14, 130, 80, 126))}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
      : barRects(hist, 14, 130, 80, 126, color, 0.95);

  return svgWrap(
    [
      BG,
      // Colored percentage carries the green/yellow/red signal (no ring here).
      valueText(pct, 42, valueFontSize, color),
      subText(opts, 66, '#9A9A9E'),
      `<line x1="14" y1="128" x2="130" y2="128" stroke="#3A3A3C" stroke-width="1"/>`,
      chart,
    ].join(''),
  );
}

/** History fills the whole key as a background; %/label sit on top. */
function renderBackground(opts: RenderOptions): string {
  const { color } = opts;
  const pct = Math.round(clampPct(opts.value));
  const pts = graphPoints(historyOf(opts), 0, 144, 28, 144);

  return svgWrap(
    [
      BG,
      `<path d="${areaPath(pts, 144)}" fill="${color}" fill-opacity="0.28"/>`,
      `<path d="${linePath(pts)}" fill="none" stroke="${color}" stroke-width="2.5"/>`,
      valueText(pct, 60, pct >= 100 ? 40 : 46, '#FFFFFF'),
      subText(opts, 88, color),
    ].join(''),
  );
}

/**
 * Builds an SVG key image (data URI), 144×144 (Stream Deck @2x key size),
 * choosing the layout from `graphStyle`.
 */
export function renderKeyImage(opts: RenderOptions): string {
  const style = opts.graphStyle ?? 'sparkline';
  const enoughForDeco =
    Array.isArray(opts.history) && opts.history.length >= 2;

  switch (style) {
    case 'line':
      return renderBig(opts, 'line');
    case 'bars':
      return renderBig(opts, 'bars');
    case 'background':
      return renderBackground(opts);
    case 'sparkline':
      return renderRing(opts, enoughForDeco ? 'sparkline' : 'none');
    case 'bars-mini':
      return renderRing(opts, enoughForDeco ? 'bars' : 'none');
    case 'area':
      return renderRing(opts, enoughForDeco ? 'area' : 'none');
    case 'off':
    default:
      return renderRing(opts, 'none');
  }
}
