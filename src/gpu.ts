import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GpuStats = {
  /** GPU busy time in percent (0–100), as Activity Monitor's GPU History. */
  utilization: number;
  /** System memory currently in use by the GPU driver, in bytes. */
  memoryBytes: number;
};

function numberOf(stats: string, key: string): number | undefined {
  const m = stats.match(new RegExp(`"${key}"=(\\d+)`));
  return m ? parseInt(m[1], 10) : undefined;
}

/**
 * Reads GPU stats from the IOAccelerator's `PerformanceStatistics` dictionary
 * (`ioreg`, no root needed, ~15 ms). Machines with several GPUs report one
 * accelerator each; the busiest one wins and their memory is summed.
 */
export async function readGpuStats(): Promise<GpuStats> {
  const { stdout } = await execFileAsync('ioreg', ['-r', '-c', 'IOAccelerator', '-d', '1']);
  let utilization = 0;
  let memoryBytes = 0;
  for (const line of stdout.split('\n')) {
    if (!line.includes('"PerformanceStatistics"')) continue;
    utilization = Math.max(utilization, numberOf(line, 'Device Utilization %') ?? 0);
    memoryBytes += numberOf(line, 'In use system memory') ?? 0;
  }
  return {
    utilization: Math.max(0, Math.min(100, utilization)),
    memoryBytes,
  };
}
