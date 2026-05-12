import {
  Download,
  FileVideo,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type AsciiMode = "dots" | "matrix" | "edges" | "poster";
type EffectFilterId = "silver" | "thermal" | "matrix" | "edge" | "whiteout" | "redline";
type AudioProfile = "idle" | "kick" | "bassline" | "snare" | "hat" | "lead" | "pad";
type ProfileFilterMap = Record<AudioProfile, EffectFilterId>;
type RecordingState = "idle" | "recording" | "stopping";
type Rgb = [number, number, number];

type FilterCandidate = {
  id: EffectFilterId;
  since: number;
};

type AudioBands = {
  air: number;
  bass: number;
  beat: number;
  flux: number;
  high: number;
  level: number;
  lowMid: number;
  mid: number;
  presence: number;
  profile: AudioProfile;
  profileStrength: number;
  sub: number;
  transient: number;
};

type AsciiClip = {
  duration?: number;
  error?: string;
  name: string;
  ready: boolean;
  url: string;
};

type AsciiSettings = {
  contrast: number;
  density: number;
  filter: EffectFilter;
  reactivity: number;
  transitionSmooth: number;
};

type EffectFilter = {
  background: Rgb;
  bottomBass: Rgb;
  bottomHigh: Rgb;
  contrastBoost: number;
  densityBoost: number;
  flashColor: Rgb;
  flashGain: number;
  ghost: Rgb;
  id: EffectFilterId;
  ink: Rgb;
  invertBackground: Rgb;
  invertInk: Rgb;
  invertThreshold: number;
  jitter: number;
  label: string;
  mask: Rgb;
  mode: AsciiMode;
  noise: number;
  reason: string;
};

const emptyBands: AudioBands = {
  air: 0,
  bass: 0,
  beat: 0,
  flux: 0,
  high: 0,
  level: 0,
  lowMid: 0,
  mid: 0,
  presence: 0,
  profile: "idle",
  profileStrength: 0,
  sub: 0,
  transient: 0,
};

const effectFilters: EffectFilter[] = [
  {
    background: [0, 0, 0],
    bottomBass: [245, 189, 61],
    bottomHigh: [176, 198, 255],
    contrastBoost: 0,
    densityBoost: 0,
    flashColor: [242, 244, 239],
    flashGain: 0.36,
    ghost: [188, 198, 188],
    id: "silver",
    ink: [245, 248, 240],
    invertBackground: [242, 244, 239],
    invertInk: [0, 0, 0],
    invertThreshold: 0.78,
    jitter: 0.7,
    label: "Silver Dot",
    mask: [0, 0, 0],
    mode: "dots",
    noise: 0.36,
    reason: "low energy",
  },
  {
    background: [18, 2, 0],
    bottomBass: [255, 34, 24],
    bottomHigh: [56, 178, 255],
    contrastBoost: 0.08,
    densityBoost: -0.02,
    flashColor: [255, 0, 0],
    flashGain: 0.9,
    ghost: [255, 240, 232],
    id: "thermal",
    ink: [255, 238, 226],
    invertBackground: [255, 0, 0],
    invertInk: [255, 255, 255],
    invertThreshold: 0.72,
    jitter: 1.1,
    label: "Thermal Bass",
    mask: [0, 0, 0],
    mode: "poster",
    noise: 0.52,
    reason: "bass weight",
  },
  {
    background: [0, 0, 0],
    bottomBass: [74, 116, 255],
    bottomHigh: [245, 248, 240],
    contrastBoost: -0.04,
    densityBoost: 0.08,
    flashColor: [0, 114, 255],
    flashGain: 0.42,
    ghost: [168, 190, 255],
    id: "matrix",
    ink: [232, 238, 255],
    invertBackground: [245, 248, 240],
    invertInk: [0, 0, 0],
    invertThreshold: 0.82,
    jitter: 0.55,
    label: "Matrix Rain",
    mask: [0, 0, 0],
    mode: "matrix",
    noise: 0.64,
    reason: "mid motion",
  },
  {
    background: [0, 0, 0],
    bottomBass: [160, 160, 160],
    bottomHigh: [255, 255, 255],
    contrastBoost: 0.16,
    densityBoost: -0.08,
    flashColor: [240, 240, 240],
    flashGain: 0.58,
    ghost: [158, 158, 158],
    id: "edge",
    ink: [232, 232, 232],
    invertBackground: [245, 245, 245],
    invertInk: [0, 0, 0],
    invertThreshold: 0.68,
    jitter: 1.42,
    label: "Edge Storm",
    mask: [0, 0, 0],
    mode: "edges",
    noise: 0.78,
    reason: "treble edges",
  },
  {
    background: [246, 246, 241],
    bottomBass: [255, 238, 196],
    bottomHigh: [210, 222, 255],
    contrastBoost: -0.02,
    densityBoost: 0.04,
    flashColor: [255, 255, 255],
    flashGain: 0.72,
    ghost: [110, 114, 114],
    id: "whiteout",
    ink: [80, 84, 84],
    invertBackground: [0, 0, 0],
    invertInk: [245, 248, 240],
    invertThreshold: 0.58,
    jitter: 1.2,
    label: "Whiteout",
    mask: [245, 248, 240],
    mode: "dots",
    noise: 0.82,
    reason: "sharp highs",
  },
  {
    background: [255, 0, 0],
    bottomBass: [255, 0, 0],
    bottomHigh: [255, 255, 255],
    contrastBoost: 0.24,
    densityBoost: -0.14,
    flashColor: [255, 255, 255],
    flashGain: 1,
    ghost: [255, 244, 232],
    id: "redline",
    ink: [255, 246, 236],
    invertBackground: [255, 255, 255],
    invertInk: [255, 0, 0],
    invertThreshold: 0.34,
    jitter: 1.75,
    label: "Redline Beat",
    mask: [255, 0, 0],
    mode: "poster",
    noise: 0.92,
    reason: "beat impact",
  },
];

const defaultEffectFilter = effectFilters[0];

const profileOptions: Array<{ label: string; profile: AudioProfile }> = [
  { label: "Idle", profile: "idle" },
  { label: "Kick", profile: "kick" },
  { label: "Bass", profile: "bassline" },
  { label: "Snare", profile: "snare" },
  { label: "Hat", profile: "hat" },
  { label: "Lead", profile: "lead" },
  { label: "Pad", profile: "pad" },
];

const defaultProfileFilterMap: ProfileFilterMap = {
  bassline: "thermal",
  hat: "whiteout",
  idle: "silver",
  kick: "redline",
  lead: "matrix",
  pad: "silver",
  snare: "edge",
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function rgba(color: Rgb, alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clamp(alpha)})`;
}

function rgb(color: Rgb) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const progress = clamp(amount);
  return [
    Math.round(from[0] + (to[0] - from[0]) * progress),
    Math.round(from[1] + (to[1] - from[1]) * progress),
    Math.round(from[2] + (to[2] - from[2]) * progress),
  ];
}

function mixNumber(from: number, to: number, amount: number) {
  const progress = clamp(amount);
  return from + (to - from) * progress;
}

function blendEffectFilters(base: EffectFilter, target: EffectFilter, amount: number): EffectFilter {
  const progress = clamp(amount);
  const targetModeActive = progress > 0.28;

  return {
    ...base,
    background: mixRgb(base.background, target.background, progress),
    bottomBass: mixRgb(base.bottomBass, target.bottomBass, progress),
    bottomHigh: mixRgb(base.bottomHigh, target.bottomHigh, progress),
    contrastBoost: mixNumber(base.contrastBoost, target.contrastBoost, progress),
    densityBoost: mixNumber(base.densityBoost, target.densityBoost, progress),
    flashColor: mixRgb(base.flashColor, target.flashColor, progress),
    flashGain: mixNumber(base.flashGain, target.flashGain, progress),
    ghost: mixRgb(base.ghost, target.ghost, progress),
    id: targetModeActive ? target.id : base.id,
    ink: mixRgb(base.ink, target.ink, progress),
    invertBackground: mixRgb(base.invertBackground, target.invertBackground, progress),
    invertInk: mixRgb(base.invertInk, target.invertInk, progress),
    invertThreshold: mixNumber(base.invertThreshold, target.invertThreshold, progress),
    jitter: mixNumber(base.jitter, target.jitter, progress),
    label: targetModeActive ? target.label : base.label,
    mask: mixRgb(base.mask, target.mask, progress),
    mode: targetModeActive ? target.mode : base.mode,
    noise: mixNumber(base.noise, target.noise, progress),
    reason: targetModeActive ? target.reason : base.reason,
  };
}

function getEffectFilter(id: EffectFilterId) {
  return effectFilters.find((filter) => filter.id === id) ?? defaultEffectFilter;
}

function getProfileLabel(profile: AudioProfile) {
  if (profile === "kick") return "Kick";
  if (profile === "bassline") return "Bass";
  if (profile === "snare") return "Snare";
  if (profile === "hat") return "Hat";
  if (profile === "lead") return "Lead";
  if (profile === "pad") return "Pad";
  return "Idle";
}

function detectAudioProfile(bands: Omit<AudioBands, "profile" | "profileStrength">): {
  profile: AudioProfile;
  profileStrength: number;
} {
  const kickScore = bands.sub * 0.62 + bands.bass * 0.32 + bands.transient * 0.5 + bands.beat * 0.35;
  const bassScore = bands.bass * 0.74 + bands.sub * 0.38 - bands.transient * 0.12;
  const snareScore = bands.lowMid * 0.34 + bands.presence * 0.42 + bands.flux * 0.48 + bands.transient * 0.22;
  const hatScore = bands.air * 0.8 + bands.high * 0.46 + bands.flux * 0.28;
  const leadScore = bands.mid * 0.36 + bands.presence * 0.6 + bands.high * 0.18;
  const padScore = bands.level * 0.38 + bands.mid * 0.3 + bands.lowMid * 0.28 - bands.flux * 0.2;
  const scores: Array<[AudioProfile, number]> = [
    ["kick", kickScore],
    ["bassline", bassScore],
    ["snare", snareScore],
    ["hat", hatScore],
    ["lead", leadScore],
    ["pad", padScore],
  ];
  const [profile, score] = scores.reduce((best, next) => (next[1] > best[1] ? next : best), ["idle", 0]);

  if (bands.level < 0.035 && bands.flux < 0.035) return { profile: "idle", profileStrength: 0 };

  return {
    profile,
    profileStrength: clamp(score),
  };
}

function pickAudioEffectFilter(bands: AudioBands, reactivity: number, profileFilterMap: ProfileFilterMap) {
  const sensitivity = clamp(reactivity);
  if (bands.profile !== "idle" && bands.profileStrength > 0.2 - sensitivity * 0.04) {
    return getEffectFilter(profileFilterMap[bands.profile]);
  }
  if (bands.beat > 0.48 - sensitivity * 0.18 && bands.bass > 0.18) return getEffectFilter("redline");
  if (bands.high > 0.22 - sensitivity * 0.08 && bands.high > bands.mid * 1.02) return getEffectFilter("whiteout");
  if (bands.high > 0.17 - sensitivity * 0.06 && bands.high > bands.bass * 0.62) return getEffectFilter("edge");
  if (bands.bass > 0.2 - sensitivity * 0.06 && bands.bass > bands.mid * 1.45) return getEffectFilter("thermal");
  if (bands.mid > 0.13 - sensitivity * 0.04 && bands.mid > bands.bass * 0.58) return getEffectFilter("matrix");
  if (bands.bass > 0.2 - sensitivity * 0.06) return getEffectFilter("thermal");
  return getEffectFilter("silver");
}

function buildReactiveEffectFilter(
  base: EffectFilter,
  bands: AudioBands,
  reactivity: number,
  profileFilterMap: ProfileFilterMap,
) {
  const target = pickAudioEffectFilter(bands, reactivity, profileFilterMap);
  const dominantBand = Math.max(bands.sub, bands.bass, bands.mid, bands.presence, bands.high, bands.air, bands.beat);
  const morph = clamp(
    (dominantBand - 0.04) * (1.45 + reactivity * 1.8) +
      bands.beat * 0.38 +
      bands.flux * 0.28 +
      bands.profileStrength * 0.22,
  );

  return blendEffectFilters(base, target, morph);
}

function smoothEffectFilterTransition(
  current: EffectFilter,
  target: EffectFilter,
  transitionSmooth: number,
  reactivity: number,
) {
  const easeAmount = clamp(0.1 + reactivity * 0.12 + (1 - transitionSmooth) * 0.34, 0.08, 0.52);
  return blendEffectFilters(current, target, easeAmount);
}

function smoothVisualBands(current: AudioBands, target: AudioBands, transitionSmooth: number): AudioBands {
  const attack = 0.34 - transitionSmooth * 0.14;
  const release = 0.08 + (1 - transitionSmooth) * 0.1;
  const follow = (from: number, to: number) => clamp(from + (to - from) * (to > from ? attack : release));
  const profile = target.profileStrength > 0.22 ? target.profile : current.profile;

  return {
    air: follow(current.air, target.air),
    bass: follow(current.bass, target.bass),
    beat: follow(current.beat, Math.min(target.beat, 0.62)),
    flux: follow(current.flux, Math.min(target.flux, 0.74)),
    high: follow(current.high, target.high),
    level: follow(current.level, target.level),
    lowMid: follow(current.lowMid, target.lowMid),
    mid: follow(current.mid, target.mid),
    presence: follow(current.presence, target.presence),
    profile,
    profileStrength: follow(current.profileStrength, target.profileStrength),
    sub: follow(current.sub, target.sub),
    transient: follow(current.transient, Math.min(target.transient, 0.68)),
  };
}

function formatDuration(duration?: number) {
  if (!duration || !Number.isFinite(duration)) return "metadata";

  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledWidth = width / scale;
  const scaledHeight = height / scale;
  const sourceX = (sourceWidth - scaledWidth) / 2;
  const sourceY = (sourceHeight - scaledHeight) / 2;

  context.drawImage(source, sourceX, sourceY, scaledWidth, scaledHeight, x, y, width, height);
}

function averageBand(
  data: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  lowFrequency: number,
  highFrequency: number,
) {
  if (!data.length) return 0;

  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((lowFrequency / nyquist) * data.length));
  const end = Math.min(data.length - 1, Math.ceil((highFrequency / nyquist) * data.length));

  if (end <= start) return 0;

  let sum = 0;
  let peak = 0;
  for (let index = start; index <= end; index += 1) {
    const value = data[index] ?? 0;
    sum += value;
    peak = Math.max(peak, value);
  }

  const average = sum / ((end - start + 1) * 255);
  return clamp(average * 0.58 + (peak / 255) * 0.42);
}

function positiveBandFlux(
  data: Uint8Array<ArrayBuffer>,
  previousData: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  lowFrequency: number,
  highFrequency: number,
) {
  if (!data.length || previousData.length !== data.length) return 0;

  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((lowFrequency / nyquist) * data.length));
  const end = Math.min(data.length - 1, Math.ceil((highFrequency / nyquist) * data.length));
  if (end <= start) return 0;

  let sum = 0;
  let peak = 0;
  for (let index = start; index <= end; index += 1) {
    const diff = Math.max(0, (data[index] ?? 0) - (previousData[index] ?? 0));
    sum += diff;
    peak = Math.max(peak, diff);
  }

  return clamp((sum / ((end - start + 1) * 255)) * 0.68 + (peak / 255) * 0.32);
}

function getRecorderMimeType() {
  const preferredTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function readLuminance(pixels: Uint8ClampedArray, index: number) {
  const red = pixels[index] ?? 0;
  const green = pixels[index + 1] ?? 0;
  const blue = pixels[index + 2] ?? 0;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function drawMatrixRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: AudioBands,
  filter: EffectFilter,
  seed: number,
) {
  const columns = Math.max(48, Math.round(width / 9));
  const cellWidth = width / columns;
  const rows = Math.ceil(height / Math.max(5, cellWidth * 1.2));
  const glow = 0.28 + bands.high * 0.56;

  const background = mixRgb(filter.background, filter.flashColor, bands.bass * filter.flashGain * 0.38);

  context.fillStyle = rgb(background);
  context.fillRect(0, 0, width, height);

  for (let column = 0; column < columns; column += 1) {
    const phase = (column * 17 + seed * (0.018 + bands.mid * 0.02)) % rows;
    for (let row = 0; row < rows; row += 1) {
      const distance = Math.abs(((row - phase + rows) % rows) - rows / 2) / rows;
      const flicker = Math.sin(column * 11.7 + row * 4.3 + seed * 0.09) * 0.5 + 0.5;
      const alpha = clamp((1 - distance * 2.6) * 0.42 + flicker * glow * 0.48 + bands.high * 0.2);
      if (alpha < 0.22) continue;

      const x = column * cellWidth + cellWidth * 0.5;
      const y = row * cellWidth * 1.2 + cellWidth * 0.55;
      context.fillStyle = rgba(filter.ink, alpha);
      context.beginPath();
      context.arc(x, y, Math.max(1.1, cellWidth * (0.1 + alpha * 0.24)), 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawModulationOverlays(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: AudioBands,
  filter: EffectFilter,
  seed: number,
) {
  const kickPulse = clamp(bands.sub * 0.55 + bands.beat * 0.5 + bands.transient * 0.36);
  const hatSpark = clamp(bands.air * 0.92 + bands.high * 0.42 + bands.flux * 0.32);
  const snareSnap = bands.profile === "snare" ? bands.profileStrength : clamp(bands.presence * 0.45 + bands.flux * 0.45);
  const leadFlow = bands.profile === "lead" ? bands.profileStrength : clamp(bands.presence * 0.55 + bands.mid * 0.25);
  const flashScale = 1 - filter.flashGain * 0.08;

  if (kickPulse > 0.08) {
    const gradient = context.createRadialGradient(
      width * 0.5,
      height * 0.46,
      width * 0.08,
      width * 0.5,
      height * 0.46,
      width * (0.32 + kickPulse * 0.38),
    );
    gradient.addColorStop(0, rgba(filter.flashColor, kickPulse * 0.14 * flashScale));
    gradient.addColorStop(0.58, rgba(filter.bottomBass, kickPulse * 0.08));
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  if (snareSnap > 0.1) {
    const lineCount = Math.round(8 + snareSnap * 18);
    context.fillStyle = rgba(filter.invertInk, 0.035 + snareSnap * 0.12);
    for (let index = 0; index < lineCount; index += 1) {
      const y = ((seed * (0.16 + snareSnap * 0.08) + index * height * 0.071) % height) | 0;
      context.fillRect(0, y, width, Math.max(1, height * 0.0025));
    }
  }

  if (hatSpark > 0.08) {
    const count = Math.round(18 + hatSpark * 110);
    context.fillStyle = rgba(filter.invertInk, 0.2 + hatSpark * 0.5);
    for (let index = 0; index < count; index += 1) {
      const x = (Math.sin(seed * 0.021 + index * 19.91) * 0.5 + 0.5) * width;
      const y = (Math.cos(seed * 0.017 + index * 31.17) * 0.5 + 0.5) * height;
      const radius = 0.7 + (Math.sin(seed * 0.11 + index) * 0.5 + 0.5) * 1.7 * hatSpark;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (leadFlow > 0.08) {
    context.strokeStyle = rgba(filter.bottomHigh, 0.08 + leadFlow * 0.2);
    context.lineWidth = Math.max(1, width * 0.0018);
    for (let index = 0; index < 5; index += 1) {
      const y = height * (0.2 + index * 0.12) + Math.sin(seed * 0.018 + index * 1.7) * height * 0.028 * leadFlow;
      context.beginPath();
      for (let x = 0; x <= width; x += width / 18) {
        const wave = Math.sin(seed * 0.02 + x * 0.018 + index * 2.3) * height * 0.018 * leadFlow;
        if (x === 0) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }
  }

  const strobe = clamp(bands.beat * 0.08 + bands.transient * 0.06);
  if (strobe > 0.12) {
    context.fillStyle = rgba(filter.invertBackground, strobe * 0.45);
    context.fillRect(0, 0, width, height);
  }
}

function drawAsciiTop(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  sampleCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  bands: AudioBands,
  settings: AsciiSettings,
  seed: number,
) {
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext || !video.videoWidth || !video.videoHeight) return;

  const filter = settings.filter;
  const mode = filter.mode;
  const dynamicDensity = clamp(settings.density + filter.densityBoost + bands.mid * 0.34, 0.18, 1);
  const columns = Math.round(54 + dynamicDensity * 124);
  const rows = Math.max(18, Math.round(columns * (height / width) * 1.08));

  if (sampleCanvas.width !== columns || sampleCanvas.height !== rows) {
    sampleCanvas.width = columns;
    sampleCanvas.height = rows;
  }

  drawCover(sampleContext, video, video.videoWidth, video.videoHeight, 0, 0, columns, rows);
  const image = sampleContext.getImageData(0, 0, columns, rows);
  const pixels = image.data;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const minCell = Math.min(cellWidth, cellHeight);
  const bassFlash = clamp((bands.bass - 0.28) / 0.72) * filter.flashGain;
  const beatInvert = bands.beat > filter.invertThreshold;
  const background = mixRgb(filter.background, filter.flashColor, bassFlash);

  if (mode === "matrix") {
    drawMatrixRain(context, width, height, bands, filter, seed);
  } else if (mode === "poster") {
    context.fillStyle = beatInvert ? rgb(filter.invertBackground) : rgb(background);
    context.fillRect(0, 0, width, height);
  } else {
    context.fillStyle = beatInvert ? rgb(filter.invertBackground) : rgb(background);
    context.fillRect(0, 0, width, height);
  }

  if (mode === "edges") {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = beatInvert ? rgba(filter.invertInk, 0.84) : rgba(filter.ink, 0.84);
    context.lineWidth = Math.max(1, minCell * (0.36 + bands.high * 0.44 + filter.noise * 0.08));

    for (let row = 1; row < rows - 1; row += 1) {
      for (let column = 1; column < columns - 1; column += 1) {
        const index = (row * columns + column) * 4;
        const luminance = readLuminance(pixels, index);
        const right = readLuminance(pixels, index + 4);
        const down = readLuminance(pixels, index + columns * 4);
        const edge = Math.abs(luminance - right) + Math.abs(luminance - down);
        const edgeThreshold = 34 - clamp(settings.contrast + filter.contrastBoost) * 14 - bands.high * 8;
        if (edge < edgeThreshold) continue;

        const x = column * cellWidth + cellWidth * 0.5;
        const y = row * cellHeight + cellHeight * 0.5;
        const wobble = Math.sin(seed * 0.06 + column * 0.8 + row * 0.4) * bands.high * minCell * filter.jitter;

        context.beginPath();
        context.moveTo(x - cellWidth * 0.28 + wobble, y - cellHeight * 0.22);
        context.lineTo(x + cellWidth * 0.34 - wobble, y + cellHeight * 0.24);
        context.stroke();
      }
    }

    return;
  }

  const effectiveContrast = clamp(settings.contrast + filter.contrastBoost);
  const threshold = 0.42 - effectiveContrast * 0.16 - bands.mid * 0.08;
  const lightInk = beatInvert ? rgba(filter.invertInk, 0.9) : rgba(filter.ink, 0.9);
  const darkInk = beatInvert ? rgba(filter.ink, 0.78) : rgba(filter.mask, mode === "poster" ? 0.42 : 0.9);
  const maskFill = mode === "matrix" ? rgba(filter.mask, 0.96) : darkInk;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = (row * columns + column) * 4;
      const luminance = readLuminance(pixels, index);
      const darkness = 1 - luminance / 255;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const silhouette = darkness > threshold || (darkness > 0.28 && chroma < 34);

      if (!silhouette && mode !== "poster") {
        if (bands.high < 0.22) continue;
        const sparkle = Math.sin(column * 13.1 + row * 7.3 + seed * 0.13) * 0.5 + 0.5;
        if (sparkle < 1 - bands.high * filter.noise * 0.42) continue;
      }

      if (mode === "matrix") {
        if (!silhouette) continue;
        context.fillStyle = maskFill;
        context.fillRect(column * cellWidth - 0.2, row * cellHeight - 0.2, cellWidth + 0.4, cellHeight + 0.4);
        continue;
      }

      const intensity = clamp(silhouette ? darkness + bands.mid * 0.22 : bands.high * 0.55);
      const radius = Math.max(0.9, minCell * (0.16 + intensity * 0.28 + bands.mid * 0.1));
      const jitterX = Math.sin(seed * 0.07 + row * 2.2) * bands.high * cellWidth * 0.18 * filter.jitter;
      const jitterY = Math.cos(seed * 0.05 + column * 1.9) * bands.high * cellHeight * 0.18 * filter.jitter;
      const x = column * cellWidth + cellWidth * 0.5 + jitterX;
      const y = row * cellHeight + cellHeight * 0.5 + jitterY;

      context.fillStyle = silhouette ? lightInk : rgba(filter.ghost, 0.14 + bands.high * filter.noise * 0.54);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function AsciiVideoPage() {
  const [activeFilterId, setActiveFilterId] = useState<EffectFilterId>(defaultEffectFilter.id);
  const [autoFilter, setAutoFilter] = useState(true);
  const [bands, setBands] = useState<AudioBands>(emptyBands);
  const [clip, setClip] = useState<AsciiClip | null>(null);
  const [contrast, setContrast] = useState(0.58);
  const [density, setDensity] = useState(0.64);
  const [exportUrl, setExportUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [profileFilterMap, setProfileFilterMap] = useState<ProfileFilterMap>(defaultProfileFilterMap);
  const [reactivity, setReactivity] = useState(0.82);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transitionSmooth, setTransitionSmooth] = useState(0.72);

  const activeFilter = getEffectFilter(activeFilterId);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const activeFilterRef = useRef<EffectFilter>(defaultEffectFilter);
  const autoFilterRef = useRef(true);
  const bandsRef = useRef<AudioBands>(emptyBands);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipUrlRef = useRef("");
  const exportUrlRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filterCandidateRef = useRef<FilterCandidate>({ id: defaultEffectFilter.id, since: 0 });
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));
  const lastBandUiUpdateRef = useRef(0);
  const lastFilterSwitchRef = useRef(0);
  const profileFilterMapRef = useRef<ProfileFilterMap>(defaultProfileFilterMap);
  const previousFrequencyDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));
  const rafRef = useRef<number | null>(null);
  const reactivityRef = useRef(reactivity);
  const renderedFilterRef = useRef<EffectFilter>(defaultEffectFilter);
  const visualBandsRef = useRef<AudioBands>(emptyBands);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<AsciiSettings>({
    contrast,
    density,
    filter: defaultEffectFilter,
    reactivity,
    transitionSmooth,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
    reactivityRef.current = reactivity;
    settingsRef.current = { contrast, density, filter: activeFilter, reactivity, transitionSmooth };
  }, [activeFilter, contrast, density, reactivity, transitionSmooth]);

  useEffect(() => {
    autoFilterRef.current = autoFilter;
  }, [autoFilter]);

  useEffect(() => {
    profileFilterMapRef.current = profileFilterMap;
  }, [profileFilterMap]);

  const readAudioBands = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return bandsRef.current;

    if (frequencyDataRef.current.length !== analyser.frequencyBinCount) {
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    if (previousFrequencyDataRef.current.length !== analyser.frequencyBinCount) {
      previousFrequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    const frequencyData = frequencyDataRef.current;
    const previousFrequencyData = previousFrequencyDataRef.current;
    analyser.getByteFrequencyData(frequencyData);

    const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
    const sub = averageBand(frequencyData, sampleRate, 28, 80);
    const bass = averageBand(frequencyData, sampleRate, 55, 180);
    const lowMid = averageBand(frequencyData, sampleRate, 180, 520);
    const mid = averageBand(frequencyData, sampleRate, 520, 1800);
    const presence = averageBand(frequencyData, sampleRate, 1800, 4200);
    const high = averageBand(frequencyData, sampleRate, 4200, 9200);
    const air = averageBand(frequencyData, sampleRate, 9200, 16000);
    const bassFlux = positiveBandFlux(frequencyData, previousFrequencyData, sampleRate, 28, 180);
    const midFlux = positiveBandFlux(frequencyData, previousFrequencyData, sampleRate, 180, 2200);
    const highFlux = positiveBandFlux(frequencyData, previousFrequencyData, sampleRate, 2200, 16000);
    const flux = clamp(bassFlux * 0.38 + midFlux * 0.34 + highFlux * 0.42);
    const transient = clamp(bassFlux * 0.46 + midFlux * 0.28 + highFlux * 0.34);
    const level = clamp(sub * 0.18 + bass * 0.34 + lowMid * 0.18 + mid * 0.18 + presence * 0.14 + high * 0.12 + air * 0.08);
    const previous = bandsRef.current;
    const sensitivity = reactivityRef.current;
    const beat =
      (sub + bass * 0.65) > Math.max(0.28 - sensitivity * 0.08, (previous.sub + previous.bass * 0.65) * (1.15 - sensitivity * 0.08)) ||
      transient > Math.max(0.12 - sensitivity * 0.04, previous.transient * (1.14 - sensitivity * 0.08)) ||
      level > Math.max(0.18 - sensitivity * 0.04, previous.level * (1.18 - sensitivity * 0.08))
        ? 1
        : previous.beat * (0.8 - sensitivity * 0.16);
    const blendIn = 0.46 + sensitivity * 0.34;
    const blendOut = 1 - blendIn;
    const smoothedBands = {
      air: clamp(previous.air * blendOut + air * blendIn),
      bass: clamp(previous.bass * blendOut + bass * blendIn),
      beat: clamp(beat),
      flux: clamp(previous.flux * blendOut + flux * blendIn),
      high: clamp(previous.high * blendOut + high * blendIn),
      level: clamp(previous.level * blendOut + level * blendIn),
      lowMid: clamp(previous.lowMid * blendOut + lowMid * blendIn),
      mid: clamp(previous.mid * blendOut + mid * blendIn),
      presence: clamp(previous.presence * blendOut + presence * blendIn),
      sub: clamp(previous.sub * blendOut + sub * blendIn),
      transient: clamp(previous.transient * blendOut + transient * blendIn),
    };
    const profileResult = detectAudioProfile(smoothedBands);
    const nextBands: AudioBands = {
      ...smoothedBands,
      profile: profileResult.profile,
      profileStrength: clamp(previous.profileStrength * 0.42 + profileResult.profileStrength * 0.58),
    };

    previousFrequencyData.set(frequencyData);
    bandsRef.current = nextBands;
    return nextBands;
  }, []);

  const resolveActiveFilter = useCallback((audioBands: AudioBands, now: number) => {
    if (!autoFilterRef.current) return activeFilterRef.current;

    const sensitivity = reactivityRef.current;
    const nextFilter = pickAudioEffectFilter(audioBands, sensitivity, profileFilterMapRef.current);
    const currentFilter = activeFilterRef.current;
    const candidate = filterCandidateRef.current;
    const elapsed = now - lastFilterSwitchRef.current;
    if (candidate.id !== nextFilter.id) {
      filterCandidateRef.current = { id: nextFilter.id, since: now };
      return currentFilter;
    }

    const candidateAge = now - candidate.since;
    const minActiveHold = 520 + settingsRef.current.transitionSmooth * 780 - sensitivity * 110;
    const minCandidateHold = 150 + settingsRef.current.transitionSmooth * 280;
    const strongAccent = audioBands.profileStrength > 0.56 || audioBands.level > 0.62;
    const accentHold = 320 + settingsRef.current.transitionSmooth * 360;
    const canSwitch =
      candidateAge > minCandidateHold &&
      (elapsed > minActiveHold || (strongAccent && elapsed > accentHold && nextFilter.id !== "redline"));

    if (nextFilter.id !== currentFilter.id && canSwitch) {
      activeFilterRef.current = nextFilter;
      lastFilterSwitchRef.current = now;
      filterCandidateRef.current = { id: nextFilter.id, since: now };
      settingsRef.current = { ...settingsRef.current, filter: nextFilter };
      setActiveFilterId(nextFilter.id);
      return nextFilter;
    }

    return currentFilter;
  }, []);

  const renderFrame = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      resizeCanvasToDisplaySize(canvas);
      const { width, height } = canvas;
      const topHeight = Math.round(height * 0.46);
      const bottomHeight = height - topHeight;
      const detectedBands = readAudioBands();
      const audioBands = smoothVisualBands(visualBandsRef.current, detectedBands, settingsRef.current.transitionSmooth);
      visualBandsRef.current = audioBands;
      const baseFilter = resolveActiveFilter(audioBands, now);
      const targetFilter = autoFilterRef.current
        ? buildReactiveEffectFilter(baseFilter, audioBands, settingsRef.current.reactivity, profileFilterMapRef.current)
        : baseFilter;
      const effectFilter = smoothEffectFilterTransition(
        renderedFilterRef.current,
        targetFilter,
        settingsRef.current.transitionSmooth,
        settingsRef.current.reactivity,
      );
      renderedFilterRef.current = effectFilter;
      const frameSettings = { ...settingsRef.current, filter: effectFilter };
      const canDrawVideo = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
      const kickPulse = clamp(audioBands.sub * 0.5 + audioBands.beat * 0.45 + audioBands.transient * 0.32);
      const hatSpark = clamp(audioBands.air * 0.8 + audioBands.high * 0.42 + audioBands.flux * 0.28);
      const pulseZoom = 1 + kickPulse * frameSettings.reactivity * 0.048;
      const rgbSplit = hatSpark * frameSettings.reactivity;
      const beatShake =
        audioBands.beat > 0.45 ? (Math.sin(now * 0.09) * width * audioBands.beat * effectFilter.jitter) / 130 : 0;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      if (canDrawVideo) {
        const sampleCanvas = sampleCanvasRef.current ?? document.createElement("canvas");
        sampleCanvasRef.current = sampleCanvas;

        context.save();
        context.translate(width * 0.5, topHeight * 0.5);
        context.scale(pulseZoom, pulseZoom);
        context.translate(-width * 0.5, -topHeight * 0.5);
        context.translate(beatShake, audioBands.beat > 0.45 ? Math.cos(now * 0.08) * 3 * audioBands.beat : 0);
        drawAsciiTop(context, video, sampleCanvas, width, topHeight, audioBands, frameSettings, now);
        context.restore();

        context.save();
        context.translate(width * 0.5, topHeight + bottomHeight * 0.5);
        context.scale(1 + kickPulse * frameSettings.reactivity * 0.028, 1 + kickPulse * frameSettings.reactivity * 0.028);
        context.translate(-width * 0.5, -(topHeight + bottomHeight * 0.5));
        context.translate(-beatShake * 0.4, audioBands.beat > 0.45 ? Math.sin(now * 0.07) * 2 * audioBands.beat : 0);
        drawCover(context, video, video.videoWidth, video.videoHeight, 0, topHeight, width, bottomHeight);
        if (rgbSplit > 0.08) {
          context.globalCompositeOperation = "screen";
          context.globalAlpha = Math.min(0.22, rgbSplit * 0.18);
          drawCover(context, video, video.videoWidth, video.videoHeight, width * 0.012 * rgbSplit, topHeight, width, bottomHeight);
          context.globalAlpha = Math.min(0.18, rgbSplit * 0.14);
          drawCover(context, video, video.videoWidth, video.videoHeight, -width * 0.01 * rgbSplit, topHeight, width, bottomHeight);
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";
        }
        context.fillStyle = rgba(effectFilter.bottomHigh, audioBands.high * 0.14);
        context.fillRect(0, topHeight, width, bottomHeight);
        context.fillStyle = rgba(effectFilter.bottomBass, audioBands.bass * 0.12);
        context.fillRect(0, topHeight, width, bottomHeight);
        context.restore();
      } else {
        context.fillStyle = "#050705";
        context.fillRect(0, 0, width, height);
      }

      if (canDrawVideo) {
        context.fillStyle = "rgba(0, 0, 0, 0.8)";
        context.fillRect(0, topHeight - 2, width, 4);
        drawModulationOverlays(context, width, height, audioBands, effectFilter, now);
      }

      if (now - lastBandUiUpdateRef.current > 80) {
        lastBandUiUpdateRef.current = now;
        setBands(audioBands);
      }
    },
    [readAudioBands, resolveActiveFilter],
  );

  const loop = useCallback(
    (now: number) => {
      renderFrame(now);
      rafRef.current = window.requestAnimationFrame(loop);
    },
    [renderFrame],
  );

  const startRenderLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(loop);
  }, [loop]);

  const stopRenderLoop = useCallback(() => {
    if (rafRef.current === null) return;
    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (!audioSourceRef.current) {
      const context = audioContextRef.current;
      const source = context.createMediaElementSource(video);
      const analyser = context.createAnalyser();
      const destination = context.createMediaStreamDestination();

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.38;
      source.connect(analyser);
      analyser.connect(context.destination);
      analyser.connect(destination);

      analyserRef.current = analyser;
      audioDestinationRef.current = destination;
      audioSourceRef.current = source;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  const clearExportUrl = useCallback(() => {
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = "";
    }
    setExportUrl("");
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = Array.from(files ?? []).find((nextFile) => nextFile.type.startsWith("video/"));
      if (!file) return;

      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
      clearExportUrl();

      const url = URL.createObjectURL(file);
      clipUrlRef.current = url;
      const nextClip: AsciiClip = {
        name: file.name,
        ready: false,
        url,
      };

      setClip(nextClip);
      setIsPlaying(false);
      setRecordingState("idle");
      setBands(emptyBands);
      bandsRef.current = emptyBands;
      visualBandsRef.current = emptyBands;
      previousFrequencyDataRef.current.fill(0);
      renderedFilterRef.current = activeFilterRef.current;
      filterCandidateRef.current = { id: activeFilterRef.current.id, since: performance.now() };

      const video = videoRef.current;
      if (video) {
        video.pause();
        video.src = url;
        video.preload = "metadata";
        video.load();
      }

      window.requestAnimationFrame((now) => renderFrame(now));
    },
    [clearExportUrl, renderFrame],
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !clip?.ready) return;

    if (video.paused) {
      await ensureAudioGraph();
      await video.play();
      setIsPlaying(true);
      startRenderLoop();
      return;
    }

    video.pause();
    setIsPlaying(false);
    stopRenderLoop();
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [clip?.ready, ensureAudioGraph, renderFrame, startRenderLoop, stopRenderLoop]);

  const resetPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    bandsRef.current = emptyBands;
    visualBandsRef.current = emptyBands;
    previousFrequencyDataRef.current.fill(0);
    renderedFilterRef.current = activeFilterRef.current;
    filterCandidateRef.current = { id: activeFilterRef.current.id, since: performance.now() };
    setBands(emptyBands);
    stopRenderLoop();
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [renderFrame, stopRenderLoop]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setRecordingState("stopping");
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !clip?.ready) return;

    await ensureAudioGraph();
    clearExportUrl();
    recordedChunksRef.current = [];
    const stream = canvas.captureStream(30);
    audioDestinationRef.current?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url;
      setExportUrl(url);
      setRecordingState("idle");
      stream.getTracks().forEach((track) => track.stop());
    };

    recorderRef.current = recorder;
    recorder.start(500);
    setRecordingState("recording");

    if (video.paused) {
      await video.play();
      setIsPlaying(true);
      startRenderLoop();
    }
  }, [clearExportUrl, clip?.ready, ensureAudioGraph, startRenderLoop]);

  const toggleRecording = useCallback(() => {
    if (recordingState === "recording") {
      stopRecording();
      return;
    }

    void startRecording();
  }, [recordingState, startRecording, stopRecording]);

  useEffect(() => {
    const handleResize = () => window.requestAnimationFrame((now) => renderFrame(now));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderFrame]);

  useEffect(() => {
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [activeFilterId, autoFilter, clip, contrast, density, profileFilterMap, reactivity, renderFrame, transitionSmooth]);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      audioContextRef.current?.close();
    };
  }, [stopRenderLoop]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setClip((currentClip) => {
      if (!currentClip) return currentClip;
      return {
        ...currentClip,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        error: undefined,
        ready: true,
      };
    });
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [renderFrame]);

  const handleVideoError = useCallback(() => {
    setClip((currentClip) => {
      if (!currentClip) return currentClip;
      return { ...currentClip, error: "영상을 읽을 수 없습니다.", ready: false };
    });
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    stopRenderLoop();
    if (recordingState === "recording") stopRecording();
  }, [recordingState, stopRecording, stopRenderLoop]);

  const clipStatus = clip?.error
    ? clip.error
    : clip?.ready
      ? `${formatDuration(clip.duration)} ready`
      : clip
        ? "loading"
        : "mp4, webm, mov";
  const canUseClip = Boolean(clip?.ready);

  return (
    <main className="ascii-shell">
      <section className="ascii-workspace" aria-label="ASCII video workspace">
        <aside className="ascii-control-panel">
          <a className="page-link" href="/">
            <Sparkles size={15} aria-hidden="true" />
            Gesture Scrub
          </a>

          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <button className="upload-zone ascii-upload-zone" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} aria-hidden="true" />
            <span>영상 업로드</span>
            <small>{clipStatus}</small>
          </button>

          <div className="ascii-transport">
            <button className="primary" type="button" onClick={togglePlayback} disabled={!canUseClip}>
              {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {isPlaying ? "정지" : "재생"}
            </button>
            <button type="button" onClick={resetPlayback} disabled={!clip}>
              <RotateCcw size={17} aria-hidden="true" />
              처음
            </button>
            <button
              className="record-button"
              type="button"
              onClick={toggleRecording}
              disabled={!canUseClip || recordingState === "stopping"}
            >
              <Radio size={17} aria-hidden="true" />
              {recordingState === "recording" ? "녹화 종료" : "WebM 녹화"}
            </button>
            {exportUrl ? (
              <a className="download-link" href={exportUrl} download="audio-reactive-ascii.webm">
                <Download size={16} aria-hidden="true" />
                결과 받기
              </a>
            ) : null}
          </div>

          <div className="ascii-panel-group">
            <div className="panel-title">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <h2>Filter Engine</h2>
            </div>
            <div className="auto-filter-row">
              <button
                className={autoFilter ? "active" : ""}
                type="button"
                aria-pressed={autoFilter}
                onClick={() => setAutoFilter((currentValue) => !currentValue)}
              >
                Auto FX {autoFilter ? "On" : "Off"}
              </button>
              <span>{autoFilter ? activeFilter.reason : "manual lock"}</span>
            </div>
            <div className="mode-segments filter-segments" aria-label="ASCII effect filter">
              {effectFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={activeFilterId === filter.id ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setAutoFilter(false);
                    activeFilterRef.current = filter;
                    settingsRef.current = { ...settingsRef.current, filter };
                    setActiveFilterId(filter.id);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ascii-panel-group">
            <div className="panel-title">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <h2>Profile Routing</h2>
            </div>
            <div className="profile-route-grid" aria-label="Audio profile filter routing">
              {profileOptions.map((option) => (
                <label key={option.profile} className="profile-route-row">
                  <span>{option.label}</span>
                  <select
                    value={profileFilterMap[option.profile]}
                    onChange={(event) => {
                      const nextFilterId = event.target.value as EffectFilterId;
                      setAutoFilter(true);
                      setProfileFilterMap((currentMap) => ({
                        ...currentMap,
                        [option.profile]: nextFilterId,
                      }));
                    }}
                  >
                    {effectFilters.map((filter) => (
                      <option key={filter.id} value={filter.id}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="ascii-panel-group">
            <label className="range-row">
              <span>React</span>
              <input
                max="1"
                min="0.2"
                step="0.01"
                type="range"
                value={reactivity}
                onChange={(event) => setReactivity(Number(event.target.value))}
              />
              <strong>{Math.round(reactivity * 100)}%</strong>
            </label>
            <label className="range-row">
              <span>Smooth</span>
              <input
                max="1"
                min="0"
                step="0.01"
                type="range"
                value={transitionSmooth}
                onChange={(event) => setTransitionSmooth(Number(event.target.value))}
              />
              <strong>{Math.round(transitionSmooth * 100)}%</strong>
            </label>
            <label className="range-row">
              <span>Density</span>
              <input
                max="1"
                min="0.18"
                step="0.01"
                type="range"
                value={density}
                onChange={(event) => setDensity(Number(event.target.value))}
              />
              <strong>{Math.round(density * 100)}%</strong>
            </label>
            <label className="range-row">
              <span>Contrast</span>
              <input
                max="1"
                min="0"
                step="0.01"
                type="range"
                value={contrast}
                onChange={(event) => setContrast(Number(event.target.value))}
              />
              <strong>{Math.round(contrast * 100)}%</strong>
            </label>
          </div>

          <div className="ascii-band-panel" aria-label="Audio bands">
            <div className="profile-row">
              <span>Profile</span>
              <strong>{getProfileLabel(bands.profile)}</strong>
              <meter max="1" min="0" value={bands.profileStrength} />
            </div>
            {([
              ["sub", "sub"],
              ["bass", "bass"],
              ["mid", "mid"],
              ["pres", "presence"],
              ["high", "high"],
              ["air", "air"],
              ["flux", "flux"],
              ["beat", "beat"],
            ] as const).map(([label, bandName]) => (
              <div key={bandName} className="band-row">
                <span>{label}</span>
                <meter max="1" min="0" value={bands[bandName]} />
                <strong>{Math.round(bands[bandName] * 100)}</strong>
              </div>
            ))}
          </div>

          <div className="clip-status" aria-label="현재 영상">
            <FileVideo size={15} aria-hidden="true" />
            <span>
              <strong>{clip?.name ?? "업로드한 영상이 없습니다."}</strong>
              <em>{clipStatus}</em>
            </span>
          </div>
        </aside>

        <section className="ascii-main-panel">
          <div className="ascii-stage">
            <canvas ref={canvasRef} className="ascii-canvas" />
            <video
              ref={videoRef}
              className="ascii-source-video"
              playsInline
              preload="metadata"
              onEnded={handleEnded}
              onError={handleVideoError}
              onLoadedMetadata={handleLoadedMetadata}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
            {!clip ? (
              <div className="ascii-empty-state">
                <Sparkles size={30} aria-hidden="true" />
                <strong>Audio Reactive ASCII</strong>
              </div>
            ) : null}
            <div className="ascii-stage-hud">
              <span>{clip?.name ?? "No clip"}</span>
              <span>
                {recordingState === "recording"
                  ? "recording"
                  : `${autoFilter ? "auto" : "manual"} · ${activeFilter.label}`}
              </span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
