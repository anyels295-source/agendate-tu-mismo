// Genera la pista del video de demo: house alegre (122 BPM, Do mayor, acordes cálidos tipo piano).
// Cada escena tiene su propio arreglo y hay efectos sincronizados con lo que aparece en pantalla.
// Todo se sintetiza acá: sin samples ni música de terceros. Uso: node generar-musica.mjs salida.wav
import { writeFileSync } from "fs";

const SR = 44100;
const DUR = 92;
const BEAT = 60 / 122;
const STEP = BEAT / 4; // semicorchea
const N = SR * DUR;
const drums = new Float32Array(N); // bombo
const music = new Float32Array(N); // todo lo demás: baja un poco con cada bombo
const fx = new Float32Array(N); // efectos sincronizados con la imagen

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

/*
 * Arreglo por escena (los tiempos coinciden con las escenas del video).
 * kick: "four" (cada tiempo), "half" (1 y 3) o null · piano: patrón de acordes · bass: patrón o null
 */
const SCENES = [
  { from: 0, to: 5, name: "titulo", kick: null, clap: false, hatOpen: false, shaker: 0, bass: null, piano: "long", pad: 0.12 },
  { from: 5, to: 13, name: "problema", kick: "half", clap: false, hatOpen: false, shaker: 0.03, bass: "simple", piano: "sparse", pad: 0.07 },
  { from: 13, to: 18, name: "link", kick: "four", clap: true, hatOpen: true, shaker: 0.04, bass: "bounce", piano: "house", pad: 0.04 },
  { from: 18, to: 35, name: "celular", kick: "four", clap: true, hatOpen: true, shaker: 0.04, bass: "bounce", piano: "house", pad: 0.04 },
  { from: 35, to: 48, name: "emails", kick: null, clap: false, hatOpen: false, shaker: 0.025, bass: "simple", piano: "long", pad: 0.12 },
  { from: 48, to: 59, name: "panel", kick: "four", clap: true, hatOpen: true, shaker: 0.04, bass: "bounce", piano: "house", pad: 0.04 },
  { from: 59, to: 70, name: "agenda", kick: "four", clap: true, hatOpen: true, shaker: 0.05, bass: "walk", piano: "house2", pad: 0.04 },
  { from: 70, to: 78, name: "funciones", kick: "four", clap: false, hatOpen: true, shaker: 0.05, bass: "bounce", piano: "sparse", pad: 0.06 },
  { from: 78, to: 85, name: "reportes", kick: "four", clap: true, hatOpen: true, shaker: 0.05, bass: "walk", piano: "house2", pad: 0.05 },
];
const sceneAt = (t) => SCENES.find((s) => t >= s.from && t < s.to) ?? null; // null = cierre

function add(target, start, dur, fn, gain = 1) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, Math.floor((start + dur) * SR));
  for (let i = s0; i < s1; i++) target[i] += fn((i - s0) / SR) * gain;
}
function lowpass() {
  let y = 0;
  return (x, cutoff) => {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    y += a * (x - y);
    return y;
  };
}
function highpass() {
  let prevX = 0, y = 0;
  return (x) => {
    y = 0.95 * (y + x - prevX);
    prevX = x;
    return y;
  };
}
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);

// Instrumentos
const kick = (t) => {
  const f = 50 + 100 * Math.exp(-t * 32);
  return Math.tanh(1.5 * (sine(f, t) * Math.exp(-t * 8) + rnd() * Math.exp(-t * 500) * 0.2));
};
function clap() {
  const hp = highpass();
  return (t) => hp(rnd()) * (Math.exp(-t * 20) + (t > 0.01 ? 0.5 * Math.exp(-(t - 0.01) * 20) : 0));
}
function snare() {
  const hp = highpass();
  return (t) => (0.6 * hp(rnd()) + 0.4 * sine(200, t)) * Math.exp(-t * 25);
}
function hat(open) {
  const hp = highpass(), hp2 = highpass();
  return (t) => hp2(hp(rnd())) * Math.exp(-t * (open ? 22 : 70));
}
// Piano eléctrico cálido: armónicos que se apagan rápido, sin agudos chillones.
function pianoNote(f, decay) {
  return (t) => {
    const env = Math.min(1, t * 250) * Math.exp(-t * decay);
    return (sine(f, t) + 0.45 * sine(2 * f, t) * Math.exp(-t * 4) + 0.2 * sine(3 * f, t) * Math.exp(-t * 7) + 0.08 * sine(4 * f, t) * Math.exp(-t * 10)) * env;
  };
}
const chord = (notes, decay) => (t) => notes.reduce((a, m) => a + pianoNote(midi(m), decay)(t), 0) / notes.length;
function bassNote(f, len) {
  const lp = lowpass();
  return (t) => lp(sine(f, t) + 0.35 * (2 * ((f * t) % 1) - 1), 700) * Math.min(1, t * 300) * Math.min(1, (len - t) * 60) * Math.exp(-t * 3);
}
function pad(notes) {
  const lp = lowpass();
  return (t) => lp(notes.reduce((a, m) => a + sine(midi(m), t) + 0.5 * sine(midi(m) * 1.004, t) + 0.25 * sine(midi(m) * 2, t), 0) / notes.length, 1500);
}
// Efectos
const pop = (f) => (t) => sine(f + 700 * Math.exp(-t * 40), t) * Math.exp(-t * 28);
const click = (t) => (sine(1400, t) * 0.6 + rnd() * 0.3) * Math.exp(-t * 120);
function whoosh(dur) {
  const lp = lowpass();
  return (t) => lp(rnd(), 300 + 4000 * Math.pow(t / dur, 2)) * Math.pow(t / dur, 1.5) * (t > dur - 0.05 ? (dur - t) / 0.05 : 1);
}

// Armonía en Do mayor, un acorde por compás: Fmaj7 - G6 - Em7 - Am7 (alegre y "de avanzar")
const CHORDS = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67]];
const ROOTS = [41, 43, 40, 45]; // F2 G2 E2 A2
const PIANO = {
  long: [0],
  sparse: [0, 10],
  house: [2, 6, 10, 13], // síncopa típica del house
  house2: [0, 3, 6, 10, 12, 14],
};
const BASS = {
  simple: [[0, 8]],
  bounce: [[2, 1.5], [6, 1.5], [10, 1.5], [14, 1.5]], // en contratiempo: el "rebote" del house
  walk: [[0, 2], [2, 1.5], [6, 1.5], [8, 2], [10, 1.5], [14, 1.5]],
};

const kickTimes = [];
const bars = Math.ceil(DUR / (BEAT * 4));
for (let bar = 0; bar < bars; bar++) {
  const ci = bar % 4;
  const t0 = bar * 16 * STEP;
  for (let s = 0; s < 16; s++) {
    const t = t0 + s * STEP;
    if (t >= DUR) break;
    const sc = sceneAt(t);
    if (!sc) continue;
    const beat = s % 4 === 0;
    const beatIdx = s / 4;

    if (beat && (sc.kick === "four" || (sc.kick === "half" && (beatIdx === 0 || beatIdx === 2)))) {
      add(drums, t, 0.4, kick, 0.85);
      kickTimes.push(t);
    }
    if (sc.clap && beat && (beatIdx === 1 || beatIdx === 3)) add(music, t, 0.22, clap(), 0.3);
    if (sc.hatOpen && s % 4 === 2) add(music, t, 0.14, hat(true), 0.1);
    if (sc.shaker && s % 2 === 1) add(music, t, 0.05, hat(false), sc.shaker);

    if (PIANO[sc.piano].includes(s)) {
      const long = sc.piano === "long";
      add(music, t, long ? 2.2 : 0.6, chord(CHORDS[ci], long ? 1.2 : 5), long ? 0.32 : 0.28);
    }
    const bassHit = sc.bass && BASS[sc.bass].find(([pos]) => pos === s);
    if (bassHit) {
      const len = bassHit[1] * STEP;
      add(music, t, len, bassNote(midi(ROOTS[ci]), len), 0.55);
    }
  }
  const sc0 = sceneAt(t0);
  if (sc0) add(music, t0, 16 * STEP, pad(CHORDS[ci]), sc0.pad);
}

// Redobles que suben antes de los cambios fuertes
for (const [start, end] of [[11.5, 13], [76, 78]]) {
  for (let t = start, gap = STEP * 2; t < end; t += gap, gap = Math.max(STEP / 2, gap * 0.9)) {
    add(music, t, 0.12, snare(), 0.1 + 0.22 * ((t - start) / (end - start)));
  }
}
// Subidas suaves antes de los cambios
for (const [start, dur] of [[3, 2], [11, 2], [46, 2], [83, 2]]) {
  const hp = highpass();
  add(music, start, dur, (t) => hp(rnd()) * Math.pow(t / dur, 2.5), 0.28);
}
// "Whoosh" corto al entrar cada escena
for (const t of [18, 35, 59, 70, 78]) add(fx, t - 0.6, 0.6, whoosh(0.6), 0.3);
// Golpes en los momentos fuertes
for (const t of [13, 48, 78, 85]) {
  add(drums, t, 0.5, kick, 0.9);
  const lp = lowpass();
  add(music, t, 1.4, (x) => lp(rnd(), 2500) * Math.exp(-x * 3), 0.25);
}
// Efectos sincronizados con la imagen
for (const t of [5.6, 6.6, 7.6, 8.6]) add(fx, t, 0.15, pop(560), 0.33); // llegan los mensajes del chat
for (const t of [19.4, 23.9, 28.9]) add(fx, t, 0.05, click, 0.28); // pasos en el celular
for (const t of [71.0, 71.45, 71.9, 72.35]) add(fx, t, 0.15, pop(700), 0.28); // aparecen las tarjetas
// Cierre: acorde mayor que se apaga despacio
add(music, 85, 7, chord([48, 55, 60, 64, 67], 0.45), 0.6);
add(music, 85, 7, (t) => pad([48, 55, 60, 64])(t) * Math.exp(-t * 0.4), 0.2);

// "Bombeo" suave: la música baja un poco con cada bombo
let k = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (k + 1 < kickTimes.length && kickTimes[k + 1] <= t) k++;
  const since = kickTimes.length && kickTimes[k] <= t ? t - kickTimes[k] : 10;
  music[i] *= 1 - 0.4 * Math.exp(-since * 10);
}

// Mezcla, normalización y WAV mono de 16 bits
const mix = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) { mix[i] = drums[i] + music[i] + fx[i]; peak = Math.max(peak, Math.abs(mix[i])); }
const out = Buffer.alloc(44 + N * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 2, 4); out.write("WAVE", 8);
out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) out.writeInt16LE(Math.round((mix[i] / peak) * 0.9 * 32767), 44 + i * 2);
writeFileSync(process.argv[2], out);
console.log("ok");
