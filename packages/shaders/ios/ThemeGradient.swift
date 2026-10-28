import AppKit

struct ThemeGradient: Equatable {
  var colors: [SIMD4<Float>] = []
  var opacity: CGFloat = 1
  var baseAlpha: CGFloat = 0
  var grain: CGFloat = 0
  var texture = "grain"
  var appearance = "auto"
  var angle: CGFloat = ArcGradientLayer.defaultAngle

  var isEmpty: Bool { colors.isEmpty }

  static func parse(_ flat: [Double]) -> [SIMD4<Float>] {
    let starts: [Int] = Array(stride(from: 0, to: flat.count - 3, by: 4).prefix(3))
    return starts.map { (i: Int) -> SIMD4<Float> in
      let r = Float(flat[i]), g = Float(flat[i + 1]), b = Float(flat[i + 2]), a = Float(flat[i + 3])
      return SIMD4<Float>(r, g, b, a)
    }
  }

  var forcedAppearance: NSAppearance? {
    switch appearance {
    case "dark": return NSAppearance(named: .darkAqua)
    case "light": return NSAppearance(named: .aqua)
    default: return nil
    }
  }
}
