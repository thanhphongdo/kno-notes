'use client';

/**
 * Hook entry point for the prefs store. The React state lives with the provider
 * so exactly one module owns it; this file is the import path feature
 * components use.
 */
export {
  PrefsProvider, usePrefs, PREFS_SYNC_DEBOUNCE_MS,
  type PrefsContextValue, type PrefsProviderProps,
} from '@/components/providers/prefs-provider';
