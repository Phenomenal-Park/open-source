// 짧은 "띡" 소리(웹 오디오, 파일 없음). 브라우저는 사용자가 한 번 누른 뒤에야 소리를 허락한다 — 대국 중엔 이미 눌렀다.
let ctx: AudioContext | null = null;

export function beep(freq = 1320, ms = 90) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch { /* 소리를 못 내도 대국은 계속 */ }
}
