internal import ArdiaPhoneNative
internal import Expo
import React
import UIKit

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
    let links = PhoneSystemLinks.shared
    for context in connectionOptions.urlContexts { links.receive(url: context.url) }
    if let item = connectionOptions.shortcutItem { links.receive(shortcutType: item.type) }
    for activity in connectionOptions.userActivities { links.receive(userActivity: activity) }
  }

  static func adopt(_ scene: UIScene) {
    guard !(scene.delegate is SceneDelegate) else { return }
    let adopted = SceneDelegate()
    scene.delegate = adopted
    DispatchQueue.main.async {
      guard adopted.startAdopted(scene) else { return }
      if scene.activationState == .foregroundActive { adopted.sceneDidBecomeActive(scene) }
    }
  }

  private func startAdopted(_ scene: UIScene) -> Bool {
    guard window == nil, let windowScene = scene as? UIWindowScene,
          let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
          let factory = provider.reactNativeFactory else { return false }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    provider.window = window
    factory.startReactNative(withModuleName: provider.reactNativeFactoryModuleName, in: window, initialProperties: initialProperties, launchOptions: nil)
    return true
  }

  override func sceneDidBecomeActive(_ scene: UIScene) {
    super.sceneDidBecomeActive(scene)
    PhoneSystemLinks.shared.sceneBecameActive()
    PhoneSyncHost.shared.sceneBecameActive()
    SpotlightIndexer.shared.update()
  }

  override func sceneWillResignActive(_ scene: UIScene) {
    super.sceneWillResignActive(scene)
    SpotlightIndexer.shared.update()
    PhoneSyncHost.shared.sceneWillResignActive()
  }

  override func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts { PhoneSystemLinks.shared.receive(url: context.url) }
    super.scene(scene, openURLContexts: contexts)
  }

  override func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    PhoneSystemLinks.shared.receive(userActivity: userActivity)
    super.scene(scene, continue: userActivity)
  }

  override func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    PhoneSystemLinks.shared.receive(shortcutType: shortcutItem.type)
    super.windowScene(windowScene, performActionFor: shortcutItem, completionHandler: completionHandler)
  }
}
