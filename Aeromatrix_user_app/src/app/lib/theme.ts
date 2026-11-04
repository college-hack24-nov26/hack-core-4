import type { ThemeChoice } from '../userStore';

export type Theme = 'cream' | 'dark';

/** The theme in force: the user's choice, or the phone's own light / dark setting. */
export function effectiveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === 'light' ? 'cream' : choice === 'dark' ? 'dark' : systemDark ? 'dark' : 'cream';
}
