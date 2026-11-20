// 소리(웹 오디오로 직접 만든다, 파일 없음). 두 갈래로 따로 조절한다(기기마다 저장):
// - 착수음: 돌을 놓을 때 "탁"
// - 효과음: 백 히든(큰 "휘익"), 히든 찾음("지~잉"), 시계 2분·1분 "띡"
// 브라우저는 사용자가 한 번 누른 뒤에야 소리를 허락한다 — 대국 중엔 이미 눌렀다.
import { useSyncExternalStore } from "react";

export type SoundChannel = "stone" | "fx";
export interface ChannelSetting { vol: number; mute: boolean }
export type SoundSettings = Record<SoundChannel, ChannelSetting>;

const KEY = "ddamok.sound";
const DEFAULT: SoundSettings = { stone: { vol: 70, mute: false }, fx: { vol: 70, mute: false } };
const clampVol = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : 70);

function load(): SoundSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const ch = (c: SoundChannel): ChannelSetting => ({ vol: clampVol(v?.[c]?.vol), mute: v?.[c]?.mute === true });
    return { stone: ch("stone"), fx: ch("fx") };
  } catch {
    return DEFAULT;
  }
}

let current: SoundSettings = load();
const listeners = new Set<() => void>();

export function setSound(channel: SoundChannel, patch: Partial<ChannelSetting>) {
  current = { ...current, [channel]: { ...current[channel], ...patch } };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  for (const f of listeners) f();
}

export function useSound(): SoundSettings {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => current,
    () => current,
  );
}

let ctx: AudioContext | null = null;

/** 소리를 낼 수 있으면 [오디오, 이 갈래의 출력(볼륨 반영)]을 준다 */
function out(channel: SoundChannel): [AudioContext, GainNode] | null {
  const s = current[channel];
  if (s.mute || s.vol <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const g = ctx.createGain();
    g.gain.value = (s.vol / 100) ** 2 * 1.4; // 귀에 고르게 들리도록 제곱
    g.connect(ctx.destination);
    return [ctx, g];
  } catch {
    return null; // 소리를 못 내도 대국은 계속
  }
}

function noise(a: AudioContext, sec: number, decay: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(a.sampleRate * sec));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

/** 착수음 "탁": 짧은 잡음을 나무 소리 대역으로 거르고 낮은 "톡"을 살짝 더한다 */
export function stoneClick() {
  const o = out("stone");
  if (!o) return;
  const [a, master] = o;
  const t = a.currentTime;
  const src = noise(a, 0.06, 4);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;
  const g = a.createGain();
  g.gain.value = 0.65;
  src.connect(bp).connect(g).connect(master);
  const osc = a.createOscillator(), og = a.createGain();
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.05);
  og.gain.setValueAtTime(0.13, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(og).connect(master);
  src.start(t);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** 백 히든: 바람이 휘몰아치듯 올라가는 "휘익" + 낮은 울림 */
export function hiddenSound() {
  const o = out("fx");
  if (!o) return;
  const [a, master] = o;
  const t = a.currentTime;
  const src = noise(a, 0.9, 1.5);
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.55);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(bp).connect(g).connect(master);
  const osc = a.createOscillator(), og = a.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.8);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  osc.connect(og).connect(master);
  src.start(t);
  osc.start(t);
  osc.stop(t + 0.9);
}

/** 히든 찾음: 떨리며 올라가는 "지~잉" */
export function foundSound() {
  const o = out("fx");
  if (!o) return;
  const [a, master] = o;
  const t = a.currentTime;
  for (const [f, v] of [[880, 0.16], [1320, 0.1], [1764, 0.05]] as const) {
    const osc = a.createOscillator(), g = a.createGain();
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.5);
    const lfo = a.createOscillator(), lg = a.createGain();
    lfo.frequency.value = 18;
    lg.gain.value = f * 0.02;
    lfo.connect(lg).connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    osc.connect(g).connect(master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
  }
}

/** 짧은 "띡"(시계 알림) */
export function beep(freq = 1320, ms = 90) {
  const o = out("fx");
  if (!o) return;
  const [a, master] = o;
  const osc = a.createOscillator(), g = a.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}
