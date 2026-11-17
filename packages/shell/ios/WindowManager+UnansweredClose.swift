import AppKit
import ArdiaCore

extension ManagedWindow {
  static let closeAnswerWithin: TimeInterval = 1

  var jsMissedClose: Bool {
    guard kind == .small, !closingFromJS, let asked = closeAskedAt else { return false }
    return ProcessInfo.processInfo.systemUptime - asked >= Self.closeAnswerWithin
  }

  func askToClose() {
    if closeAskedAt == nil { closeAskedAt = ProcessInfo.processInfo.systemUptime }
  }
}

extension WindowManager {
  func closesWithoutAnswer(_ id: String) -> Bool {
    guard let entry = managed[id], entry.kind == .small else { return false }
    if entry.jsMissedClose {
      FocusTrace.record("closing \(entry.window.windowNumber) without the app: its last close went unanswered")
      return true
    }
    entry.askToClose()
    return false
  }

  func closeUnansweredSmallKeyWindow() -> Bool {
    guard let id = keyWindowId, let entry = managed[id], entry.kind == .small else { return false }
    guard closesWithoutAnswer(id) else { return false }
    entry.window.close()
    return true
  }

  func closeHeard(id: String) {
    managed[id]?.closeAskedAt = nil
  }
}
