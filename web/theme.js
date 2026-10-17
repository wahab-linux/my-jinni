// Apply the saved theme before styles load; storage restrictions must never block the app.
(() => {
  const key = 'my-jinni-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch { /* Theme switching still works when site storage is blocked. */ }

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#10121c' : '#f5f5fa');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      toggle.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    }
  }
  apply();
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory selection. */ }
      apply();
    });
  });
})();
