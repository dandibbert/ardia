import AppKit
import ArdiaCore

extension WindowManager {
  func moveToSavedDisplay(_ id: String) {
    guard let entry = managed[id], !entry.window.styleMask.contains(.fullScreen),
          let screen = ArdiaDisplayIdentity.screen(withIdentifier: entry.display), entry.window.screen !== screen
    else { return }
    entry.window.setFrame(ArdiaDisplayIdentity.frame(entry.window.frame, on: screen), display: false)
  }
}
