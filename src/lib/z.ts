/** Z-index scale — Design Spec §04. Mirrors the --z-* custom properties in globals.css. */
export const Z = {
  toolbar: 5,
  sortBackdrop: 20,
  sortMenu: 21,
  header: 30,
  sugBackdrop: 31,
  sugBox: 32,
  sugPanel: 33,
  drawerBackdrop: 40,
  sidebar: 50,
  settingsBackdrop: 60,
  settingsPopover: 61,
  highlightPopup: 80,
  toast: 90,
  quiz: 95,
  lightbox: 100,
} as const;

export type ZLayer = keyof typeof Z;
