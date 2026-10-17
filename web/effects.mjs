export function playFeedback(context, kind = 'success') {
  if (!context) return false;
  try {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'success' ? 560 : 320, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'success' ? 760 : 260, now + 0.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    return true;
  } catch { return false; }
}

export function setupSound(button, environment = window) {
  let enabled = false;
  let context;
  try { enabled = environment.localStorage.getItem('my-jinni-sound') === 'on'; } catch { /* Optional preference. */ }
  const update = () => {
    button.setAttribute('aria-pressed', String(enabled));
    button.querySelector('span').textContent = enabled ? 'Sound on' : 'Sound off';
    button.title = enabled ? 'Turn sound effects off' : 'Turn sound effects on';
  };
  const play = (kind = 'success') => {
    if (!enabled) return;
    try {
      const Audio = environment.AudioContext || environment.webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      void Promise.resolve(context.resume()).then(() => playFeedback(context, kind)).catch(() => {});
    } catch { /* Feedback must never interrupt a decision. */ }
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { environment.localStorage.setItem('my-jinni-sound', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    update();
    if (enabled) play();
  });
  update();
  return { play };
}
