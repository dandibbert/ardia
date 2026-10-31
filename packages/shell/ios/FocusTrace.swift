import AppKit

enum FocusTrace {
  private static let capacity = 120
  private static var lines: [(at: TimeInterval, text: String, count: Int)] = []
  private static var monitor: Any?
  private static let responderWatches = NSMapTable<NSWindow, NSKeyValueObservation>.weakToStrongObjects()

  static func watch(_ window: NSWindow) {
    guard responderWatches.object(forKey: window) == nil else { return }
    let watch = window.observe(\.firstResponder) { window, _ in
      record("responder of #\(window.windowNumber) → \(responder(of: window))")
    }
    responderWatches.setObject(watch, forKey: window)
  }

  static func install() {
    guard monitor == nil else { return }
    let center = NotificationCenter.default
    let names: [(Notification.Name, String)] = [
      (NSApplication.didBecomeActiveNotification, "app active"), (NSApplication.didResignActiveNotification, "app inactive"),
      (NSWindow.didBecomeKeyNotification, "became key"), (NSWindow.didResignKeyNotification, "resigned key"),
      (NSWindow.didBecomeMainNotification, "became main"), (NSWindow.didResignMainNotification, "resigned main"),
    ]
    for (name, label) in names {
      center.addObserver(forName: name, object: nil, queue: nil) { note in
        record("\(label) \((note.object as? NSWindow).map(describe) ?? "")")
      }
    }
    monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .keyDown]) { event in
      let what = event.type == .keyDown ? (event.modifierFlags.contains(.command) ? "⌘key" : "key") : "click"
      record("\(what) in \(event.window.map(describe) ?? "no window") key=\(NSApp.keyWindow.map(describe) ?? "nil") fr=\(responder(of: NSApp.keyWindow))")
      return event
    }
  }

  static func record(_ line: String) {
    let now = ProcessInfo.processInfo.systemUptime
    if let last = lines.last, last.text == line {
      lines[lines.count - 1] = (now, line, last.count + 1)
      return
    }
    lines.append((now, line, 1))
    if lines.count > capacity { lines.removeFirst(lines.count - capacity) }
  }

  static func report() -> String {
    var out = [
      "Focus: active=\(NSApp.isActive) modal=\(NSApp.modalWindow.map(describe) ?? "nil")",
      "key=\(NSApp.keyWindow.map(describe) ?? "nil") fr=\(responder(of: NSApp.keyWindow))",
      "main=\(NSApp.mainWindow.map(describe) ?? "nil") fr=\(responder(of: NSApp.mainWindow))",
      "input=\(inputClient())",
      "holders: switcher=\(SwitcherHold.capturing) typeAhead=\(WindowManager.shared.typeAhead != nil) gate=\(FocusHandoff.shared.gatesKeyWindow)",
      "windows:",
    ]
    out += NSApp.orderedWindows.map { "  " + describe($0) }
    out += NSApp.windows.filter { !NSApp.orderedWindows.contains($0) && $0.isVisible }.map { "  unordered " + describe($0) }
    out.append("timeline:")
    out += lines.map { "  " + String(format: "%.3f ", $0.at) + $0.text + ($0.count > 1 ? " ×\($0.count)" : "") }
    return out.joined(separator: "\n")
  }

  private static func describe(_ window: NSWindow) -> String {
    let name = WindowManager.shared.id(of: window).map { "app:\($0)" } ?? String(describing: type(of: window))
    var flags: [String] = []
    if window.isKeyWindow { flags.append("KEY") }
    if window.isMainWindow { flags.append("MAIN") }
    if !window.isVisible { flags.append("hidden") }
    if window.alphaValue < 0.99 { flags.append(String(format: "a%.2f", window.alphaValue)) }
    if !window.canBecomeKey { flags.append("nokey") }
    if window.isMiniaturized { flags.append("mini") }
    if !window.isOnActiveSpace { flags.append("otherSpace") }
    if window.ignoresMouseEvents { flags.append("nomouse") }
    if window.level != .normal { flags.append("L\(window.level.rawValue)") }
    if let parent = window.parent { flags.append("parent#\(parent.windowNumber)") }
    let f = window.frame
    return "\(name)#\(window.windowNumber) [\(flags.joined(separator: ","))] \(Int(f.minX)),\(Int(f.minY)) \(Int(f.width))x\(Int(f.height))"
  }

  private static func responder(of window: NSWindow?) -> String {
    guard let window, let responder = window.firstResponder else { return "nil" }
    if responder === window { return "window" }
    var text = String(describing: type(of: responder))
    if let view = responder as? NSView {
      if view.window !== window { text += "(other window)" }
      if view.isHiddenOrHasHiddenAncestor { text += "(hidden)" }
      if view.visibleRect.isEmpty { text += "(no visible rect)" }
    }
    return text
  }

  private static func inputClient() -> String {
    guard let context = NSTextInputContext.current else { return "nil" }
    let client = context.client
    var text = String(describing: type(of: client))
    if let view = client as? NSView {
      text += " in " + (view.window.map(describe) ?? "no window")
      if view.isHiddenOrHasHiddenAncestor { text += " (hidden)" }
    }
    return text
  }
}
