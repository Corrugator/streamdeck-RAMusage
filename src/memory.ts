import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Native macOS memory-pressure level reported by the kernel. */
export type PressureLevel = 'normal' | 'warning' | 'critical';

export type MemoryStats = {
  /** Memory pressure in percent (0–100), i.e. 100 − free memory percentage. */
  pressure: number;
  /** Used/total physical memory in percent (0–100), ≈ Activity Monitor "Used". */
  usage: number;
  /** Bytes currently in use (active + wired + compressed). */
  usedBytes: number;
  /** Total physical memory in bytes. */
  totalBytes: number;
  /** Native kernel pressure level (the green/yellow/red the OS itself uses). */
  level: PressureLevel;
};

// hw.memsize and hw.pagesize never change during a session — fetch once.
let totalBytes: number | undefined;
let pageSize: number | undefined;

function levelFromSysctl(raw: number): PressureLevel {
  // kern.memorystatus_vm_pressure_level: 1 = normal, 2 = warning, 4 = critical.
  if (raw >= 4) return 'critical';
  if (raw >= 2) return 'warning';
  return 'normal';
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pagesOf(vmStat: string, key: string): number {
  const m = vmStat.match(new RegExp(`${key}:\\s+(\\d+)`));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Reads macOS memory stats.
 *
 * - **pressure**: `100 − kern.memorystatus_level` — the kernel's own free-memory
 *   percentage (same value `memory_pressure` reports), inverted to a load figure.
 * - **usage / usedBytes**: `(active + wired + compressed)` pages × page size, the
 *   common approximation of Activity Monitor's "Memory Used".
 *
 * sysctl and vm_stat are invoked in parallel; both are sub-10ms calls.
 */
export async function readMemoryStats(): Promise<MemoryStats> {
  const needConst = totalBytes === undefined || pageSize === undefined;
  const sysctlArgs = needConst
    ? ['-n', 'kern.memorystatus_level', 'kern.memorystatus_vm_pressure_level', 'hw.memsize', 'hw.pagesize']
    : ['-n', 'kern.memorystatus_level', 'kern.memorystatus_vm_pressure_level'];

  const [sysctlRes, vmStatRes] = await Promise.all([
    execFileAsync('sysctl', sysctlArgs),
    execFileAsync('vm_stat'),
  ]);

  const nums = sysctlRes.stdout.trim().split(/\s+/).map((v) => parseInt(v, 10));
  const free = clampPercent(nums[0]);
  const level = levelFromSysctl(nums[1]);
  if (needConst) {
    totalBytes = nums[2];
    pageSize = nums[3];
  }

  const ps = pageSize ?? 4096;
  const total = totalBytes ?? 0;
  const out = vmStatRes.stdout;
  const usedBytes =
    (pagesOf(out, 'Pages active') +
      pagesOf(out, 'Pages wired down') +
      pagesOf(out, 'Pages occupied by compressor')) *
    ps;

  return {
    pressure: clampPercent(100 - free),
    usage: total > 0 ? clampPercent((usedBytes / total) * 100) : 0,
    usedBytes,
    totalBytes: total,
    level,
  };
}
