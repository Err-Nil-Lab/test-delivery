// Blok bangunan suara sintesis (WebAudio). Semua SFX dan musik dirakit dari fungsi kecil ini,
// jadi tidak ada file aset. t0 = waktu mulai dalam detik AudioContext.

const noiseBuffers = new WeakMap();

function noiseBuffer(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return noiseBuffers.get(ctx);
}

// Envelope attack–decay pada sebuah GainNode.
function envelope(gainNode, t0, { gain = 0.3, attack = 0.005, dur = 0.2 }) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
}

// Nada tunggal, opsional sweep frekuensi (freqEnd).
export function tone(ctx, out, { freq = 440, freqEnd, type = 'sine', dur = 0.2, attack = 0.005, gain = 0.3, delay = 0, detune = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + attack + dur);
  envelope(g, t0, { gain, attack, dur });
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + attack + dur + 0.05);
}

// Semburan noise yang difilter (ledakan, guntur, debu, gesek).
export function noise(ctx, out, { dur = 0.3, attack = 0.005, gain = 0.3, filter = 'lowpass', freq = 1200, freqEnd, q = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t0 + attack + dur);
  const g = ctx.createGain();
  envelope(g, t0, { gain, attack, dur });
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + attack + dur + 0.05);
}

// Rangkaian nada berurutan (arpeggio / fanfare).
export function arpeggio(ctx, out, freqs, { step = 0.07, ...opts }) {
  freqs.forEach((freq, i) => tone(ctx, out, { ...opts, freq, delay: (opts.delay ?? 0) + i * step }));
}

// Sumber noise yang terus berbunyi (ban berdecit, dengung): dikendalikan lewat gain & filter yang dikembalikan.
export function loopNoise(ctx, out, { filter = 'bandpass', freq = 1500, q = 4 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(out);
  src.start();
  return { gain: g.gain, filter: f };
}

// Frekuensi dari nomor nada MIDI.
export const midi = (n) => 440 * 2 ** ((n - 69) / 12);
