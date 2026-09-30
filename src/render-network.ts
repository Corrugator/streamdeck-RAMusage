import { areaPath, barRects, BG, FONT, graphPoints, linePath, svgWrap } from './render';

/** Which direction(s) the key shows. */
export type NetworkMode = 'both' | 'down' | 'up';

/** How the history is drawn: none, line/area chart or bars. */
export type NetworkGraph = 'off' | 'line' | 'bars';

export type NetworkColors = { down: string; up: string };

export const DEFAULT_NETWORK_COLORS: NetworkColors = {
  down: '#64D2FF',
  up: '#FF9F0A',
};

export type NetworkRenderOptions = {
  /** Current rates in bytes per second. */
  down: number;
  up: number;
  mode: NetworkMode;
  graph: NetworkGraph;
  /** Show bits per second (Mbps) instead of bytes per second (MB/s). */
  bits: boolean;
  label: string;
  colors: NetworkColors;
  /** Glyphs marking the two directions; defaults to ↓ / ↑. */
  arrows?: { down: string; up: string };
  /** Rate history in bytes per second, oldest first. */
  downHistory: number[];
  upHistory: number[];
};

const BYTE_UNITS = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
const BIT_UNITS = ['bps', 'Kbps', 'Mbps', 'Gbps'];
/** Graph floor so idle noise (a few hundred B/s) doesn't fill the chart. */
const MIN_SCALE = 10 * 1000;

/** Splits a rate into a short number and unit, e.g. { value: "12.3", unit: "MB/s" }. */
export function formatRate(bytesPerSec: number, bits: boolean): { value: string; unit: string } {
  const units = bits ? BIT_UNITS : BYTE_UNITS;
  let v = bits ? bytesPerSec * 8 : bytesPerSec;
  let i = 0;
  // Decimal prefixes, like Activity Monitor. 999.6 must become "1.0 K", not "1000".
  while (v >= 999.5 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const value = i === 0 || v >= 9.95 ? Math.round(v).toString() : v.toFixed(1);
  return { value, unit: units[i] };
}

/** Normalizes rates to 0–100 against a shared scale so both series compare. */
function toPercent(history: number[], scale: number): number[] {
  return history.map((v) => (v / scale) * 100);
}

function rateRow(
  arrow: string,
  bytesPerSec: number,
  y: number,
  size: number,
  opts: NetworkRenderOptions,
  color: string,
): string {
  const { value, unit } = formatRate(bytesPerSec, opts.bits);
  // Separate <text> elements instead of <tspan>s: not every SVG renderer
  // honors per-tspan size/color. Arrow left, value right-aligned so digits
  // line up across rows, unit after it.
  const text = (x: number, anchor: string, fontSize: number, fill: string, content: string) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${fill}">${content}</text>`;
  return (
    text(14, 'start', Math.round(size * 0.85), color, arrow) +
    text(96, 'end', size, '#FFFFFF', value) +
    text(102, 'start', Math.round(size * 0.5), '#9A9A9E', unit)
  );
}

function chart(
  history: number[],
  color: string,
  kind: NetworkGraph,
  filled: boolean,
  yTop: number,
  yBot: number,
): string {
  if (kind === 'bars') return barRects(history, 14, 130, yTop, yBot, color, filled ? 0.9 : 0.6);
  const pts = graphPoints(history, 14, 130, yTop, yBot);
  return (
    (filled ? `<path d="${areaPath(pts, yBot)}" fill="${color}" fill-opacity="0.22"/>` : '') +
    `<path d="${linePath(pts)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
  );
}

/** Builds the 144×144 network key image (data URI). */
export function renderNetworkKey(opts: NetworkRenderOptions): string {
  const { colors, mode } = opts;
  const arrows = opts.arrows ?? { down: '↓', up: '↑' };
  const hasGraph = opts.graph !== 'off' && opts.downHistory.length >= 2;
  const layers: string[] = [BG];

  layers.push(
    `<text x="72" y="22" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="12" font-weight="600" letter-spacing="1.5" fill="#9A9A9E">${opts.label}</text>`,
  );

  if (mode === 'both') {
    if (hasGraph) {
      const scale = Math.max(MIN_SCALE, ...opts.downHistory, ...opts.upHistory);
      const yTop = 90;
      const yBot = 128;
      layers.push(
        `<line x1="14" y1="130" x2="130" y2="130" stroke="#3A3A3C" stroke-width="1"/>`,
        chart(toPercent(opts.downHistory, scale), colors.down, opts.graph, true, yTop, yBot),
        // Upload bars would hide the download bars, so upload is always a line.
        chart(toPercent(opts.upHistory, scale), colors.up, 'line', false, yTop, yBot),
        rateRow(arrows.down, opts.down, 46, 24, opts, colors.down),
        rateRow(arrows.up, opts.up, 73, 24, opts, colors.up),
      );
    } else {
      layers.push(
        rateRow(arrows.down, opts.down, 60, 28, opts, colors.down),
        rateRow(arrows.up, opts.up, 100, 28, opts, colors.up),
      );
    }
    return svgWrap(layers.join(''));
  }

  const isDown = mode === 'down';
  const rate = isDown ? opts.down : opts.up;
  const history = isDown ? opts.downHistory : opts.upHistory;
  const color = isDown ? colors.down : colors.up;
  const { value, unit } = formatRate(rate, opts.bits);
  const valueY = hasGraph ? 60 : 68;
  const unitY = hasGraph ? 88 : 100;

  if (hasGraph) {
    const scale = Math.max(MIN_SCALE, ...history);
    layers.push(
      `<line x1="14" y1="130" x2="130" y2="130" stroke="#3A3A3C" stroke-width="1"/>`,
      chart(toPercent(history, scale), color, opts.graph, true, 100, 128),
    );
  }
  layers.push(
    `<text x="72" y="${valueY}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${value.length > 3 ? 36 : 42}" font-weight="700" fill="${color}">${value}</text>`,
    `<text x="72" y="${unitY}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="15" font-weight="600" fill="#D0D0D2">${isDown ? arrows.down : arrows.up} ${unit}</text>`,
  );
  return svgWrap(layers.join(''));
}
