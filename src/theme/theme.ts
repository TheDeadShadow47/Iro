/**
 * Iro — design tokens.
 *
 * Modeled on Honya's MD3-inspired token set so the two apps share a design
 * rhythm (surface elevation steps, pill radiuses, tight extra-bold
 * typography, 48dp touch targets) while Iro carries its own warm booklike
 * palette. No component styles live outside this file.
 */

export type ThemeKey =
  | "light"
  | "dark"
  | "ocean"
  | "amethyst"
  | "ember"
  | "arctic"
  | "forest"
  | "blossom"
  | "coffee"
  | "sage"
  | "rosewood"
  | "parchment"
  | "lemon";

export interface IroTheme {
  key: ThemeKey;
  name: string;
  description: string;
  /** App background (paper). */
  background: string;
  /** Base surface for cards and sheets. */
  surface: string;
  /** +1 elevation step (tab bar, raised rows). */
  surface1: string;
  /** +2 elevation step (chips, sheets). */
  surface2: string;
  /** +3 elevation step (icon wells, pressed states). */
  surface3: string;
  /** Hairlines, borders, unselected outlines. */
  outline: string;
  /** Primary accent (coral). */
  primary: string;
  /** Content on top of `primary` fills. */
  onPrimary: string;
  /** Tinted container for selected/active states (pill tabs, chips). */
  primaryContainer: string;
  /** Content on top of `primaryContainer`. */
  onPrimaryContainer: string;
  /** Secondary accent (soft indigo). */
  secondary: string;
  /** Tinted container for genre chips / tonal buttons. */
  secondaryContainer: string;
  /** Content on top of `secondaryContainer`. */
  onSecondaryContainer: string;
  /** Primary text (ink). */
  text: string;
  /** Secondary/tertiary text. */
  textMuted: string;
  error: string;
}

export const THEMES: Record<ThemeKey, IroTheme> = {
  light: {
    key: "light",
    name: "Iro Paper",
    description: "Warm paper light theme",
    background: "#F9F5EC",
    surface: "#FFFFFF",
    surface1: "#F4EFE3",
    surface2: "#ECE5D4",
    surface3: "#E3DAC4",
    outline: "#DCD2BD",
    primary: "#E56B6B",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FAD9D4",
    onPrimaryContainer: "#6B2620",
    secondary: "#6B88B5",
    secondaryContainer: "#E3EAF6",
    onSecondaryContainer: "#2E4061",
    text: "#1A2436",
    textMuted: "#737B8D",
    error: "#BA1A1A",
  },
  dark: {
    key: "dark",
    name: "Iro Ink",
    description: "Balanced dark theme",
    background: "#121212",
    surface: "#1E252D",
    surface1: "#252E37",
    surface2: "#2C3742",
    surface3: "#34404D",
    outline: "#44505C",
    primary: "#F08A75",
    onPrimary: "#3A120B",
    primaryContainer: "#5B2A22",
    onPrimaryContainer: "#FFDAD1",
    secondary: "#9FB6DB",
    secondaryContainer: "#3A4B6B",
    onSecondaryContainer: "#D7E3F8",
    text: "#EDEAE2",
    textMuted: "#A0A7B1",
    error: "#FFB4AB",
  },
  // The eleven themes below derive their `secondary` and
  // `onSecondaryContainer` tokens programmatically from each theme's
  // `secondaryContainer` hue via a consistent HSL lighten/darken formula,
  // so contrast behaves consistently across the whole set: dark themes
  // get a light `secondary` + near-white `onSecondaryContainer`; light
  // themes get a deep `secondary` + near-black `onSecondaryContainer`.
  ocean: {
    key: "ocean",
    name: "Ocean",
    description: "Deep blue underwater tones",
    background: "#071A24",
    surface: "#0D2935",
    surface1: "#122F3D",
    surface2: "#163646",
    surface3: "#1B3D4F",
    outline: "#254A58",
    primary: "#28B8C7",
    onPrimary: "#04262B",
    primaryContainer: "#0F4A55",
    onPrimaryContainer: "#B8EDF2",
    secondary: "#8DD5E2",
    secondaryContainer: "#225059",
    onSecondaryContainer: "#DDECEE",
    text: "#E7F7FA",
    textMuted: "#91B8C0",
    error: "#FFB4AB",
  },
  amethyst: {
    key: "amethyst",
    name: "Amethyst",
    description: "Rich purple jewel tones",
    background: "#120D1C",
    surface: "#1D1529",
    surface1: "#231A30",
    surface2: "#282038",
    surface3: "#2E253F",
    outline: "#4A3F5C",
    primary: "#9B6DFF",
    onPrimary: "#160B2E",
    primaryContainer: "#3B2770",
    onPrimaryContainer: "#E2D5FF",
    secondary: "#B193DC",
    secondaryContainer: "#382259",
    onSecondaryContainer: "#E4DDEE",
    text: "#F3EDFF",
    textMuted: "#B5A7C9",
    error: "#FFB4AB",
  },
  ember: {
    key: "ember",
    name: "Ember",
    description: "Warm ember glow",
    background: "#1A0F0C",
    surface: "#291714",
    surface1: "#301C18",
    surface2: "#37211C",
    surface3: "#3E2721",
    outline: "#59433C",
    primary: "#E87845",
    onPrimary: "#2B0D03",
    primaryContainer: "#5A2A1C",
    onPrimaryContainer: "#FFE2CC",
    secondary: "#E29E8D",
    secondaryContainer: "#592D22",
    onSecondaryContainer: "#EEE0DD",
    text: "#FFF1E8",
    textMuted: "#C9A99B",
    error: "#FFB4AB",
  },
  arctic: {
    key: "arctic",
    name: "Arctic",
    description: "Crisp cool light theme",
    background: "#F4F8FB",
    surface: "#FFFFFF",
    surface1: "#EDF3F8",
    surface2: "#E6EDF4",
    surface3: "#DFE8F0",
    outline: "#C4D0DA",
    primary: "#3B82B6",
    onPrimary: "#FFFFFF",
    primaryContainer: "#D3E7F7",
    onPrimaryContainer: "#0E3A5C",
    secondary: "#2E6B94",
    secondaryContainer: "#DAE8F1",
    onSecondaryContainer: "#1C374A",
    text: "#17232D",
    textMuted: "#667784",
    error: "#BA1A1A",
  },
  forest: {
    key: "forest",
    name: "Forest",
    description: "Earthy green tones",
    background: "#0F1512",
    surface: "#131A16",
    surface1: "#18211C",
    surface2: "#1D2821",
    surface3: "#233028",
    outline: "#2F3D34",
    primary: "#8FD4A8",
    onPrimary: "#0D2F1C",
    primaryContainer: "#1D3F2C",
    onPrimaryContainer: "#C9F0D6",
    secondary: "#A9C6B4",
    secondaryContainer: "#31493A",
    onSecondaryContainer: "#E0EBE4",
    text: "#E2ECE5",
    textMuted: "#A0B0A5",
    error: "#FFB4AB",
  },
  blossom: {
    key: "blossom",
    name: "Blossom",
    description: "Soft rose light",
    background: "#FFF8F9",
    surface: "#FFFFFF",
    surface1: "#FDEEF1",
    surface2: "#F8E3E8",
    surface3: "#F2D6DC",
    outline: "#D8C0C6",
    primary: "#B0485F",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FFD9E0",
    onPrimaryContainer: "#400412",
    secondary: "#8A3747",
    secondaryContainer: "#F0DBDF",
    onSecondaryContainer: "#491D25",
    text: "#241A1C",
    textMuted: "#6E6063",
    error: "#BA1A1A",
  },
  coffee: {
    key: "coffee",
    name: "Coffee",
    description: "Warm cozy brown tones",
    background: "#17120E",
    surface: "#241B15",
    surface1: "#2B2018",
    surface2: "#32251D",
    surface3: "#392B22",
    outline: "#4A3A2E",
    primary: "#D39A6A",
    onPrimary: "#2C1706",
    primaryContainer: "#59351C",
    onPrimaryContainer: "#F6D6B3",
    secondary: "#D9B396",
    secondaryContainer: "#593A22",
    onSecondaryContainer: "#EEE4DD",
    text: "#F7EBDD",
    textMuted: "#B9A494",
    error: "#FFB4AB",
  },
  sage: {
    key: "sage",
    name: "Sage",
    description: "Calm muted green tones",
    background: "#111713",
    surface: "#1B231D",
    surface1: "#212A23",
    surface2: "#273028",
    surface3: "#2D372E",
    outline: "#41503F",
    primary: "#9CAF88",
    onPrimary: "#1C2818",
    primaryContainer: "#3A4730",
    onPrimaryContainer: "#DCE8CE",
    secondary: "#B5C4AB",
    secondaryContainer: "#3B4832",
    onSecondaryContainer: "#E5EAE1",
    text: "#F0F4EA",
    textMuted: "#AAB5A2",
    error: "#FFB4AB",
  },
  rosewood: {
    key: "rosewood",
    name: "Rosewood",
    description: "Deep burgundy tones",
    background: "#170D0E",
    surface: "#261416",
    surface1: "#2D191B",
    surface2: "#341F21",
    surface3: "#3B2426",
    outline: "#563B3E",
    primary: "#C66A72",
    onPrimary: "#2D0A0E",
    primaryContainer: "#5C2730",
    onPrimaryContainer: "#F6D2D2",
    secondary: "#D09FA6",
    secondaryContainer: "#52282E",
    onSecondaryContainer: "#EEDDDF",
    text: "#F8E9E7",
    textMuted: "#B99A99",
    error: "#FFB4AB",
  },
  parchment: {
    key: "parchment",
    name: "Parchment",
    description: "Warm vintage paper tones",
    background: "#F1E7D2",
    surface: "#FFF8E9",
    surface1: "#F7EEDD",
    surface2: "#F0E5D0",
    surface3: "#E9DCC4",
    outline: "#D5C3A6",
    primary: "#8A5A32",
    onPrimary: "#FFFFFF",
    primaryContainer: "#EBD8BE",
    onPrimaryContainer: "#3A2410",
    secondary: "#946B2D",
    secondaryContainer: "#F1E8DA",
    onSecondaryContainer: "#4A371C",
    text: "#30251D",
    textMuted: "#76695C",
    error: "#BA1A1A",
  },
  lemon: {
    key: "lemon",
    name: "Lemon",
    description: "Warm golden yellow tones",
    background: "#17150A",
    surface: "#25220F",
    surface1: "#2C2915",
    surface2: "#34301B",
    surface3: "#3B3720",
    outline: "#554F2E",
    primary: "#E4C84A",
    onPrimary: "#2B2402",
    primaryContainer: "#5E541C",
    onPrimaryContainer: "#FAECB0",
    secondary: "#E2D28D",
    secondaryContainer: "#594E22",
    onSecondaryContainer: "#EEEBDD",
    text: "#FFF9D8",
    textMuted: "#BDB58A",
    error: "#FFB4AB",
  },
};

/** Iro's two official default themes — shown first/pinned in the theme picker. */
export const DEFAULT_THEME_KEYS: ThemeKey[] = ["light", "dark"];

/** Radius scale shared with Honya. */
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

/** Spacing rhythm shared with Honya. */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Typography scale — heavy extra-bold titles, 800-weight kickers. */
export const TYPE = {
  display: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
  section: { fontSize: 16, fontWeight: "800", letterSpacing: -0.1 },
  body: { fontSize: 14.5, fontWeight: "500" },
  bodyStrong: { fontSize: 14.5, fontWeight: "700" },
  label: { fontSize: 12.5, fontWeight: "600" },
  caption: { fontSize: 11.5, fontWeight: "600" },
} as const;

/** Minimum comfortable Android touch target. */
export const TOUCH = 48;

/** Elevation that stays cheap on Android (no shadow rasterisation). */
export const ELEVATION = {
  none: {},
  low: { elevation: 2 },
  medium: { elevation: 4 },
  high: { elevation: 8 },
};

/** Adds an alpha channel to a #rrggbb token. */
export const alpha = (hex: string, a = 1): string => {
  const v = Math.round(Math.min(Math.max(a, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${v}`;
};

/** True when the theme background is dark (drives status bar, blur tints). */
export const isThemeDark = (theme: IroTheme): boolean => {
  const hex = String(theme?.background ?? "#000000").replace("#", "");
  const r = parseInt(hex.slice(0, 2) || "0", 16);
  const g = parseInt(hex.slice(2, 4) || "0", 16);
  const b = parseInt(hex.slice(4, 6) || "0", 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};