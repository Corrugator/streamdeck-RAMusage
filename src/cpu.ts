import os from 'node:os';

type CpuTimes = { idle: number; total: number };

function snapshot(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

let previous: CpuTimes | undefined;

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * CPU usage in percent (0–100), averaged over the interval since the previous
 * call. `os.cpus()` reports cumulative tick counts, so we diff idle vs. total
 * between calls. The very first call has no previous sample and returns the
 * since-boot average as a reasonable stand-in until the next tick.
 */
export function readCpuUsage(): number {
  const current = snapshot();
  const prev = previous;
  previous = current;
  if (!prev) {
    return clampPct(Math.round((1 - current.idle / current.total) * 100));
  }
  const idleDelta = current.idle - prev.idle;
  const totalDelta = current.total - prev.total;
  if (totalDelta <= 0) return 0;
  return clampPct(Math.round((1 - idleDelta / totalDelta) * 100));
}

/** 1 / 5 / 15-minute load average, e.g. "1.2 1.5 1.3". */
export function formatLoad(): string {
  const [a, b, c] = os.loadavg();
  return `${a.toFixed(1)} ${b.toFixed(1)} ${c.toFixed(1)}`;
}
