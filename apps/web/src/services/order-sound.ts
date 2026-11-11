let context: AudioContext | null = null;
export const orderSoundReady = () => context?.state === "running";
const changed = () => window.dispatchEvent(new Event("urfood:order-sound"));

export async function unlockOrderSound(): Promise<boolean> {
  try {
    if (!context || context.state === "closed") {
      context = new AudioContext();
      context.addEventListener("statechange", changed);
    }
    if (context.state !== "running") await context.resume();
    changed();
    return orderSoundReady();
  } catch { changed(); return false; }
}

export function ringOrderSound(): boolean {
  if (!context || !orderSoundReady()) return false;
  try {
    // Two short chimes; no external audio file or download is needed.
    for (const delay of [0, .65]) {
      [880, 1320, 1760].forEach((frequency, index) => {
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        const start = context!.currentTime + delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(index === 0 ? .2 : .08, start);
        gain.gain.exponentialRampToValueAtTime(.001, start + .6);
        oscillator.connect(gain); gain.connect(context!.destination);
        oscillator.start(start); oscillator.stop(start + .6);
      });
    }
    return true;
  } catch { changed(); return false; }
}
