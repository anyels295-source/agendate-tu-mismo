// Genera una pista alegre y con ritmo (120 BPM, Do mayor, I–V–vi–IV) para el video de demo.
// Todo es sintetizado acá mismo: sin samples ni música de terceros. Salida: WAV mono 16 bits.
import { writeFileSync } from "fs";

const SR = 44100;
const DUR = 92;
const BEAT = 0.5; // 120 BPM
const BAR = BEAT * 4;
const N = SR * DUR;
const buf = new Float32Array(N);

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

// Secciones, alineadas con las escenas del video.
const sec = (t) => (t < 5 ? "intro" : t < 13 ? "build" : t < 35 ? "full" : t < 48 ? "emails" : t < 85 ? "full2" : "outro");

function add(start, dur, fn, gain = 1) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, Math.floor((start + dur) * SR));
  for (let i = s0; i < s1; i++) buf[i] += fn((i - s0) / SR) * gain;
}

// Instrumentos
const kick = (t) => {
  const f = 50 + 110 * Math.exp(-t * 30);
  return Math.sin(2 * Math.PI * f * t - 0.0) * Math.exp(-t * 9);
};
const clap = (t) => rnd() * Math.exp(-t * 22) * (t < 0.012 || t > 0.02 ? 1 : 0.4);
let hp = 0, prev = 0;
const hat = (t) => { const n = rnd(); const out = n - prev; prev = n; return out * Math.exp(-t * 70); };
const saw = (f, t) => 2 * ((f * t) % 1) - 1;
const square = (f, t) => ((f * t) % 1 < 0.5 ? 1 : -1);
const bass = (f) => (t) => (0.6 * saw(f, t) + 0.4 * Math.sin(2 * Math.PI * f * t)) * Math.min(1, t * 200) * Math.exp(-t * 6);
const pluck = (fs) => (t) => fs.reduce((a, f) => a + 0.6 * saw(f, t) + 0.4 * Math.sin(2 * Math.PI * f * 2 * t), 0) / fs.length * Math.min(1, t * 300) * Math.exp(-t * 7);
const lead = (f) => (t) => (0.55 * square(f, t) + 0.45 * Math.sin(2 * Math.PI * f * t)) * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t)) * Math.min(1, t * 150) * Math.exp(-t * 4.5);
const pad = (fs) => (t) => fs.reduce((a, f) => a + Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.002 * t), 0) / fs.length;

const CHORDS = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]]; // C G Am F
const ROOTS = [36, 43, 45, 41];
const HOOK = [
  [76, null, 79, null, 76, 74, 72, null],
  [74, null, 79, null, 74, 71, 67, null],
  [72, null, 76, null, 72, 71, 69, null],
  [69, 72, 74, 72, 69, null, 67, null],
];
// Golpes de acorde sincopados, en octavos dentro de cada compás.
const STABS = [0, 3, 6];

for (let bar = 0; bar * BAR < DUR; bar++) {
  const t0 = bar * BAR;
  const ci = bar % 4;
  for (let e = 0; e < 8; e++) {
    const t = t0 + e * BEAT / 2;
    if (t >= DUR) break;
    const s = sec(t);
    const onBeat = e % 2 === 0;
    const beatIdx = e / 2;

    if (s === "outro") continue;
    // Bombo en cada tiempo (desde la construcción)
    if (onBeat && s !== "intro") add(t, 0.35, kick, 0.95);
    // Palmas en 2 y 4
    if (onBeat && (beatIdx === 1 || beatIdx === 3) && (s === "full" || s === "full2" || s === "emails")) add(t, 0.2, clap, 0.32);
    // Platillo en los contratiempos (y en la intro, para ir levantando)
    if (!onBeat) add(t, 0.06, hat, s === "intro" ? 0.12 : 0.2);
    // Bajo en contratiempo: el "empuje" típico de pista bailable
    if (!onBeat && s !== "intro") add(t, BEAT / 2, bass(midi(ROOTS[ci])), 0.42);
    // Acordes
    if (STABS.includes(e)) add(t, 0.5, pluck(CHORDS[ci].map(midi)), s === "intro" ? 0.22 : 0.3);
    // Melodía pegadiza
    const note = HOOK[ci][e];
    if (note && (s === "full" || s === "full2")) add(t, 0.4, lead(midi(note)), 0.2);
  }
  // Colchón suave de fondo
  add(t0, BAR, (t) => pad(CHORDS[ci].map(midi))(t) * Math.min(1, t * 4) * Math.min(1, (BAR - t) * 4), sec(t0) === "outro" ? 0 : 0.06);
}

// Subida de ruido antes de la entrada del ritmo y antes de "Compartís un link".
for (const [start, dur] of [[3, 2], [11, 2]]) add(start, dur, (t) => rnd() * Math.pow(t / dur, 2) * 0.5, 0.35);
// Golpe y acorde final en el cierre.
add(85, 0.4, kick, 1);
add(85, 1.5, (t) => rnd() * Math.exp(-t * 3), 0.18);
add(85, 7, (t) => pad([48, 60, 64, 67, 72].map(midi))(t) * Math.min(1, t * 10) * Math.exp(-t * 0.35), 0.35);
add(85, 1.2, pluck([60, 64, 67, 72].map(midi)), 0.45);

// Normalizar y escribir WAV
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const out = Buffer.alloc(44 + N * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 2, 4); out.write("WAVE", 8);
out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) out.writeInt16LE(Math.round((buf[i] / peak) * 0.9 * 32767), 44 + i * 2);
writeFileSync(process.argv[2], out);
console.log("ok, pico original", peak.toFixed(2));
