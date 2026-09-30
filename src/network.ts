import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type Counters = { rx: number; tx: number };

export type NetworkRates = {
  /** Download rate in bytes per second. */
  down: number;
  /** Upload rate in bytes per second. */
  up: number;
};

export type NetworkInterface = { id: string; name: string };

/** Interface selection meaning "all physical Ethernet / Wi-Fi ports". */
export const ALL_INTERFACES = 'all';

// en* are the physical ports (Wi-Fi, Ethernet, Thunderbolt). bridge0, utun*
// (VPN), awdl* etc. carry traffic that is already counted on an en* port.
const PHYSICAL = /^en\d+$/;

/**
 * Parses the `<Link#n>` rows of `netstat -ibn`. Interfaces without a MAC
 * address leave the Address column empty, so the byte counters are taken from
 * the right: … Ibytes Opkts Oerrs Obytes Coll.
 */
async function readCounters(): Promise<Map<string, Counters>> {
  const { stdout } = await execFileAsync('netstat', ['-ibn']);
  const counters = new Map<string, Counters>();
  for (const line of stdout.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || !f[2]?.startsWith('<Link#')) continue;
    const n = f.length;
    counters.set(f[0].replace(/\*$/, ''), {
      rx: Number(f[n - 5]) || 0,
      tx: Number(f[n - 2]) || 0,
    });
  }
  return counters;
}

function sum(counters: Map<string, Counters>, iface: string): Counters {
  let rx = 0;
  let tx = 0;
  for (const [name, c] of counters) {
    if (iface === ALL_INTERFACES ? PHYSICAL.test(name) : name === iface) {
      rx += c.rx;
      tx += c.tx;
    }
  }
  return { rx, tx };
}

let previous: { at: number; counters: Map<string, Counters> } | undefined;

/**
 * Download/upload rate of `iface` (or all physical ports) averaged over the
 * interval since the previous call. The first call has no baseline and
 * returns 0. Counter resets (interface re-plugged) are clamped to 0.
 */
export async function readNetworkRates(iface: string): Promise<NetworkRates> {
  const counters = await readCounters();
  const at = Date.now();
  const prev = previous;
  previous = { at, counters };
  if (!prev) return { down: 0, up: 0 };

  const seconds = (at - prev.at) / 1000;
  if (seconds <= 0) return { down: 0, up: 0 };
  const now = sum(counters, iface);
  const before = sum(prev.counters, iface);
  return {
    down: Math.max(0, (now.rx - before.rx) / seconds),
    up: Math.max(0, (now.tx - before.tx) / seconds),
  };
}

/**
 * Physical interfaces with their user-facing names (e.g. en0 → "Wi-Fi"), for
 * the property inspector's interface picker.
 */
export async function listInterfaces(): Promise<NetworkInterface[]> {
  const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports']);
  const result: NetworkInterface[] = [];
  let port = '';
  for (const line of stdout.split('\n')) {
    const p = line.match(/^Hardware Port:\s*(.+)$/);
    if (p) port = p[1].trim();
    const d = line.match(/^Device:\s*(\S+)/);
    if (d && PHYSICAL.test(d[1])) {
      // Some port names already carry the device, e.g. "Ethernet Adapter (en3)".
      const name = port.includes(`(${d[1]})`) ? port : `${port} (${d[1]})`;
      result.push({ id: d[1], name });
    }
  }
  return result;
}
