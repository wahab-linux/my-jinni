// Apply the saved theme before styles load; storage restrictions must never block the app.
(() => {
  const key = 'my-jinni-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  let storageAvailable = true;
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch { storageAvailable = false; }

  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appearance = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#10121c' : '#f5f5fa');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', `Appearance: ${preference === 'system' ? 'Match device' : preference === 'light' ? 'Light' : 'Dark'}`);
      document.getElementById('theme-label').textContent = preference === 'system' ? 'Auto' : preference === 'light' ? 'Light' : 'Dark';
      for (const input of document.querySelectorAll('[name="appearance"]')) input.checked = input.value === preference;
      document.getElementById('theme-status').textContent = preference === 'system'
        ? `Follows your device. Currently ${theme}.`
        : `${theme === 'light' ? 'Light' : 'Dark'} appearance.${storageAvailable ? ' Remembered for your next visit.' : ' For this visit; browser storage is unavailable.'}`;
    }
  }
  apply();
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('appearance-options').addEventListener('change', (event) => {
      if (!['light', 'dark', 'system'].includes(event.target.value)) return;
      preference = event.target.value;
      try { localStorage.setItem(key, preference); } catch { storageAvailable = false; }
      apply();
    });
    document.getElementById('appearance-done').addEventListener('click', () => {
      document.getElementById('appearance-picker').open = false;
      document.getElementById('theme-toggle').focus();
    });
  });
})();

// Background motion is optional, independent of appearance and sound.
(() => {
  const key = 'my-jinni-waves';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Keep the switch usable without storage. */ }
  const apply = () => {
    document.documentElement.dataset.waves = enabled && !reduced.matches ? 'on' : 'off';
    const input = document.getElementById('waves-toggle');
    if (!input) return;
    input.checked = enabled && !reduced.matches;
    input.disabled = reduced.matches;
    document.getElementById('waves-status').textContent = reduced.matches
      ? 'Waves are still because your device requests reduced motion.'
      : enabled ? 'Slow, subtle movement. Turn it off whenever you like.' : 'Waves are still. Your other settings stay the same.';
  };
  apply();
  reduced.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    enabled = event.newValue !== 'off'; apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('waves-toggle').addEventListener('change', (event) => {
      enabled = event.target.checked;
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Session-only preference. */ }
      apply();
    });
  });
})();
