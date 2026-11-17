import AppKit
import ArdiaCore

extension WindowManager {
  var background: Bool { LaunchConfig.shared.background }
  func keyWindowForClick(_ event: NSEvent) {
    guard NSApp.modalWindow == nil, !background, !event.modifierFlags.contains(.command),
      let window = event.window, id(of: window) != nil, Self.shownOnScreen(window), window.canBecomeKey
    else { return }
    if !NSApp.isActive {
      FocusTrace.record("click in \(window.windowNumber) activates the app")
      NSApp.activate()
      return
    }
    var key = NSApp.keyWindow
    while let k = key, k !== window { key = k.parent }
    guard key == nil else { return }
    FocusTrace.record("click made \(window.windowNumber) key (was \(NSApp.keyWindow?.windowNumber ?? 0))")
    window.makeKey()
  }

  @objc func appActivated() {
    guard NSEvent.pressedMouseButtons & 1 != 0 else { return }
    DispatchQueue.main.async { [weak self] in self?.keyWindowUnderActivatingClick() }
  }

  func keyWindowUnderActivatingClick() {
    guard NSApp.isActive, NSApp.modalWindow == nil, !background else { return }
    let number = NSWindow.windowNumber(at: NSEvent.mouseLocation, belowWindowWithWindowNumber: 0)
    guard let window = NSApp.window(withWindowNumber: number), id(of: window) != nil, Self.shownOnScreen(window), window.canBecomeKey
    else { return }
    var key = NSApp.keyWindow
    while let k = key, k !== window { key = k.parent }
    guard key == nil else { return }
    FocusTrace.record("activating click made \(window.windowNumber) key (was \(NSApp.keyWindow?.windowNumber ?? 0))")
    window.makeKeyAndOrderFront(nil)
  }

  static func shownOnScreen(_ window: NSWindow) -> Bool {
    window.isVisible && window.alphaValue > 0.01 && !window.isMiniaturized
      && NSScreen.screens.contains { $0.frame.intersects(window.frame) }
  }

  @objc func keyWindowChanged() {
    DispatchQueue.main.async { [weak self] in self?.moveKeyOffHiddenWindow() }
  }

  func moveKeyOffHiddenWindow() {
    guard NSApp.isActive, NSApp.modalWindow == nil, !background else { return }
    let key = NSApp.keyWindow
    if let key, id(of: key) != nil || Self.shownOnScreen(key) { return }
    guard let target = NSApp.orderedWindows.first(where: { id(of: $0) != nil && Self.shownOnScreen($0) && $0.canBecomeKey }) else { return }
    FocusTrace.record("moved key to \(target.windowNumber) (was \(key?.windowNumber ?? 0))")
    target.makeKey()
  }
}
