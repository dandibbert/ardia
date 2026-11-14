import { useEffect, useRef, useState } from "react";
import { Animated, AppState } from "react-native";
import { easeInOutCubic } from "./dockMotion";
import { curve, duration, spring } from "../ui/motion";
import { ARC_PEEK_OUT_MS, ARC_PEEK_SPRING } from "./tokens";
import { backgroundInstance } from "../../state/app/appSettings";

const SLIDE_MS = duration.base;
const HIDE_DELAY_MS = 120;
const ARC_IN = spring(ARC_PEEK_SPRING);
const appInFront = () => backgroundInstance || AppState.currentState === "active";

type PeekView = "hidden" | "shown" | "leaving";
type PeekGate =
  | { out: false; waitingForFocus: boolean }
  | { out: true; heldBack: boolean; hideTimer?: ReturnType<typeof setTimeout> };

const IN: PeekGate = { out: false, waitingForFocus: false };
const WAITING_FOR_FOCUS: PeekGate = { out: false, waitingForFocus: true };
const waitsForFocus = (gate: PeekGate) => !gate.out && gate.waitingForFocus;

export function usePeek(
  enabled: boolean,
  arc = false,
  held: () => boolean = () => false,
  onSlideOut: () => void = () => {},
  onOpen: (bounce: boolean) => void = () => {},
) {
  const slide = useRef(new Animated.Value(0)).current;
  const [view, setView] = useState<PeekView>("hidden");
  const live = view !== "hidden";
  const leaving = view === "leaving";
  const gate = useRef<PeekGate>(IN);
  const clearHideTimer = () => {
    if (gate.current.out) clearTimeout(gate.current.hideTimer);
  };
  const animate = (to: number, done?: () => void) =>
    (arc
      ? to > 0
        ? Animated.spring(slide, { toValue: to, ...ARC_IN, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.01, useNativeDriver: true })
        : Animated.timing(slide, { toValue: to, duration: ARC_PEEK_OUT_MS, easing: easeInOutCubic, useNativeDriver: true })
      : Animated.timing(slide, { toValue: to, duration: SLIDE_MS, easing: curve.enter, useNativeDriver: true })
    ).start(({ finished }) => finished && done?.());
  const slideOut = () => {
    gate.current = IN;
    setView("leaving");
    onSlideOut();
    animate(0, () => setView("hidden"));
  };
  const show = () => {
    clearHideTimer();
    const wasOut = gate.current.out;
    if (wasOut) gate.current = { out: true, heldBack: false };
    if (!enabled) return;
    if (!wasOut && !appInFront()) {
      gate.current = WAITING_FOR_FOCUS;
      return;
    }
    if (!wasOut) onOpen(live);
    gate.current = { out: true, heldBack: false };
    setView("shown");
    animate(1);
  };
  const cancelPending = (pointerStillAtEdge = false) => {
    if (waitsForFocus(gate.current) && !pointerStillAtEdge) gate.current = IN;
  };
  const hide = () => {
    const current = gate.current;
    if (!current.out) return cancelPending();
    clearTimeout(current.hideTimer);
    const hideTimer = setTimeout(() => {
      if (held()) gate.current = { out: true, heldBack: true };
      else slideOut();
    }, HIDE_DELAY_MS);
    gate.current = { out: true, heldBack: current.heldBack, hideTimer };
  };
  const recheck = () => {
    const current = gate.current;
    if (!current.out || !current.heldBack || held()) return;
    gate.current = { ...current, heldBack: false };
    hide();
  };
  const latestShow = useRef(show);
  latestShow.current = show;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && waitsForFocus(gate.current) && latestShow.current());
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (enabled) return;
    clearHideTimer();
    gate.current = gate.current.out ? { out: true, heldBack: gate.current.heldBack } : IN;
    if (live) slideOut();
  }, [enabled]);
  useEffect(() => () => clearHideTimer(), []);
  return { slide, live, leaving, show, hide, recheck, cancelPending };
}
