export type DesktopThemeId =
  | 'classic-teal'
  | 'classic-blue'
  | 'desert-high-contrast'
  | 'dark-slate';

export interface DesktopTheme {
  id: DesktopThemeId;
  name: string;
  shortName: string;
  description: string;
  badge: string;
  preview: {
    desktop: string;
    surface: string;
    titleFrom: string;
    titleTo: string;
    titleText: string;
    inactiveTitle: string;
    fieldBg: string;
    text: string;
    borderDark: string;
  };
}

export const DEFAULT_THEME_ID: DesktopThemeId = 'classic-teal';

export const DESKTOP_THEMES: DesktopTheme[] = [
  {
    id: 'classic-teal',
    name: 'Classic Win98 Teal',
    shortName: 'Win98 Teal',
    description: 'Original Windows 98 teal desktop with classic silver-gray 3D chrome and navy titlebars.',
    badge: 'Default',
    preview: {
      desktop: '#008080',
      surface: '#c0c0c0',
      titleFrom: '#000080',
      titleTo: '#1084d0',
      titleText: '#ffffff',
      inactiveTitle: '#808080',
      fieldBg: '#ffffff',
      text: '#000000',
      borderDark: '#0a0a0a',
    },
  },
  {
    id: 'classic-blue',
    name: 'Classic Blue',
    shortName: 'Classic Blue',
    description: 'Windows 98/2000 slate-blue desktop with crisp cobalt titlebars and warm parchment-gray chrome.',
    badge: 'Retro Standard',
    preview: {
      desktop: '#1e4e8c',
      surface: '#d4d0c8',
      titleFrom: '#0a246a',
      titleTo: '#3b7dd8',
      titleText: '#ffffff',
      inactiveTitle: '#7a8a9e',
      fieldBg: '#ffffff',
      text: '#000000',
      borderDark: '#1b263b',
    },
  },
  {
    id: 'desert-high-contrast',
    name: 'Desert High Contrast',
    shortName: 'Desert HC',
    description: 'Warm sandstone desktop with high-contrast espresso ink, parchment surfaces, and terracotta titlebars.',
    badge: 'High Contrast',
    preview: {
      desktop: '#a68558',
      surface: '#f2e8d5',
      titleFrom: '#6e2c15',
      titleTo: '#a84a22',
      titleText: '#ffffff',
      inactiveTitle: '#8c7a64',
      fieldBg: '#fffdf7',
      text: '#1a1108',
      borderDark: '#26170a',
    },
  },
  {
    id: 'dark-slate',
    name: 'Dark Slate',
    shortName: 'Dark Slate',
    description: 'Midnight workstation palette with deep slate surfaces, crisp ice-white type, and steel bevels.',
    badge: 'Night Mode',
    preview: {
      desktop: '#0f172a',
      surface: '#243044',
      titleFrom: '#0c4a6e',
      titleTo: '#2563eb',
      titleText: '#f8fafc',
      inactiveTitle: '#334155',
      fieldBg: '#111827',
      text: '#f1f5f9',
      borderDark: '#020617',
    },
  },
];

export function isDesktopThemeId(value: string): value is DesktopThemeId {
  return DESKTOP_THEMES.some((t) => t.id === value);
}

export function getThemeById(id: string | null | undefined): DesktopTheme {
  return DESKTOP_THEMES.find((t) => t.id === id) || DESKTOP_THEMES[0];
}

export function resolveThemeAlias(input: string): DesktopThemeId | null {
  const norm = input.trim().toLowerCase().replace(/\s+/g, '-');
  if (norm === 'teal' || norm === 'default' || norm === 'classic-teal' || norm === 'win98') {
    return 'classic-teal';
  }
  if (norm === 'blue' || norm === 'classic-blue') {
    return 'classic-blue';
  }
  if (norm === 'desert' || norm === 'desert-high-contrast' || norm === 'hc' || norm === 'high-contrast') {
    return 'desert-high-contrast';
  }
  if (norm === 'dark' || norm === 'slate' || norm === 'dark-slate' || norm === 'night') {
    return 'dark-slate';
  }
  return null;
}
