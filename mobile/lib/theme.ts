import { useColorScheme } from "react-native";

const light = { ledger: "#fbfaf6", bg: "#f5f3ed", card: "#ffffff", sand: "#e6e1d6", ink: "#111111", muted: "#5f5b52", line: "#d6d0c2", red: "#c8321f", redText: "#b52a18", onRed: "#ffffff", moss: "#4e7a3a", gold: "#8a6a22", indigo: "#2f4f8f", band: "#111111", onBand: "#f5f3ed" };
const dark: typeof light = { ledger: "#181716", bg: "#141311", card: "#1d1b18", sand: "#2a2723", ink: "#f2efe6", muted: "#a9a498", line: "#3a362f", red: "#d9503c", redText: "#ee7b69", onRed: "#ffffff", moss: "#8fbf78", gold: "#d4b062", indigo: "#8aa6e0", band: "#0b0a09", onBand: "#f2efe6" };

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
// Fills that always carry white text, in both modes.
export const FILL = { red: "#c8321f", gold: "#8a6a22", moss: "#4e7a3a", indigo: "#2f4f8f", ink: "#111111" } as const;

/** Soft depth used on cards, banners and the floating bar. */
export const shadow = (strength = 0.25) => ({ shadowColor: "#111111", shadowOpacity: strength, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 });
