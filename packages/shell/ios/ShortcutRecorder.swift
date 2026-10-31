import AppKit
import ExpoModulesCore
import UniformTypeIdentifiers
import ServiceManagement

final class ShortcutRecorder {
  static let shared = ShortcutRecorder()
  private var monitor: Any?
  private var promise: Promise?
  private var owner: ObjectIdentifier?

  var isRecording: Bool { monitor != nil }

  func record(_ promise: Promise, for module: AnyObject) {
    finish(nil)
    self.promise = promise
    owner = ObjectIdentifier(module)
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .rightMouseDown]) { [weak self] event in
      guard let self else { return event }
      guard event.type == .keyDown else {
        self.finish(nil)
        return event
      }
      let flags = event.modifierFlags.intersection([.command, .option, .control, .shift, .function])
      if event.keyCode == 53, flags.subtracting(.function).isEmpty {
        self.finish(nil)
        return nil
      }
      let key = Self.namedKeys[event.keyCode].map(Self.functionKey)
        ?? (event.characters(byApplyingModifiers: []) ?? event.charactersIgnoringModifiers ?? "").lowercased()
      guard !key.isEmpty, key.unicodeScalars.allSatisfy({ $0.value >= 0x20 || [0x03, 0x08, 0x09, 0x0D, 0x1B, 0x7F].contains($0.value) }) else {
        return nil
      }
      let functionKey = key.unicodeScalars.first.map { (0xF704...0xF726).contains($0.value) } ?? false
      guard flags.contains(.command) || flags.contains(.control) || functionKey else {
        NSSound.beep()
        return nil
      }
      var mods: [String] = []
      if flags.contains(.control) { mods.append("control") }
      if flags.contains(.option) { mods.append("option") }
      if flags.contains(.shift) { mods.append("shift") }
      if flags.contains(.command) { mods.append("command") }
      if flags.contains(.function), Self.namedKeys[event.keyCode] == nil, let scalar = key.unicodeScalars.first, scalar.value < 0xF700 {
        mods.append("function")
      }
      self.finish(["key": key, "modifiers": mods])
      return nil
    }
  }

  private static let namedKeys: [UInt16: Int] = [
    123: NSLeftArrowFunctionKey, 124: NSRightArrowFunctionKey, 125: NSDownArrowFunctionKey, 126: NSUpArrowFunctionKey,
    115: NSHomeFunctionKey, 119: NSEndFunctionKey, 116: NSPageUpFunctionKey, 121: NSPageDownFunctionKey,
    117: NSDeleteFunctionKey, 114: NSHelpFunctionKey,
    51: 0x08, 48: 0x09, 36: 0x0D, 76: 0x03, 49: 0x20,
    122: NSF1FunctionKey, 120: NSF2FunctionKey, 99: NSF3FunctionKey, 118: NSF4FunctionKey, 96: NSF5FunctionKey,
    97: NSF6FunctionKey, 98: NSF7FunctionKey, 100: NSF8FunctionKey, 101: NSF9FunctionKey, 109: NSF10FunctionKey,
    103: NSF11FunctionKey, 111: NSF12FunctionKey, 105: NSF13FunctionKey, 107: NSF14FunctionKey, 113: NSF15FunctionKey,
    106: NSF16FunctionKey, 64: NSF17FunctionKey, 79: NSF18FunctionKey, 80: NSF19FunctionKey, 90: NSF20FunctionKey,
  ]

  private static func functionKey(_ code: Int) -> String {
    UnicodeScalar(UInt32(code)).map { String(Character($0)) } ?? ""
  }

  func finish(_ result: [String: Any]?) {
    let pending = stop()
    pending?.resolve(result)
  }

  func abandon(by module: AnyObject) {
    guard owner == ObjectIdentifier(module) else { return }
    _ = stop()
  }

  private func stop() -> Promise? {
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
    owner = nil
    let pending = promise
    promise = nil
    return pending
  }
}
