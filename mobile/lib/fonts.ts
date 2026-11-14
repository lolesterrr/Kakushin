import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black";
import { PatrickHand_400Regular } from "@expo-google-fonts/patrick-hand";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";

/**
 * Fonts loaded once at the root. Display is for headings and big numbers, hand is the friendly accent, and mono is
 * for labels, fields and chips, like the column heads of a ledger (the same as the website).
 */
export const fontMap = { ArchivoBlack_400Regular, PatrickHand_400Regular, IBMPlexMono_400Regular, IBMPlexMono_500Medium };
export const F = { display: "ArchivoBlack_400Regular", hand: "PatrickHand_400Regular", mono: "IBMPlexMono_400Regular", monoMed: "IBMPlexMono_500Medium" } as const;

/** Topic slugs as people read them: "social-impact" becomes "Social impact", "ai" becomes "AI". */
const TOPIC_NAMES: Record<string, string> = { ai: "AI", fintech: "Fintech", agritech: "Agritech" };
export const topicLabel = (x: string) => TOPIC_NAMES[x] ?? (x.charAt(0).toUpperCase() + x.slice(1)).replace(/-/g, " ");
