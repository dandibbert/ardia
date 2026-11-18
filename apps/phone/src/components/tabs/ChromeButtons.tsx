import { StyleSheet, type ViewProps } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { newIncognitoTab, newRegularTab, newTab, reopenLastClosed } from "../../state/browse/store";
import { capsule, ChromeSurface, PressScale, rolesFor, startLayout, Symbol, type MenuItem, type SymbolName } from "../ui";

export function plusMenuItems(incognito: boolean, canReopen: boolean): MenuItem[] {
  return [
    ...(incognito
      ? [
          { label: "New Tab", icon: "plus" as const, onPress: newRegularTab },
          { label: "New Incognito Tab", icon: "eyes" as const, onPress: newTab },
        ]
      : [{ label: "New Incognito Tab", icon: "eyes" as const, onPress: newIncognitoTab }]),
    ...(canReopen ? [{ label: "Reopen Closed Tab", icon: "arrowUturnBackward" as const, onPress: reopenLastClosed }] : []),
  ];
}

type Look = { dark: boolean; incognito?: boolean };

export type ChromeFade = { glassShown?: boolean; glassShownMs?: number; glyphFade?: SharedValue<number> };

export function FadingGlyphs({ fade, style, ...rest }: ViewProps & { fade?: SharedValue<number> }) {
  const faded = useAnimatedStyle(() => (fade ? { opacity: fade.value } : {}));
  return <Animated.View {...rest} style={fade ? [style, faded] : style} />;
}

export function GlassCircleButton({ icon, label, testID, diameter = startLayout.barCircle, dark, incognito = false, glassShown, glassShownMs, glyphFade, onPress }: Look & ChromeFade & { icon: SymbolName; label: string; testID: string; diameter?: number; onPress: () => void }) {
  const size = { width: diameter, height: diameter };
  return (
    <PressScale label={label} onPress={onPress} style={[styles.centered, size]}>
      <ChromeSurface testID={testID} shape="circle" cornerRadius={capsule(diameter)} incognito={incognito} dark={dark} shown={glassShown} shownMs={glassShownMs} style={[styles.centered, size]}>
        <FadingGlyphs testID={`${testID}Glyph`} pointerEvents="none" fade={glyphFade}>
          <Symbol name={icon} size={startLayout.circleGlyph} color={rolesFor(dark).label} />
        </FadingGlyphs>
      </ChromeSurface>
    </PressScale>
  );
}

export function GlassPlusButton({ width, label, testID, dark, incognito = false, glassShown, glassShownMs, glyphFade, onPress, onLongPress }: Look & ChromeFade & { width: number; label: string; testID: string; onPress: () => void; onLongPress: () => void }) {
  const size = { width, height: startLayout.barPlus.height };
  return (
    <PressScale label={label} hint="Touch and hold for more options." onPress={onPress} onLongPress={onLongPress} style={size}>
      <ChromeSurface testID={testID} shape="capsule" cornerRadius={capsule(size.height)} incognito={incognito} dark={dark} shown={glassShown} shownMs={glassShownMs} style={[styles.centered, size]}>
        <FadingGlyphs testID={`${testID}Glyph`} pointerEvents="none" fade={glyphFade}>
          <Symbol name="plus" size={startLayout.plusGlyph} color={rolesFor(dark).label} />
        </FadingGlyphs>
      </ChromeSurface>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", justifyContent: "center" },
});
