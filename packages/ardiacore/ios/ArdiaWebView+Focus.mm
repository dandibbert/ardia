#import "ArdiaWebViewInternal.h"
#import "ArdiaEarlyWindow.h"

using namespace ardia_web_view;

namespace {

constexpr CFTimeInterval kFocusRestoreWindow = 1;
}

@implementation ArdiaWebView (Focus)

static BOOL InTabPage(NSView *view) {
  for (NSView *v = view; v; v = v.superview)
    if ([v isKindOfClass:ArdiaWebView.class]) return !((ArdiaWebView *)v)->_standalone;
  return NO;
}

static BOOL StrayResponder(NSView *focused, NSWindow *window) {
  if (!focused) return NO;
  if (focused.window != window || focused.isHiddenOrHasHiddenAncestor) return YES;
  for (NSView *v = focused; v; v = v.superview)
    if ([v isKindOfClass:ArdiaWebView.class]) return !((ArdiaWebView *)v)->_visible;
  return NO;
}

static void RefreshPageKeyState(NSView *root, NSWindow *window) {
  if (!root || !window.isKeyWindow) return;
  SEL becameKey = NSSelectorFromString(@"windowDidBecomeKey:");
  NSNotification *note = [NSNotification notificationWithName:NSWindowDidBecomeKeyNotification object:window];
  NSMutableArray<NSView *> *queue = [NSMutableArray arrayWithObject:root];
  while (queue.count) {
    NSView *view = queue.firstObject;
    [queue removeObjectAtIndex:0];
    if (view.window == window && [NSStringFromClass(view.class) isEqualToString:@"RenderWidgetHostViewCocoa"] &&
        [view respondsToSelector:becameKey]) {
      IMP imp = [view methodForSelector:becameKey];
      ((void (*)(id, SEL, NSNotification *))imp)(view, becameKey, note);
    }
    [queue addObjectsFromArray:view.subviews];
  }
}

static ArdiaWebView *ShownPageUnder(NSEvent *event) {
  NSView *content = event.window.contentView;
  NSView *root = content.superview ?: content;
  NSView *hit = root ? [root hitTest:[root convertPoint:event.locationInWindow fromView:nil]] : nil;
  for (NSView *view = hit; view; view = view.superview)
    if ([view isKindOfClass:ArdiaWebView.class]) return (ArdiaWebView *)view;
  return nil;
}

- (void)refreshPageKeyStateSoon {
  __weak ArdiaWebView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    ArdiaWebView *shown = weakSelf;
    if (shown && shown->_visible) RefreshPageKeyState(shown->_tab.view, shown.window);
  });
}

+ (void)installPageKeyWatch {
  static id strayFocusClicks, windowKeys;
  if (strayFocusClicks) return;
  strayFocusClicks = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown handler:^NSEvent *(NSEvent *event) {
    ArdiaWebView *page = ShownPageUnder(event);
    NSWindow *window = event.window;
    NSResponder *responder = window.firstResponder;
    NSView *focused = [responder isKindOfClass:NSView.class] ? (NSView *)responder : nil;
    if (page && page->_visible && !page->_standalone && focused && ![focused isDescendantOf:page] && StrayResponder(focused, window))
      [window makeFirstResponder:nil];
    if (page && page->_visible) RefreshPageKeyState(page->_tab.view, window);
    return event;
  }];
  windowKeys = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowDidBecomeKeyNotification object:nil queue:nil usingBlock:^(NSNotification *note) {
    __weak NSWindow *weakWindow = note.object;
    dispatch_async(dispatch_get_main_queue(), ^{
      NSWindow *window = weakWindow;
      if (!window.isKeyWindow) return;
      for (ArdiaWebView *view in LiveViews().allObjects)
        if (view.window == window && view->_visible) RefreshPageKeyState(view->_tab.view, window);
      NSResponder *responder = window.firstResponder;
      NSView *focused = [responder isKindOfClass:NSView.class] ? (NSView *)responder : nil;
      if (focused ? !StrayResponder(focused, window) : (responder && responder != window)) return;
      for (ArdiaWebView *view in LiveViews().allObjects)
        if (view.window == window && view->_visible && !view->_standalone && view->_tab && view->_focus.page != ArdiaPageFocus::Elsewhere) {
          if (focused) [window makeFirstResponder:nil];
          [view focusPage];
          return;
        }
    });
  }];
}

+ (void)keepOutgoingFocusFrom:(NSResponder *)responder {
  if (ArdiaWebView *view = [ArdiaWebView holding:responder]) {
    [view storePageFocusFrom:responder];
    view->_focus.keepsOutgoing = YES;
  }
}

+ (void)endOutgoingFocusFrom:(NSResponder *)responder {
  if (ArdiaWebView *view = [ArdiaWebView holding:responder]) view->_focus.keepsOutgoing = NO;
}

+ (ArdiaWebView *)holding:(id)responder {
  NSView *outgoing = [responder isKindOfClass:NSView.class] ? responder : nil;
  for (ArdiaWebView *view in LiveViews().allObjects)
    if (outgoing && view.window == outgoing.window && [outgoing isDescendantOf:view]) return view;
  return nil;
}

- (void)storePageFocus {
  NSResponder *responder = self.window.firstResponder;
  const BOOL unfocused = !responder || responder == self.window;
  const BOOL snapshotted = _focus.keepsOutgoing;
  _focus.keepsOutgoing = NO;
  if (snapshotted && unfocused) {
    _focus.onActivate = NO;
    return;
  }
  [self storePageFocusFrom:responder];
}

- (void)storePageFocusFrom:(NSResponder *)responder {
  _focus.onActivate = NO;
  _focus.devTools = nil;
  NSWindow *window = self.window;
  if (!window || !_tab) return;
  NSView *view = [responder isKindOfClass:NSView.class] ? (NSView *)responder : nil;
  if (view && _tab.view && [view isDescendantOf:_tab.view]) {
    _focus.page = ArdiaPageFocus::Page;
  } else if (view && _devtoolsView && [view isDescendantOf:_devtoolsView]) {
    _focus.page = ArdiaPageFocus::DevTools;
    _focus.devTools = view;
  } else if (!responder || responder == window || (view && InTabPage(view))) {
    _focus.page = ArdiaPageFocus::Unknown;
  } else {
    _focus.page = ArdiaPageFocus::Elsewhere;
  }
}

- (void)requestFocusRestore {
  [self requestFocusRestoreIn:self.window];
}

- (void)requestFocusRestoreIn:(NSWindow *)window {
  if (_standalone || !_tab || !window) return;
  _focus.onActivate = YES;
  _focus.activatedAt = CACurrentMediaTime();
  _focus.activatedIn = window;
  [self restoreFocusIfDue];
  if (_focus.onActivate) [self schedulePainting];
}

- (void)restoreFocusIfDue {
  if (!_focus.onActivate) return;
  NSWindow *window = self.window;
  NSView *page = _tab.view;
  if (!window || window != _focus.activatedIn || !page || _standalone || page.superview != self ||
      CACurrentMediaTime() - _focus.activatedAt > kFocusRestoreWindow) {
    _focus.onActivate = NO;
    return;
  }
  if (!_visible || page.isHiddenOrHasHiddenAncestor) return;
  [self takeFocusFromLingeringPane];
  _focus.onActivate = NO;
  RefreshPageKeyState(page, window);
  NSResponder *responder = window.firstResponder;
  NSView *view = [responder isKindOfClass:NSView.class] ? (NSView *)responder : nil;
  const BOOL stray = StrayResponder(view, window);
  if (view && !stray && [view isDescendantOf:self]) return;
  if (responder && responder != window && !stray && !(view && InTabPage(view))) return;
  NSView *devTools = _focus.devTools;
  if (_focus.page == ArdiaPageFocus::DevTools && devTools.window == window && _devtoolsView && [devTools isDescendantOf:_devtoolsView]) {
    [window makeFirstResponder:devTools];
  } else if (_focus.page != ArdiaPageFocus::Elsewhere) {
    [self focusPage];
  }
}

- (void)focusAfterLoad {
  if (_visible && _tab) [self focusPage];
}

- (void)focusPage {
  if ([ArdiaEarlyWindow veils:_tab]) return [ArdiaEarlyWindow requestFocus:_tab];
  RefreshPageKeyState(_tab.view, self.window);
  [_tab focus];
}

- (void)tabDidGainFocus:(ArdiaCoreTab *)tab {
  [self emit:@"focus" payload:@{}];
}

@end
