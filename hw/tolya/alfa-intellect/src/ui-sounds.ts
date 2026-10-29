export type UiSound = "tap" | "navigate" | "toggle" | "send" | "success" | "error";
export const soundPreferenceKey = "alfa-ui-sounds";
let context: AudioContext | undefined;
let installed = false;
let lastPlayed = 0;

/** Short, quiet notes distinguish actions without a continuous background track. */
export function soundRecipe(kind: UiSound): number[] {
  return {tap: [420], navigate: [440, 554], toggle: [523, 659], send: [494, 660], success: [523, 659, 784], error: [330, 294]}[kind];
}
export function soundsEnabled() {
  try { return localStorage.getItem(soundPreferenceKey) !== "off"; } catch { return true; }
}
export function setSoundsEnabled(enabled: boolean) {
  try { localStorage.setItem(soundPreferenceKey, enabled ? "on" : "off"); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("alfa-sounds-preference"));
}
export function playUiSound(kind: UiSound) {
  if (!context || context.state !== "running" || !soundsEnabled() || Date.now() - lastPlayed < 95) return false;
  try {
  lastPlayed = Date.now();
  soundRecipe(kind).forEach((frequency, index) => {
    const start = context!.currentTime + index * .055;
    const oscillator = context!.createOscillator(), gain = context!.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.012, start + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
    oscillator.connect(gain); gain.connect(context!.destination);
    oscillator.start(start); oscillator.stop(start + .2);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
  return true;
  } catch {
    // Sound is optional. Device/browser audio errors must never fail a UI action or API response.
    return false;
  }
}
export async function activateUiSound(kind?: UiSound): Promise<boolean> {
  if (!soundsEnabled() || typeof window === "undefined") return false;
  try {
    const Audio = window.AudioContext || (window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if (!Audio) return false;
    if (!context || context.state === "closed") context = new Audio();
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") return false;
    if (kind && Date.now() - lastPlayed < 95) return true;
    return kind ? playUiSound(kind) : true;
  } catch { return false; }
}
/** Audio is unlocked only by a real gesture, as required by browsers. */
export function startUiSounds() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const unlock = () => {
    void activateUiSound();
  };
  document.addEventListener("pointerdown", unlock, {passive: true});
  document.addEventListener("keydown", event => {if (["Enter", " "].includes(event.key)) unlock();}, {passive: true});
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest("button,a,summary,input[type=checkbox],input[type=radio]");
    if (!control || control.hasAttribute("disabled") || control.hasAttribute("data-sound-silent")) return;
    const submit = control instanceof HTMLButtonElement && control.type === "submit" && control.form;
    void activateUiSound(submit ? "send" : control.matches("a") ? "navigate" : control.matches("input,[aria-pressed],[role=switch]") ? "toggle" : "tap");
  }, true);
  document.addEventListener("submit", () => playUiSound("send"), true);
  document.addEventListener("invalid", () => playUiSound("error"), true);
}
