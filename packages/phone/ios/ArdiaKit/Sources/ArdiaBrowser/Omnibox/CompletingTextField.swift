#if canImport(UIKit)
import UIKit

@MainActor
open class CompletingTextField: UITextField {
  public var editor = InlineCompletionEditor()
  public var completionColor = UIColor.systemBlue.withAlphaComponent(0.3)
  public var onSuffixChange: ((String) -> Void)?
  public private(set) var isApplyingCompletion = false
  public var wantsFocus = false
  public var typedLength: Int { (editor.typed as NSString).length }
  public static let horizontalInset: CGFloat = 3
  static let composingLanguages = ["ja", "zh", "ko"]
  private var reportedSuffix = ""

  override open func didMoveToWindow() {
    super.didMoveToWindow()
    guard wantsFocus, window != nil else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self, self.wantsFocus, self.window != nil, !self.isFirstResponder else { return }
      self.becomeFirstResponder()
    }
  }

  private var still: UIView?

  public func selectAllShowingStart() {
    selectedTextRange = textRange(from: beginningOfDocument, to: endOfDocument)
    UIView.performWithoutAnimation {
      layoutIfNeeded()
      for scroller in Self.scrollers(in: self) { scroller.setContentOffset(.zero, animated: false) }
    }
  }

  public var holdsAppearance: Bool {
    get { still != nil }
    set {
      guard newValue != holdsAppearance else { return }
      if newValue, let snapshot = snapshotView(afterScreenUpdates: false) {
        snapshot.frame = bounds
        snapshot.isUserInteractionEnabled = false
        addSubview(snapshot)
        still = snapshot
      } else {
        still?.removeFromSuperview()
        still = nil
      }
    }
  }

  private static func scrollers(in view: UIView) -> [UIScrollView] {
    view.subviews.flatMap { child -> [UIScrollView] in
      let nested = scrollers(in: child)
      guard let scroller = child as? UIScrollView else { return nested }
      return [scroller] + nested
    }
  }

  override open func textRect(forBounds bounds: CGRect) -> CGRect {
    super.textRect(forBounds: bounds).insetBy(dx: Self.horizontalInset, dy: 0)
  }

  override open func editingRect(forBounds bounds: CGRect) -> CGRect {
    super.editingRect(forBounds: bounds).insetBy(dx: Self.horizontalInset, dy: 0)
  }

  override open func placeholderRect(forBounds bounds: CGRect) -> CGRect {
    super.placeholderRect(forBounds: bounds).insetBy(dx: Self.horizontalInset, dy: 0)
  }

  public var usesComposingInput: Bool {
    guard let language = textInputMode?.primaryLanguage else { return false }
    return Self.composingLanguages.contains { language.hasPrefix($0) }
  }

  public var canShowCompletion: Bool {
    isFirstResponder && markedTextRange == nil && !usesComposingInput && (editor.hasSuffix || isCaretAtTypedEnd)
  }

  public var isCaretAtTypedEnd: Bool {
    guard let selection = selectedTextRange, selection.isEmpty else { return false }
    return offset(from: beginningOfDocument, to: selection.start) == typedLength
  }

  public func reset(to value: String) {
    editor.reset(to: value)
    isApplyingCompletion = true
    defer { isApplyingCompletion = false }
    text = value
    reportSuffix()
  }

  public func render() {
    isApplyingCompletion = true
    defer { isApplyingCompletion = false }
    if editor.hasSuffix {
      var attributes = defaultTextAttributes
      let attributed = NSMutableAttributedString(string: editor.typed, attributes: attributes)
      attributes[.backgroundColor] = completionColor
      attributed.append(NSAttributedString(string: editor.suffix, attributes: attributes))
      attributedText = attributed
    } else if text != editor.typed || attributedText?.length != typedLength || hasCompletionStyling {
      text = editor.typed
    }
    if let caret = position(from: beginningOfDocument, offset: typedLength) {
      selectedTextRange = textRange(from: caret, to: caret)
    }
    reportSuffix()
  }

  public func showAccepted() {
    isApplyingCompletion = true
    defer { isApplyingCompletion = false }
    let selection = selectedTextRange
    text = editor.typed
    if let selection { selectedTextRange = selection }
    reportSuffix()
  }

  private func reportSuffix() {
    guard editor.suffix != reportedSuffix else { return }
    reportedSuffix = editor.suffix
    onSuffixChange?(reportedSuffix)
  }

  private var hasCompletionStyling: Bool {
    guard let attributedText, attributedText.length > 0 else { return false }
    var styled = false
    attributedText.enumerateAttribute(.backgroundColor, in: NSRange(location: 0, length: attributedText.length)) { value, _, stop in
      if value != nil {
        styled = true
        stop.pointee = true
      }
    }
    return styled
  }
}

@MainActor
public final class CompletingFieldEditing: NSObject, UITextFieldDelegate {
  public var onTyped: (String) -> Void = { _ in }
  public var onSubmit: (String) -> Void = { _ in }
  public var onFocusChange: (Bool) -> Void = { _ in }
  public var selectsAllOnFocus = false
  public var maxLength: Int?
  private var didSelectAllOnFocus = false

  public override init() {
    super.init()
  }

  public func attach(_ field: CompletingTextField) {
    field.delegate = self
    field.addTarget(self, action: #selector(editingChanged(_:)), for: .editingChanged)
  }

  private func push(_ field: CompletingTextField) {
    onTyped(field.editor.typed)
  }

  @objc public func editingChanged(_ field: CompletingTextField) {
    guard field.markedTextRange == nil, !field.isApplyingCompletion else { return }
    field.editor.syncTyped(field.text ?? "")
    push(field)
  }

  public func offer(_ offer: CompletionOffer?, to field: CompletingTextField) {
    guard field.canShowCompletion else {
      if field.editor.hasSuffix, field.markedTextRange == nil, !field.isFirstResponder || field.usesComposingInput {
        field.editor.dropSuffix()
        field.render()
      }
      return
    }
    if field.editor.receive(offer) { field.render() }
  }

  public func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
    guard let field = textField as? CompletingTextField, !field.isApplyingCompletion else { return true }
    if let maxLength, !string.isEmpty, field.typedLength - min(range.length, field.typedLength) + (string as NSString).length > maxLength { return false }
    guard field.markedTextRange == nil, !field.usesComposingInput else { return true }
    if string.isEmpty {
      guard field.editor.deleteBackward() == .consumed else { return true }
      field.render()
      push(field)
      return false
    }
    guard field.editor.hasSuffix, range.location == field.typedLength else {
      if field.editor.hasSuffix {
        field.editor.accept()
        field.showAccepted()
        push(field)
      }
      _ = field.editor.insert(string)
      return true
    }
    switch field.editor.insert(string) {
    case .consumed:
      field.render()
      push(field)
    case .insertTyped:
      field.render()
      field.insertText(string)
    }
    return false
  }

  public func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    guard let field = textField as? CompletingTextField else { return true }
    let submitted = field.editor.display
    guard !submitted.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
    onSubmit(submitted)
    return false
  }

  public func textFieldDidBeginEditing(_ textField: UITextField) {
    onFocusChange(true)
    if selectsAllOnFocus, !didSelectAllOnFocus, !(textField.text ?? "").isEmpty {
      didSelectAllOnFocus = true
      DispatchQueue.main.async { (textField as? CompletingTextField)?.selectAllShowingStart() ?? textField.selectAll(nil) }
    }
  }

  public func textFieldDidChangeSelection(_ textField: UITextField) {
    guard let field = textField as? CompletingTextField, field.editor.hasSuffix, !field.isApplyingCompletion, !field.isCaretAtTypedEnd else { return }
    field.editor.accept()
    field.showAccepted()
    push(field)
  }

  public func textFieldDidEndEditing(_ textField: UITextField) {
    if let field = textField as? CompletingTextField, field.editor.hasSuffix {
      field.editor.dropSuffix()
      field.render()
    }
    onFocusChange(false)
  }
}
#endif
