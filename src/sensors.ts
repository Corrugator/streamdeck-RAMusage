import { execFile } from 'node:child_process';
import { chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type Fan = { rpm: number; min: number; max: number };

export type TemperatureSensor = 'cpu' | 'cpuMax' | 'battery' | 'ssd';

export type SensorReadings = {
  /** Degrees Celsius; a sensor is missing when the Mac doesn't have it. */
  temps: Partial<Record<TemperatureSensor, number>>;
  fans: Fan[];
  /** Total system power in watts (SMC PSTR), if reported. */
  power?: number;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
};

// bin/sensors sits next to the bundled bin/plugin.js.
const HELPER = fileURLToPath(new URL('./sensors', import.meta.url));
/** Temperature and fan keys on the same refresh share one helper run. */
const CACHE_MS = 800;

let cached: { at: number; value: Promise<SensorReadings> } | undefined;
let prepared = false;

/**
 * Makes the helper runnable once before its first use:
 * - the .streamDeckPlugin archive doesn't keep the executable bit, so set it;
 * - a plugin downloaded from the web can carry the quarantine flag, which
 *   makes Gatekeeper block the helper. It's our own file, so drop the flag
 *   (failure just means there was none).
 */
async function prepare(): Promise<void> {
  if (prepared) return;
  prepared = true;
  await chmod(HELPER, 0o755).catch(() => undefined);
  await execFileAsync('xattr', ['-d', 'com.apple.quarantine', HELPER]).catch(() => undefined);
}

async function run(): Promise<SensorReadings> {
  await prepare();
  const { stdout } = await execFileAsync(HELPER, [], { timeout: 5000 });
  return JSON.parse(stdout) as SensorReadings;
}

/**
 * Temperatures, fans, system power and thermal state from the bundled Swift
 * helper (IOHID + SMC, no root). Results are cached briefly so several keys
 * refreshing together cost one helper run (~0.2 s, mostly IOHID).
 */
export function readSensors(): Promise<SensorReadings> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = run();
  cached = { at: now, value };
  value.catch(() => {
    if (cached?.value === value) cached = undefined;
  });
  return value;
}
