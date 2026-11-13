import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/** The Kakushin logo dot, blinking like a red light. Stays steady when the phone asks for reduced motion. */
export function RedLight({ size = 12 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const fade = (to: number) => Animated.timing(opacity, { toValue: to, duration: 120, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([fade(1), Animated.delay(480), fade(0.2), Animated.delay(480)]));
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => { if (!cancelled && !reduce) loop.start(); }).catch(() => loop.start());
    return () => { cancelled = true; loop.stop(); };
  }, [opacity]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#D93A2B", opacity }} />;
}
