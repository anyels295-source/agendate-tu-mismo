// Genera la pista de techno del video de demo (125 BPM, La menor). Cada escena tiene su propio
// arreglo, y hay efectos sincronizados con lo que aparece en pantalla. Todo se sintetiza acá:
// sin samples ni música de terceros. Uso: node generar-musica.mjs salida.wav
import { writeFileSync } from "fs";

const SR = 44100;
const DUR = 92;
const BEAT = 60 / 125;
const STEP = BEAT / 4; // semicorchea
const N = SR * DUR;
const drums = new Float32Array(N); // bombo: no se "aplasta" a sí mismo
const music = new Float32Array(N); // todo lo demás: baja un instante con cada bombo
const fx = new Float32Array(N); // efectos sincronizados con la imagen: no se aplastan

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

/*
 * Arreglo por escena (los tiempos coinciden con las escenas del video):
 * kick: "four" (cada tiempo), "half" (1 y 3) o null · bass: patrón o null · cutoff: [inicio, fin] del filtro del bajo
 */
const SCENES = [
  { from: 0, to: 5, name: "titulo", kick: null, clap: false, hatOpen: false, hatClosed: 0.03, bass: "pulse", cutoff: [220, 700], stabs: false, arp: false, pad: 0.1 },
  { from: 5, to: 13, name: "problema", kick: "half", clap: false, hatOpen: false, hatClosed: 0.05, bass: "sparse", cutoff: [500, 800], stabs: false, arp: false, pad: 0.06 },
  { from: 13, to: 18, name: "link", kick: "four", clap: true, hatOpen: true, hatClosed: 0.06, bass: "roll", cutoff: [1500, 1700], stabs: true, arp: false, pad: 0.04 },
  { from: 18, to: 35, name: "celular", kick: "four", clap: true, hatOpen: true, hatClosed: 0.05, bass: "roll", cutoff: [1200, 1400], stabs: false, arp: true, pad: 0.03 },
  { from: 35, to: 48, name: "emails", kick: null, clap: false, hatOpen: false, hatClosed: 0.035, bass: "long", cutoff: [450, 900], stabs: false, arp: false, pad: 0.13 },
  { from: 48, to: 59, name: "panel", kick: "four", clap: true, hatOpen: true, hatClosed: 0.06, bass: "roll", cutoff: [1600, 1600], stabs: true, arp: false, pad: 0.03 },
  { from: 59, to: 70, name: "agenda", kick: "four", clap: true, hatOpen: true, hatClosed: 0.06, bass: "offbeat", cutoff: [900, 2300], stabs: false, arp: true, pad: 0.03 },
  { from: 70, to: 78, name: "funciones", kick: "four", clap: false, hatOpen: true, hatClosed: 0.07, bass: "roll", cutoff: [1300, 1300], stabs: false, arp: false, pad: 0.05 },
  { from: 78, to: 85, name: "reportes", kick: "four", clap: true, hatOpen: true, hatClosed: 0.07, bass: "roll", cutoff: [1800, 2000], stabs: true, arp: true, pad: 0.04 },
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
const saw = (f, t) => 2 * ((f * t) % 1) - 1;

// Instrumentos
const kick = (t) => {
  const f = 45 + 120 * Math.exp(-t * 35);
  return Math.tanh(1.8 * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6.5) + rnd() * Math.exp(-t * 400) * 0.3));
};
function clap() {
  const hp = highpass();
  return (t) => hp(rnd()) * (Math.exp(-t * 18) + (t > 0.012 ? 0.6 * Math.exp(-(t - 0.012) * 18) : 0));
}
function snare() {
  const hp = highpass();
  return (t) => (0.7 * hp(rnd()) + 0.4 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 25);
}
function hat(open) {
  const hp = highpass(), hp2 = highpass();
  return (t) => hp2(hp(rnd())) * Math.exp(-t * (open ? 18 : 60));
}
function bassNote(f, cutoff, decay = 9) {
  const lp = lowpass();
  return (t) => lp(0.7 * saw(f, t) + 0.5 * saw(f * 1.005, t), cutoff * (0.4 + 1.6 * Math.exp(-t * 14))) * Math.min(1, t * 400) * Math.exp(-t * decay);
}
function stab(fs, cutoff) {
  const lp = lowpass();
  return (t) => lp(fs.reduce((a, f) => a + saw(f, t) + saw(f * 1.004, t), 0) / (fs.length * 2), cutoff * (0.5 + Math.exp(-t * 6))) * Math.min(1, t * 300) * Math.exp(-t * 5);
}
function arpNote(f) {
  const lp = lowpass();
  // Registro medio y filtrado: textura nueva sin el "tin tin" agudo.
  return (t) => lp(0.6 * saw(f, t) + 0.4 * Math.sin(2 * Math.PI * f * t), 1800) * Math.min(1, t * 300) * Math.exp(-t * 12);
}
function pad(fs) {
  const lp = lowpass();
  return (t) => lp(fs.reduce((a, f) => a + saw(f, t) + saw(f * 1.003, t), 0) / (fs.length * 2), 700);
}
// Efectos
const pop = (f) => (t) => Math.sin(2 * Math.PI * (f + 900 * Math.exp(-t * 40)) * t) * Math.exp(-t * 28);
const click = (t) => (Math.sin(2 * Math.PI * 1600 * t) * 0.6 + rnd() * 0.4) * Math.exp(-t * 120);
function whoosh(dur) {
  const lp = lowpass();
  return (t) => lp(rnd(), 300 + 5000 * Math.pow(t / dur, 2)) * Math.pow(t / dur, 1.5) * (t > dur - 0.05 ? (dur - t) / 0.05 : 1);
}

// Armonía: La menor, cambia cada 2 compases (Am - Am - F - G)
const ROOTS = [33, 33, 29, 31];
const CHORDS = [[57, 60, 64, 67], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const PATTERNS = {
  pulse: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  sparse: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  roll: [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1],
  offbeat: [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1],
  long: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
};
const OCT_UP = [0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 12, 0];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 0, 2, 1, 3]; // índice de nota del acorde

const kickTimes = [];
const bars = Math.ceil(DUR / (BEAT * 4));
for (let bar = 0; bar < bars; bar++) {
  const chord = Math.floor(bar / 2) % 4;
  for (let s = 0; s < 16; s++) {
    const t = (bar * 16 + s) * STEP;
    if (t >= DUR) break;
    const sc = sceneAt(t);
    if (!sc) continue;
    const progress = (t - sc.from) / (sc.to - sc.from);
    const beat = s % 4 === 0;
    const beatIdx = s / 4;

    if (beat && (sc.kick === "four" || (sc.kick === "half" && (beatIdx === 0 || beatIdx === 2)))) {
      add(drums, t, 0.45, kick, 0.95);
      kickTimes.push(t);
    }
    if (sc.clap && beat && (beatIdx === 1 || beatIdx === 3)) add(music, t, 0.25, clap(), 0.35);
    if (sc.hatOpen && s % 4 === 2) add(music, t, 0.18, hat(true), 0.16);
    if (sc.hatClosed && s % 4 !== 2) add(music, t, 0.04, hat(false), sc.hatClosed);

    const pattern = PATTERNS[sc.bass];
    if (pattern && pattern[s]) {
      const cutoff = sc.cutoff[0] + (sc.cutoff[1] - sc.cutoff[0]) * progress;
      const long = sc.bass === "long";
      add(music, t, long ? STEP * 7.5 : STEP * 0.95, bassNote(midi(ROOTS[chord] + 12 + (long ? 0 : OCT_UP[s])), cutoff, long ? 1.2 : 9), long ? 0.45 : 0.5);
    }
    if (sc.stabs && (s === 6 || s === 14)) add(music, t, 0.45, stab(CHORDS[chord].map(midi), 1400), 0.22);
    if (sc.arp) add(music, t, STEP * 0.9, arpNote(midi(CHORDS[chord][ARP[s]])), 0.11);
  }
  const t0 = bar * 16 * STEP;
  const sc0 = sceneAt(t0);
  if (sc0) add(music, t0, 16 * STEP, pad(CHORDS[chord].map((m) => midi(m - 12))), sc0.pad);
}

// Redobles que suben antes de los cambios fuertes
for (const [start, end] of [[11.5, 13], [76, 78]]) {
  for (let t = start, gap = STEP * 2; t < end; t += gap, gap = Math.max(STEP / 2, gap * 0.9)) {
    add(music, t, 0.12, snare(), 0.12 + 0.25 * ((t - start) / (end - start)));
  }
}
// Subidas de ruido antes del ritmo, del drop, del regreso después de los emails y del cierre
for (const [start, dur] of [[3, 2], [11, 2], [46, 2], [83, 2]]) {
  const hp = highpass();
  add(music, start, dur, (t) => hp(rnd()) * Math.pow(t / dur, 2.5), 0.4);
}
// "Whoosh" corto al entrar cada escena
for (const t of [18, 35, 59, 70, 78]) add(fx, t - 0.6, 0.6, whoosh(0.6), 0.35);
// Golpes en los momentos fuertes
for (const t of [13, 48, 78, 85]) {
  add(drums, t, 0.6, kick, 1);
  const lp = lowpass();
  add(music, t, 1.6, (x) => lp(rnd(), 3000) * Math.exp(-x * 2.5), 0.35);
}
// Efectos sincronizados con la imagen
for (const t of [5.6, 6.6, 7.6, 8.6]) add(fx, t, 0.15, pop(520), 0.35); // llegan los mensajes del chat
for (const t of [19.4, 23.9, 28.9]) add(fx, t, 0.05, click, 0.3); // pasos en el celular
for (const t of [71.0, 71.45, 71.9, 72.35]) add(fx, t, 0.15, pop(660), 0.3); // aparecen las tarjetas
// Cierre: acorde que se apaga
add(music, 85, 6.5, (t) => stab([45, 57, 60, 64].map(midi), 900)(t * 0.15) * Math.exp(-t * 0.3), 0.5);

// "Bombeo": la música baja con cada bombo y vuelve enseguida
let k = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (k + 1 < kickTimes.length && kickTimes[k + 1] <= t) k++;
  const since = kickTimes.length && kickTimes[k] <= t ? t - kickTimes[k] : 10;
  music[i] *= 1 - 0.65 * Math.exp(-since * 9);
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
