// Sensor helper for the System Usage plugin.
//
// Prints one JSON object with temperatures, fans, system power and thermal
// state, then exits. No root needed:
// - Apple Silicon temperatures come from the IOHID event system (private but
//   stable API used by Stats / iStat Menus).
// - Fans, power and Intel temperatures come from the AppleSMC user client.
//
// Build: npm run build:native  (universal arm64 + x86_64)

import Foundation
import IOKit

// MARK: - IOHID temperature sensors

@_silgen_name("IOHIDEventSystemClientCreate")
func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventSystemClientSetMatching")
func IOHIDEventSystemClientSetMatching(_ client: AnyObject, _ matching: CFDictionary) -> Int32
@_silgen_name("IOHIDEventSystemClientCopyServices")
func IOHIDEventSystemClientCopyServices(_ client: AnyObject) -> Unmanaged<CFArray>?
@_silgen_name("IOHIDServiceClientCopyProperty")
func IOHIDServiceClientCopyProperty(_ service: AnyObject, _ key: CFString) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDServiceClientCopyEvent")
func IOHIDServiceClientCopyEvent(_ service: AnyObject, _ type: Int64, _ options: Int32, _ timestamp: Int64) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventGetFloatValue")
func IOHIDEventGetFloatValue(_ event: AnyObject, _ field: Int32) -> Double

let kIOHIDEventTypeTemperature: Int64 = 15

/// Sensor name → readings (several services can share a name).
func readHidTemperatures() -> [String: [Double]] {
  guard let client = IOHIDEventSystemClientCreate(kCFAllocatorDefault)?.takeRetainedValue() else { return [:] }
  // Usage page 0xff00 / usage 5 = Apple vendor temperature sensors.
  _ = IOHIDEventSystemClientSetMatching(client, ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary)
  guard let services = IOHIDEventSystemClientCopyServices(client)?.takeRetainedValue() as? [AnyObject] else { return [:] }
  var result: [String: [Double]] = [:]
  for service in services {
    guard
      let name = IOHIDServiceClientCopyProperty(service, "Product" as CFString)?.takeRetainedValue() as? String,
      let event = IOHIDServiceClientCopyEvent(service, kIOHIDEventTypeTemperature, 0, 0)?.takeRetainedValue()
    else { continue }
    let value = IOHIDEventGetFloatValue(event, Int32(kIOHIDEventTypeTemperature << 16))
    // Unused channels report nonsense like -9200 °C.
    if value > -20 && value < 150 { result[name, default: []].append(value) }
  }
  return result
}

// MARK: - SMC

struct SMCKeyInfo {
  var dataSize: UInt32 = 0
  var dataType: UInt32 = 0
  var dataAttributes: UInt8 = 0
}

/// Mirrors the kernel's SMCParamStruct (80 bytes).
struct SMCParam {
  var key: UInt32 = 0
  var vers = (UInt8(0), UInt8(0), UInt8(0), UInt8(0), UInt16(0))
  var pLimit = (UInt16(0), UInt16(0), UInt32(0), UInt32(0), UInt32(0))
  var keyInfo = SMCKeyInfo()
  var padding: UInt16 = 0
  var result: UInt8 = 0
  var status: UInt8 = 0
  var data8: UInt8 = 0
  var data32: UInt32 = 0
  var bytes: (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
              UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
              UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
              UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8) =
    (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
}

final class SMC {
  private var connection: io_connect_t = 0

  init?() {
    let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"))
    guard service != 0 else { return nil }
    defer { IOObjectRelease(service) }
    guard IOServiceOpen(service, mach_task_self_, 0, &connection) == KERN_SUCCESS else { return nil }
  }

  deinit { IOServiceClose(connection) }

  private func call(_ input: inout SMCParam) -> Bool {
    var output = SMCParam()
    var size = MemoryLayout<SMCParam>.stride
    let r = IOConnectCallStructMethod(connection, 2, &input, MemoryLayout<SMCParam>.stride, &output, &size)
    input = output
    return r == KERN_SUCCESS && output.result == 0
  }

  private static func fourCC(_ s: String) -> UInt32 {
    s.utf8.reduce(0) { $0 << 8 | UInt32($1) }
  }

  /// Reads a key and decodes the common numeric SMC types.
  func number(_ key: String) -> Double? {
    let code = SMC.fourCC(key)
    var info = SMCParam()
    info.key = code
    info.data8 = 9 // kSMCGetKeyInfo
    guard call(&info) else { return nil }

    // The reply does not echo the key, so set it again for the read.
    var read = SMCParam()
    read.key = code
    read.keyInfo = info.keyInfo
    read.data8 = 5 // kSMCReadKey
    guard call(&read) else { return nil }

    let size = Int(info.keyInfo.dataSize)
    let b = withUnsafeBytes(of: read.bytes) { Array($0.prefix(size)) }
    let t = info.keyInfo.dataType
    let type = String(bytes: [UInt8(t >> 24), UInt8(t >> 16 & 0xff), UInt8(t >> 8 & 0xff), UInt8(t & 0xff)], encoding: .ascii) ?? ""

    switch (type, size) {
    case ("flt ", 4): return Double(b.withUnsafeBytes { $0.loadUnaligned(as: Float.self) })
    case ("ui8 ", 1): return Double(b[0])
    case ("ui16", 2): return Double(UInt16(b[0]) << 8 | UInt16(b[1]))
    case ("sp78", 2): return Double(Int16(bitPattern: UInt16(b[0]) << 8 | UInt16(b[1]))) / 256
    case ("fpe2", 2): return Double(UInt16(b[0]) << 8 | UInt16(b[1])) / 4
    default: return nil
    }
  }
}

// MARK: - Output

func average(_ values: [Double]) -> Double? {
  values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
}

/// One decimal, as a Decimal so JSON prints 45.3 rather than 45.299999999999997.
func rounded(_ v: Double?) -> Decimal? {
  v.map { Decimal(string: String(format: "%.1f", $0)) ?? Decimal($0) }
}

let hid = readHidTemperatures()
let smc = SMC()

// Apple Silicon: "PMU tdie*" are the SoC die sensors, "gas gauge battery" the
// battery and "NAND CH0 temp" the SSD. Intel: SMC proximity/die keys.
let die = hid.filter { $0.key.hasPrefix("PMU tdie") }.flatMap { $0.value }
let intelCpu = ["TC0P", "TC0D", "TC0E", "TC0F"].lazy.compactMap { smc?.number($0) }.first { $0 > 0 }
let cpuAverage = average(die) ?? intelCpu
let cpuMax = die.max() ?? intelCpu
let battery = average(hid["gas gauge battery"] ?? []) ?? smc?.number("TB0T")
let ssd = average(hid.filter { $0.key.hasPrefix("NAND") }.flatMap { $0.value })

var fans: [[String: Double]] = []
let fanCount = Int(smc?.number("FNum") ?? 0)
for i in 0..<min(fanCount, 8) {
  guard let rpm = smc?.number("F\(i)Ac") else { continue }
  fans.append([
    "rpm": rpm.rounded(),
    "min": (smc?.number("F\(i)Mn") ?? 0).rounded(),
    "max": (smc?.number("F\(i)Mx") ?? 0).rounded(),
  ])
}

let thermalStates = ["nominal", "fair", "serious", "critical"]
var output: [String: Any] = [
  "fans": fans,
  "thermalState": thermalStates[min(ProcessInfo.processInfo.thermalState.rawValue, 3)],
]
var temps: [String: Decimal] = [:]
if let v = rounded(cpuAverage) { temps["cpu"] = v }
if let v = rounded(cpuMax) { temps["cpuMax"] = v }
if let v = rounded(battery) { temps["battery"] = v }
if let v = rounded(ssd) { temps["ssd"] = v }
output["temps"] = temps
if let power = smc?.number("PSTR"), power > 0 { output["power"] = rounded(power) }

let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
