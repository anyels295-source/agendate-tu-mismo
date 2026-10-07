// Genera la pista de techno del video de demo (125 BPM, La menor). Todo se sintetiza acá:
// sin samples ni música de terceros. Uso: node generar-musica.mjs salida.wav
// Después se masteriza con FFmpeg (ver el comando en el commit que agregó este archivo).
import { writeFileSync } from "fs";

const SR = 44100;
const DUR = 92;
const BEAT = 60 / 125;
const STEP = BEAT / 4; // semicorchea
const N = SR * DUR;
const drums = new Float32Array(N); // bombo: no se "aplasta" a sí mismo
const music = new Float32Array(N); // todo lo demás: baja un instante con cada bombo

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

// Secciones, alineadas con las escenas del video.
function section(t) {
  if (t < 5) return "intro";
  if (t < 13) return "build";
  if (t < 35) return "drop";
  if (t < 48) return "emails"; // más despejado, para que se escuchen los avisos
  if (t < 85) return "drop2";
  return "outro";
}

function add(target, start, dur, fn, gain = 1) {
  const s0 = Math.max(0, Math.floor(start * SR));
  const s1 = Math.min(N, Math.floor((start + dur) * SR));
  for (let i = s0; i < s1; i++) target[i] += fn((i - s0) / SR) * gain;
}

// Filtro pasabajos de un polo, con estado propio por nota.
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
  const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6.5);
  const click = rnd() * Math.exp(-t * 400) * 0.3;
  return Math.tanh(1.8 * (body + click));
};
function clap() {
  const hp = highpass();
  return (t) => hp(rnd()) * (Math.exp(-t * 18) + 0.6 * Math.exp(-Math.max(0, t - 0.012) * 18) * (t > 0.012 ? 1 : 0));
}
function hat(open) {
  const hp = highpass();
  const hp2 = highpass();
  return (t) => hp2(hp(rnd())) * Math.exp(-t * (open ? 18 : 60));
}
function bassNote(f, cutoff) {
  const lp = lowpass();
  return (t) => {
    const env = Math.min(1, t * 400) * Math.exp(-t * 9);
    const c = cutoff * (0.4 + 1.6 * Math.exp(-t * 14)); // ataque "acid": el filtro se abre y se cierra
    return lp(0.7 * saw(f, t) + 0.5 * saw(f * 1.005, t), c) * env;
  };
}
function stab(fs, cutoff) {
  const lp = lowpass();
  return (t) => {
    const x = fs.reduce((a, f) => a + saw(f, t) + saw(f * 1.004, t), 0) / (fs.length * 2);
    return lp(x, cutoff * (0.5 + Math.exp(-t * 6))) * Math.min(1, t * 300) * Math.exp(-t * 5);
  };
}
function pad(fs) {
  const lp = lowpass();
  return (t) => lp(fs.reduce((a, f) => a + saw(f, t), 0) / fs.length, 600);
}

// Bajo: La menor, con un cambio cada 2 compases (Am - Am - F - G)
const BASS_ROOTS = [33, 33, 29, 31]; // A1 A1 F1 G1
const BASS_PATTERN = [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1]; // dónde suena en las 16 semicorcheas
const OCT_UP = [0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 12, 0];
const STAB_CHORDS = [[57, 60, 64, 67], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];

const kickTimes = [];
const bars = Math.ceil(DUR / (BEAT * 4));
for (let bar = 0; bar < bars; bar++) {
  const chord = Math.floor(bar / 2) % 4;
  for (let s = 0; s < 16; s++) {
    const t = (bar * 16 + s) * STEP;
    if (t >= DUR) break;
    const sec = section(t);
    if (sec === "outro") continue;
    const beat = s % 4 === 0;
    const beatIdx = s / 4;

    // Bombo en cada tiempo (en la intro, solo en el último tramo)
    if (beat && (sec !== "intro" || t >= 3)) {
      add(drums, t, 0.45, kick, 0.95);
      kickTimes.push(t);
    }
    // Palmas en 2 y 4
    if (beat && (beatIdx === 1 || beatIdx === 3) && sec !== "intro" && !(sec === "build" && t < 9)) add(music, t, 0.25, clap(), 0.35);
    // Platillo abierto en el contratiempo, cerrado suave en semicorcheas
    if (s % 4 === 2 && sec !== "intro") add(music, t, 0.18, hat(true), 0.16);
    if (s % 4 !== 2 && (sec === "drop" || sec === "drop2")) add(music, t, 0.04, hat(false), 0.06);
    // Bajo rodante. En la intro y la construcción el filtro va cerrado y se abre de a poco.
    if (BASS_PATTERN[s]) {
      const open = sec === "intro" ? 250 + 200 * (t / 5) : sec === "build" ? 450 + 900 * ((t - 5) / 8) : sec === "emails" ? 900 : 1500;
      add(music, t, STEP * 0.95, bassNote(midi(BASS_ROOTS[chord] + 12 + OCT_UP[s]), open), 0.5);
    }
    // Acorde corto y oscuro, en el contratiempo del 2 y del 4 (no en los emails)
    if ((sec === "drop" || sec === "drop2") && (s === 6 || s === 14)) add(music, t, 0.45, stab(STAB_CHORDS[chord].map(midi), 1400), 0.22);
  }
  // Colchón grave de fondo
  const t0 = bar * 16 * STEP;
  if (section(t0) !== "outro") add(music, t0, 16 * STEP, pad(STAB_CHORDS[chord].map((m) => midi(m - 12))), 0.05);
}

// Subidas de ruido antes de los cambios, y golpes en la entrada fuerte y en el cierre
for (const [start, dur] of [[3, 2], [11, 2], [83, 2]]) {
  const hp = highpass();
  add(music, start, dur, (t) => hp(rnd()) * Math.pow(t / dur, 2.5), 0.4);
}
for (const t of [13, 48, 85]) {
  add(drums, t, 0.6, kick, 1);
  const lp = lowpass();
  add(music, t, 1.6, (x) => lp(rnd(), 3000) * Math.exp(-x * 2.5), 0.35);
}
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
for (let i = 0; i < N; i++) { mix[i] = drums[i] + music[i]; peak = Math.max(peak, Math.abs(mix[i])); }
const out = Buffer.alloc(44 + N * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 2, 4); out.write("WAVE", 8);
out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) out.writeInt16LE(Math.round((mix[i] / peak) * 0.9 * 32767), 44 + i * 2);
writeFileSync(process.argv[2], out);
console.log("ok");
