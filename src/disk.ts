import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DiskSpace = {
  /** Used share of the volume in percent (0–100). */
  percent: number;
  /** Bytes available to the user (what Finder calls "available", minus purgeable). */
  freeBytes: number;
  totalBytes: number;
};

/**
 * Capacity of the volume containing `path`. "Used" is total minus what the
 * user can still write, so APFS space shared with other volumes of the same
 * container counts as used, like in `df`.
 */
export async function readDiskSpace(path: string): Promise<DiskSpace> {
  const s = await statfs(path);
  const totalBytes = s.blocks * s.bsize;
  const freeBytes = s.bavail * s.bsize;
  const percent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
  return { percent: Math.max(0, Math.min(100, Math.round(percent))), freeBytes, totalBytes };
}

type Counters = { read: number; write: number };

/** Sums "Bytes (Read)/(Write)" over all IOBlockStorageDriver entries (one per physical disk). */
async function readCounters(): Promise<Counters> {
  const { stdout } = await execFileAsync('ioreg', ['-r', '-c', 'IOBlockStorageDriver', '-d', '1']);
  let read = 0;
  let write = 0;
  for (const m of stdout.matchAll(/"Bytes \(Read\)"=(\d+)/g)) read += Number(m[1]);
  for (const m of stdout.matchAll(/"Bytes \(Write\)"=(\d+)/g)) write += Number(m[1]);
  return { read, write };
}

let previous: { at: number; counters: Counters } | undefined;

/**
 * Disk read/write rate in bytes per second across all disks, averaged over
 * the interval since the previous call. The first call returns 0. A disk
 * being ejected lowers the sums; that is clamped to 0.
 */
export async function readDiskRates(): Promise<{ read: number; write: number }> {
  const counters = await readCounters();
  const at = Date.now();
  const prev = previous;
  previous = { at, counters };
  if (!prev) return { read: 0, write: 0 };
  const seconds = (at - prev.at) / 1000;
  if (seconds <= 0) return { read: 0, write: 0 };
  return {
    read: Math.max(0, (counters.read - prev.counters.read) / seconds),
    write: Math.max(0, (counters.write - prev.counters.write) / seconds),
  };
}
