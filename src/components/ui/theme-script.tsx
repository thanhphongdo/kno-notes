import { PREFS_KEY } from '@/lib/theme';

/**
 * Runs before first paint, in <head>. Must not import anything at runtime —
 * it is serialized as a string. Keeps <html> attributes authoritative so React
 * hydration never overwrites them (the root layout renders data-theme="light"
 * as the SSR default and <html> carries suppressHydrationWarning).
 */
export const themeScriptSource = `(function(){
  var d = document.documentElement;
  var theme = 'light', accent = 'teal', fs = 17;
  try {
    var p = JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)}) || '{}');
    if (p.theme === 'dark') theme = 'dark';
    if (p.accent === 'indigo' || p.accent === 'plum') accent = p.accent;
    var raw = p.fontSize;
    var n = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) ? Number(raw) : NaN;
    fs = isFinite(n) ? Math.min(22, Math.max(14, Math.round(n))) : 17;
  } catch (e) {}
  d.setAttribute('data-theme', theme);
  d.setAttribute('data-accent', accent);
  d.style.setProperty('--fs', fs + 'px');
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}
