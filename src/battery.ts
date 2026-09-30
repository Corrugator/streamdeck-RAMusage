import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type BatteryStats = {
  /** Charge in percent (0–100). */
  percent: number;
  charging: boolean;
  /** On power adapter (charging or held at full). */
  pluggedIn: boolean;
  /** Minutes until empty (discharging) or full (charging); undefined while macOS is estimating. */
  minutesLeft?: number;
  /** Battery power in watts: positive while charging, negative while discharging. */
  watts: number;
  /** Full-charge capacity vs. design capacity in percent. */
  health?: number;
  cycles?: number;
};

function field(out: string, key: string): string | undefined {
  return out.match(new RegExp(`"${key}" = (\\S+)`))?.[1];
}

/** ioreg prints negative values as their unsigned 64-bit two's complement. */
function signed(raw: string | undefined): number {
  if (!raw) return 0;
  return Number(BigInt.asIntN(64, BigInt(raw)));
}

/**
 * Reads the internal battery from the AppleSmartBattery IORegistry entry.
 * Returns undefined on Macs without a battery.
 */
export async function readBattery(): Promise<BatteryStats | undefined> {
  const { stdout } = await execFileAsync('ioreg', ['-r', '-n', 'AppleSmartBattery', '-d', '1']);
  const percent = field(stdout, 'CurrentCapacity');
  if (percent === undefined) return undefined;

  const charging = field(stdout, 'IsCharging') === 'Yes';
  const minutes = Number(field(stdout, charging ? 'AvgTimeToFull' : 'AvgTimeToEmpty'));
  const volts = Number(field(stdout, 'Voltage') ?? 0) / 1000;
  const amps = signed(field(stdout, 'Amperage')) / 1000;
  const full = Number(stdout.match(/"FullChargeCapacity"=(\d+)/)?.[1]);
  const design = Number(stdout.match(/"DesignCapacity"=(\d+)/)?.[1]);
  const cycles = Number(field(stdout, 'CycleCount'));

  return {
    percent: Math.max(0, Math.min(100, Number(percent))),
    charging,
    pluggedIn: field(stdout, 'ExternalConnected') === 'Yes',
    // 65535 = "still calculating".
    minutesLeft: Number.isFinite(minutes) && minutes > 0 && minutes < 65535 ? minutes : undefined,
    watts: volts * amps,
    health: full > 0 && design > 0 ? Math.round((full / design) * 100) : undefined,
    cycles: Number.isFinite(cycles) ? cycles : undefined,
  };
}
