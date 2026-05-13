import {
  FileVideo,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeAudio } from "./services/audioAnalysis";
import { useFrequencyBands } from "./hooks/useFrequencyBands";
import type { AudioAnalysisResult, AnalysisProgress } from "./types/audioAnalysis";

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

type AsciiMode = "dots" | "matrix" | "edges" | "poster";
type AsciiPolarity = "audio" | "positive" | "negative";
type AsciiViewMode = "split" | "overlay";
type EffectFilterId = "silver" | "thermal" | "matrix" | "edge" | "whiteout" | "redline";
type GlyphMode = "auto" | "dot" | "ascii" | "block" | "binary" | "edge";
type ResolvedGlyphMode = Exclude<GlyphMode, "auto">;
type AudioProfile = "idle" | "kick" | "bassline" | "snare" | "hat" | "lead" | "pad";
type FrequencyRouteBand = "idle" | "sub" | "bass" | "mid" | "presence" | "high" | "air" | "flux" | "beat";
type FrequencyFilterMap = Record<FrequencyRouteBand, EffectFilterId>;
type FilterPolarityMap = Record<EffectFilterId, AsciiPolarity>;
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
  glyphMode: GlyphMode;
  overlayStrength: number;
  pixelSize: number;
  polarity: AsciiPolarity;
  reactivity: number;
  sourceLevel: number;
  transitionSmooth: number;
  viewMode: AsciiViewMode;
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

const frequencyRouteOptions: Array<{ band: FrequencyRouteBand; label: string }> = [
  { band: "idle", label: "Idle" },
  { band: "sub", label: "Sub" },
  { band: "bass", label: "Bass" },
  { band: "mid", label: "Mid" },
  { band: "presence", label: "Presence" },
  { band: "high", label: "High" },
  { band: "air", label: "Air" },
  { band: "flux", label: "Flux" },
  { band: "beat", label: "Beat" },
];

const defaultFrequencyFilterMap: FrequencyFilterMap = {
  air: "whiteout",
  bass: "thermal",
  beat: "redline",
  flux: "edge",
  high: "edge",
  idle: "silver",
  mid: "matrix",
  presence: "matrix",
  sub: "redline",
};

const defaultFilterPolarityMap: FilterPolarityMap = {
  edge: "positive",
  matrix: "positive",
  redline: "positive",
  silver: "positive",
  thermal: "positive",
  whiteout: "positive",
};

const polarityOptions: Array<{ label: string; value: AsciiPolarity }> = [
  { label: "Positive", value: "positive" },
  { label: "Negative", value: "negative" },
  { label: "Beat", value: "audio" },
];

const glyphModeOptions: Array<{ label: string; value: GlyphMode }> = [
  { label: "Auto", value: "auto" },
  { label: "Dot", value: "dot" },
  { label: "ASCII", value: "ascii" },
  { label: "Block", value: "block" },
  { label: "Binary", value: "binary" },
  { label: "Edge", value: "edge" },
];

const defaultGlyphModeByFilter: Record<EffectFilterId, ResolvedGlyphMode> = {
  edge: "edge",
  matrix: "binary",
  redline: "block",
  silver: "dot",
  thermal: "block",
  whiteout: "ascii",
};

const glyphCharacters: Record<ResolvedGlyphMode, string> = {
  ascii: " .:-=+*#%@",
  binary: "01",
  block: "░▒▓█",
  dot: "",
  edge: "/\\|_-",
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

function resolveGlyphMode(mode: GlyphMode, filterId: EffectFilterId): ResolvedGlyphMode {
  return mode === "auto" ? defaultGlyphModeByFilter[filterId] : mode;
}

function getGlyphModeLabel(mode: GlyphMode | ResolvedGlyphMode) {
  return glyphModeOptions.find((option) => option.value === mode)?.label ?? mode;
}

function getIdleRouteFilter(frequencyFilterMap: FrequencyFilterMap) {
  return getEffectFilter(frequencyFilterMap.idle);
}

function isFrequencyRoutedFilter(filterId: EffectFilterId, frequencyFilterMap: FrequencyFilterMap) {
  return Object.values(frequencyFilterMap).includes(filterId);
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

function pickDominantFrequencyBand(bands: AudioBands, reactivity: number): { band: FrequencyRouteBand; value: number } {
  const candidates: Array<{ band: Exclude<FrequencyRouteBand, "idle">; value: number }> = [
    { band: "sub", value: bands.sub },
    { band: "bass", value: bands.bass },
    { band: "mid", value: Math.max(bands.mid, bands.lowMid * 0.85) },
    { band: "presence", value: bands.presence },
    { band: "high", value: bands.high },
    { band: "air", value: bands.air },
    { band: "flux", value: bands.flux },
    { band: "beat", value: bands.beat },
  ];

  const dominant = candidates.reduce((best, next) => (next.value > best.value ? next : best), candidates[0]);
  const idleThreshold = 0.055 - clamp(reactivity) * 0.025;
  if (Math.max(dominant.value, bands.level, bands.flux) < idleThreshold) {
    return { band: "idle", value: 0 };
  }

  return dominant;
}

function pickAudioEffectFilter(
  bands: AudioBands,
  reactivity: number,
  frequencyFilterMap: FrequencyFilterMap,
) {
  const dominant = pickDominantFrequencyBand(bands, reactivity);
  return getEffectFilter(frequencyFilterMap[dominant.band]);
}

function buildReactiveEffectFilter(
  base: EffectFilter,
  bands: AudioBands,
  reactivity: number,
  frequencyFilterMap: FrequencyFilterMap,
) {
  const target = pickAudioEffectFilter(bands, reactivity, frequencyFilterMap);
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

function readLuminance(pixels: Uint8ClampedArray, index: number) {
  const red = pixels[index] ?? 0;
  const green = pixels[index + 1] ?? 0;
  const blue = pixels[index + 2] ?? 0;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function pickGlyph(mode: Exclude<ResolvedGlyphMode, "dot">, intensity: number, column: number, row: number, seed: number) {
  const characters = glyphCharacters[mode];
  if (!characters.length) return "";

  if (mode === "binary" || mode === "edge") {
    const index = Math.abs(Math.floor(seed * 0.03 + column * 17 + row * 31 + intensity * 11)) % characters.length;
    return characters[index] ?? characters[0] ?? "";
  }

  const index = Math.min(characters.length - 1, Math.max(0, Math.round(clamp(intensity) * (characters.length - 1))));
  return characters[index] ?? characters[characters.length - 1] ?? "";
}

function drawGlyph(
  context: CanvasRenderingContext2D,
  mode: ResolvedGlyphMode,
  glyph: string,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  alpha: number,
  color: Rgb,
) {
  if (mode === "dot") {
    const radius = Math.max(0.9, Math.min(cellWidth, cellHeight) * (0.16 + alpha * 0.28));
    context.fillStyle = rgba(color, 0.14 + alpha * 0.76);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  const fontSize = Math.max(5, Math.min(cellWidth * 1.18, cellHeight * 1.24));
  context.fillStyle = rgba(color, 0.22 + alpha * 0.72);
  context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(glyph, x, y);
}

function drawMatrixRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: AudioBands,
  filter: EffectFilter,
  pixelSize: number,
  glyphMode: ResolvedGlyphMode,
  beatInvert: boolean,
  seed: number,
) {
  const cellTarget = mixNumber(6.2, 15.2, pixelSize);
  const columns = Math.max(30, Math.round(width / cellTarget));
  const cellWidth = width / columns;
  const rows = Math.ceil(height / Math.max(5, cellWidth * 1.2));
  const glow = 0.28 + bands.high * 0.56;

  const background = mixRgb(
    beatInvert ? filter.invertBackground : filter.background,
    filter.flashColor,
    bands.bass * filter.flashGain * 0.38,
  );
  const ink = beatInvert ? filter.invertInk : filter.ink;

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
      if (glyphMode === "dot") {
        context.fillStyle = rgba(ink, alpha);
        context.beginPath();
        context.arc(x, y, Math.max(1.1, cellWidth * (0.1 + alpha * 0.24)), 0, Math.PI * 2);
        context.fill();
      } else {
        const matrixGlyphMode = glyphMode === "ascii" || glyphMode === "block" ? glyphMode : "binary";
        const glyph = pickGlyph(matrixGlyphMode, alpha, column, row, seed);
        drawGlyph(context, matrixGlyphMode, glyph, x, y, cellWidth, cellWidth * 1.2, alpha, ink);
      }
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
  const glyphMode = resolveGlyphMode(settings.glyphMode, filter.id);
  const dynamicDensity = clamp(settings.density + filter.densityBoost + bands.mid * 0.34, 0.18, 1);
  const pixelSize = clamp(settings.pixelSize);
  const pixelScale = mixNumber(1.34, 0.66, pixelSize);
  const columns = Math.max(32, Math.round((54 + dynamicDensity * 124) * pixelScale));
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
  const beatInvert =
    settings.polarity === "negative" ||
    (settings.polarity === "audio" && bands.beat > filter.invertThreshold);
  const background = mixRgb(filter.background, filter.flashColor, bassFlash);

  if (mode === "matrix") {
    drawMatrixRain(context, width, height, bands, filter, pixelSize, glyphMode, beatInvert, seed);
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
  const lightInkColor = beatInvert ? filter.invertInk : filter.ink;
  const ghostInkColor = filter.ghost;
  const lightInk = beatInvert ? rgba(filter.invertInk, 0.9) : rgba(filter.ink, 0.9);
  const darkInk = beatInvert ? rgba(filter.ink, 0.78) : rgba(filter.mask, mode === "poster" ? 0.42 : 0.9);
  const maskFill = mode === "matrix"
    ? rgba(beatInvert ? filter.invertBackground : filter.mask, 0.96)
    : darkInk;

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

      if (glyphMode === "dot") {
        context.fillStyle = silhouette ? lightInk : rgba(filter.ghost, 0.14 + bands.high * filter.noise * 0.54);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      } else {
        const glyph = pickGlyph(glyphMode, intensity, column, row, seed);
        const glyphColor = silhouette ? lightInkColor : ghostInkColor;
        drawGlyph(context, glyphMode, glyph, x, y, cellWidth, cellHeight, intensity, glyphColor);
      }
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
  const [frequencyFilterMap, setFrequencyFilterMap] = useState<FrequencyFilterMap>(defaultFrequencyFilterMap);
  const [glyphMode, setGlyphMode] = useState<GlyphMode>("auto");
  const [isPlaying, setIsPlaying] = useState(false);
  const [filterPolarityMap, setFilterPolarityMap] = useState<FilterPolarityMap>(defaultFilterPolarityMap);
  const [overlayStrength, setOverlayStrength] = useState(0.9);
  const [pixelSize, setPixelSize] = useState(0.5);
  const [reactivity, setReactivity] = useState(0.82);
  const [sourceLevel, setSourceLevel] = useState(0.7);
  const [analysisResult, setAnalysisResult] = useState<AudioAnalysisResult | null>(null);
  const [displayProgress, setDisplayProgress] = useState<AnalysisProgress>({ status: "idle", progress: 0 });
  const [transitionSmooth, setTransitionSmooth] = useState(0.72);
  const [viewMode, setViewMode] = useState<AsciiViewMode>("split");

  const { interpolateFrames } = useFrequencyBands(analysisResult);

  const activeFilter = getEffectFilter(activeFilterId);
  const activeFilterRef = useRef<EffectFilter>(defaultEffectFilter);
  const autoFilterRef = useRef(true);
  const bandsRef = useRef<AudioBands>(emptyBands);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipUrlRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filterCandidateRef = useRef<FilterCandidate>({ id: defaultEffectFilter.id, since: 0 });
  const filterPolarityMapRef = useRef<FilterPolarityMap>(defaultFilterPolarityMap);
  const frequencyFilterMapRef = useRef<FrequencyFilterMap>(defaultFrequencyFilterMap);
  const fullscreenViewRef = useRef<"generated" | null>(null);
  const lastFilterSwitchRef = useRef(0);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reactivityRef = useRef(reactivity);
  const renderedFilterRef = useRef<EffectFilter>(defaultEffectFilter);
  const visualBandsRef = useRef<AudioBands>(emptyBands);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<AsciiSettings>({
    contrast,
    density,
    filter: defaultEffectFilter,
    glyphMode,
    overlayStrength,
    pixelSize,
    polarity: defaultFilterPolarityMap[defaultEffectFilter.id],
    reactivity,
    sourceLevel,
    transitionSmooth,
    viewMode,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
    filterPolarityMapRef.current = filterPolarityMap;
    reactivityRef.current = reactivity;
    const polarity = filterPolarityMap[activeFilterId];
    settingsRef.current = {
      contrast,
      density,
      filter: activeFilter,
      glyphMode,
      overlayStrength,
      pixelSize,
      polarity,
      reactivity,
      sourceLevel,
      transitionSmooth,
      viewMode,
    };
  }, [
    activeFilter,
    activeFilterId,
    contrast,
    density,
    filterPolarityMap,
    glyphMode,
    overlayStrength,
    pixelSize,
    reactivity,
    sourceLevel,
    transitionSmooth,
    viewMode,
  ]);

  useEffect(() => {
    autoFilterRef.current = autoFilter;
    if (!autoFilter) return;

    const routeMap = frequencyFilterMapRef.current;
    if (isFrequencyRoutedFilter(activeFilterRef.current.id, routeMap)) return;

    const nextFilter = getIdleRouteFilter(routeMap);
    activeFilterRef.current = nextFilter;
    filterCandidateRef.current = { id: nextFilter.id, since: performance.now() };
    setActiveFilterId(nextFilter.id);
  }, [autoFilter]);

  useEffect(() => {
    frequencyFilterMapRef.current = frequencyFilterMap;
    if (!autoFilterRef.current || isFrequencyRoutedFilter(activeFilterRef.current.id, frequencyFilterMap)) return;

    const nextFilter = getIdleRouteFilter(frequencyFilterMap);
    activeFilterRef.current = nextFilter;
    filterCandidateRef.current = { id: nextFilter.id, since: performance.now() };
    setActiveFilterId(nextFilter.id);
  }, [frequencyFilterMap]);

  useEffect(() => {
    if (!isPlaying) return;

    const id = setInterval(() => {
      setBands({ ...visualBandsRef.current });
    }, 80);
    return () => clearInterval(id);
  }, [isPlaying]);

  const resolveActiveFilter = useCallback((audioBands: AudioBands, now: number) => {
    if (!autoFilterRef.current) return activeFilterRef.current;

    const sensitivity = reactivityRef.current;
    const routeMap = frequencyFilterMapRef.current;
    const nextFilter = pickAudioEffectFilter(audioBands, sensitivity, routeMap);
    const currentFilter = isFrequencyRoutedFilter(activeFilterRef.current.id, routeMap)
      ? activeFilterRef.current
      : getIdleRouteFilter(routeMap);
    const candidate = filterCandidateRef.current;
    const elapsed = now - lastFilterSwitchRef.current;
    if (candidate.id !== nextFilter.id) {
      if (activeFilterRef.current.id !== currentFilter.id) {
        activeFilterRef.current = currentFilter;
        setActiveFilterId(currentFilter.id);
      }
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
      const frame = interpolateFrames(video.currentTime);
      const previous = bandsRef.current;
      const reactSens = reactivityRef.current;
      let detectedBands: AudioBands;

      if (frame) {
        const blendIn = 0.46 + reactSens * 0.34;
        const blendOut = 1 - blendIn;
        const smoothedFrame = {
          air: clamp(previous.air * blendOut + frame.air * blendIn),
          bass: clamp(previous.bass * blendOut + frame.bass * blendIn),
          flux: clamp(previous.flux * blendOut + frame.flux * blendIn),
          high: clamp(previous.high * blendOut + frame.high * blendIn),
          lowMid: clamp(previous.lowMid * blendOut + frame.lowMid * blendIn),
          mid: clamp(previous.mid * blendOut + frame.mid * blendIn),
          presence: clamp(previous.presence * blendOut + frame.presence * blendIn),
          sub: clamp(previous.sub * blendOut + frame.sub * blendIn),
        };
        const level = clamp(
          smoothedFrame.sub * 0.18 + smoothedFrame.bass * 0.34 + smoothedFrame.lowMid * 0.18 +
          smoothedFrame.mid * 0.18 + smoothedFrame.presence * 0.14 + smoothedFrame.high * 0.12 + smoothedFrame.air * 0.08
        );
        const transient = clamp(smoothedFrame.flux * 0.62 + smoothedFrame.bass * 0.22 + smoothedFrame.mid * 0.16);
        const subBassThreshold = Math.max(0.28 - reactSens * 0.08, (previous.sub + previous.bass * 0.65) * (1.15 - reactSens * 0.08));
        const subBassHit = (smoothedFrame.sub + smoothedFrame.bass * 0.65) > subBassThreshold;
        const transientThreshold = Math.max(0.14 - reactSens * 0.08, previous.transient * (1.14 - reactSens * 0.08));
        const transientHit = transient > transientThreshold;
        const levelThreshold = Math.max(0.16 - reactSens * 0.08, previous.level * (1.18 - reactSens * 0.08));
        const levelHit = level > levelThreshold;
        const beatRaw = (subBassHit || transientHit || levelHit)
          ? 1
          : previous.beat * (0.8 - reactSens * 0.16);
        const profileResult = detectAudioProfile({ ...smoothedFrame, beat: clamp(beatRaw), level, transient });
        detectedBands = {
          ...smoothedFrame,
          beat: clamp(beatRaw),
          level,
          transient,
          profile: profileResult.profile,
          profileStrength: clamp(previous.profileStrength * 0.42 + profileResult.profileStrength * 0.58),
        };
        bandsRef.current = detectedBands;
      } else {
        detectedBands = bandsRef.current;
      }
      const audioBands = smoothVisualBands(visualBandsRef.current, detectedBands, settingsRef.current.transitionSmooth);
      visualBandsRef.current = audioBands;
      const baseFilter = resolveActiveFilter(audioBands, now);
      const targetFilter = autoFilterRef.current
        ? buildReactiveEffectFilter(
            baseFilter,
            audioBands,
            settingsRef.current.reactivity,
            frequencyFilterMapRef.current,
          )
        : baseFilter;
      const effectFilter = smoothEffectFilterTransition(
        renderedFilterRef.current,
        targetFilter,
        settingsRef.current.transitionSmooth,
        settingsRef.current.reactivity,
      );
      renderedFilterRef.current = effectFilter;
      const frameSettings = {
        ...settingsRef.current,
        filter: effectFilter,
        polarity: filterPolarityMapRef.current[effectFilter.id],
      };
      const canDrawVideo = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;
      const hatSpark = clamp(audioBands.air * 0.8 + audioBands.high * 0.42 + audioBands.flux * 0.28);
      const rgbSplit = hatSpark * frameSettings.reactivity;
      const isGeneratedFullscreen = document.fullscreenElement === canvas && fullscreenViewRef.current === "generated";
      const isOverlayMode = frameSettings.viewMode === "overlay" && !isGeneratedFullscreen;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      if (canDrawVideo) {
        const sampleCanvas = sampleCanvasRef.current ?? document.createElement("canvas");
        sampleCanvasRef.current = sampleCanvas;

        if (isGeneratedFullscreen) {
          drawAsciiTop(context, video, sampleCanvas, width, height, audioBands, frameSettings, now);
        } else if (isOverlayMode) {
          context.save();
          context.globalAlpha = clamp(frameSettings.sourceLevel, 0.35, 1);
          drawCover(context, video, video.videoWidth, video.videoHeight, 0, 0, width, height);
          context.restore();

          const overlayCanvas = overlayCanvasRef.current ?? document.createElement("canvas");
          overlayCanvasRef.current = overlayCanvas;
          if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
            overlayCanvas.width = width;
            overlayCanvas.height = height;
          }

          const overlayContext = overlayCanvas.getContext("2d", { alpha: true });
          if (overlayContext) {
            overlayContext.clearRect(0, 0, width, height);
            const overlaySettings: AsciiSettings = {
              ...frameSettings,
              contrast: clamp(frameSettings.contrast + 0.14),
              density: clamp(frameSettings.density + 0.06),
            };
            drawAsciiTop(overlayContext, video, sampleCanvas, width, height, audioBands, overlaySettings, now);
            const overlayAlpha = clamp(
              frameSettings.overlayStrength + audioBands.level * 0.08 + audioBands.high * 0.07,
              0.28,
              1,
            );
            context.save();
            context.globalCompositeOperation = "screen";
            context.globalAlpha = overlayAlpha;
            context.drawImage(overlayCanvas, 0, 0);
            context.globalCompositeOperation = "lighter";
            context.globalAlpha = overlayAlpha * 0.16;
            context.drawImage(overlayCanvas, 0, 0);
            context.restore();
          }
        } else {
          context.save();
          drawAsciiTop(context, video, sampleCanvas, width, topHeight, audioBands, frameSettings, now);
          context.restore();

          context.save();
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
        }
      } else {
        context.fillStyle = "#050705";
        context.fillRect(0, 0, width, height);
      }

      if (canDrawVideo) {
        drawModulationOverlays(context, width, height, audioBands, effectFilter, now);
      }
    },
    [interpolateFrames, resolveActiveFilter],
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

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = Array.from(files ?? []).find((nextFile) => nextFile.type.startsWith("video/"));
      if (!file) return;

      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);

      const url = URL.createObjectURL(file);
      clipUrlRef.current = url;
      const nextClip: AsciiClip = {
        name: file.name,
        ready: false,
        url,
      };

      setClip(nextClip);
      setIsPlaying(false);
      setAnalysisResult(null);
      setDisplayProgress({ status: "idle", progress: 0 });
      setBands(emptyBands);
      bandsRef.current = emptyBands;
      visualBandsRef.current = emptyBands;
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
    [renderFrame],
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !clip?.ready) return;

    if (video.paused) {
      await video.play();
      setIsPlaying(true);
      startRenderLoop();
      return;
    }

    video.pause();
    setIsPlaying(false);
    stopRenderLoop();
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [clip?.ready, renderFrame, startRenderLoop, stopRenderLoop]);

  const resetPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    bandsRef.current = emptyBands;
    visualBandsRef.current = emptyBands;
    renderedFilterRef.current = activeFilterRef.current;
    filterCandidateRef.current = { id: activeFilterRef.current.id, since: performance.now() };
    setBands(emptyBands);
    stopRenderLoop();
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [renderFrame, stopRenderLoop]);

  const handleGeneratedFullscreen = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (document.fullscreenElement === canvas) {
        await document.exitFullscreen();
        return;
      }
      fullscreenViewRef.current = "generated";
      await canvas.requestFullscreen();
      window.requestAnimationFrame((now) => renderFrame(now));
    } catch {
      fullscreenViewRef.current = null;
      // Fullscreen can be rejected by browser policy; the canvas remains usable inline.
    }
  }, [renderFrame]);

  const handleOriginalFullscreen = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.fullscreenElement === video) {
        await document.exitFullscreen();
        return;
      }
      fullscreenViewRef.current = null;
      await video.requestFullscreen();
    } catch {
      // Fullscreen can be rejected by browser policy; the inline original remains available.
    }
  }, []);

  useEffect(() => {
    const handleResize = () => window.requestAnimationFrame((now) => renderFrame(now));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderFrame]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== canvasRef.current) {
        fullscreenViewRef.current = null;
      }
      window.requestAnimationFrame((now) => renderFrame(now));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [renderFrame]);

  useEffect(() => {
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [
    activeFilterId,
    autoFilter,
    clip,
    contrast,
    density,
    frequencyFilterMap,
    filterPolarityMap,
    glyphMode,
    overlayStrength,
    pixelSize,
    reactivity,
    renderFrame,
    sourceLevel,
    transitionSmooth,
    viewMode,
  ]);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, [stopRenderLoop]);

  const analyzeAndPrepare = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.src) return;
    const requestedSrc = video.src;
    const initialProgress: AnalysisProgress = { status: "analyzing", progress: 0 };
    setDisplayProgress(initialProgress);

    const AudioContextClass = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!AudioContextClass) {
      const errorProgress: AnalysisProgress = {
        status: "error",
        progress: 0,
        error: "Web Audio API not supported",
      };
      setDisplayProgress(errorProgress);
      return;
    }
    const audioCtx = new AudioContextClass();

    try {
      const response = await fetch(video.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const result = await analyzeAudio(audioBuffer, (progress) => {
        setDisplayProgress(progress);
      });

      if (videoRef.current?.src !== requestedSrc) return;
      setAnalysisResult(result);
      setDisplayProgress({ status: "idle", progress: 0 });
    } catch (error) {
      const errorProgress: AnalysisProgress = {
        status: "error",
        progress: 0,
        error: error instanceof Error ? error.message : "Analysis failed",
      };
      setDisplayProgress(errorProgress);
    } finally {
      await audioCtx.close().catch(() => {});
    }
  }, []);

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
    void analyzeAndPrepare();
    window.requestAnimationFrame((now) => renderFrame(now));
  }, [renderFrame, analyzeAndPrepare]);

  const handleVideoError = useCallback(() => {
    setClip((currentClip) => {
      if (!currentClip) return currentClip;
      return { ...currentClip, error: "Unable to read this video.", ready: false };
    });
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    stopRenderLoop();
  }, [stopRenderLoop]);

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
          <a className="page-link" href="/gesture">
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

          <button
            className={`upload-zone ascii-upload-zone${clip ? " has-clip" : ""}${clip?.error ? " has-error" : ""}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            {clip ? <FileVideo size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
            <span>{clip?.name ?? "Upload Video"}</span>
            <small>{clip ? `${clipStatus} · click to replace` : clipStatus}</small>
          </button>

          {displayProgress.status === "analyzing" && (
            <div className="analysis-progress">
              Analyzing... {Math.round(displayProgress.progress * 100)}%
            </div>
          )}
          {displayProgress.status === "error" && (
            <div className="analysis-error">{displayProgress.error}</div>
          )}

          <div className="ascii-transport">
            <button className="primary" type="button" onClick={togglePlayback} disabled={!canUseClip}>
              {isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={resetPlayback} disabled={!clip}>
              <RotateCcw size={17} aria-hidden="true" />
              Restart
            </button>
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
            <div className="mode-segments" aria-label="ASCII effect filter">
              {effectFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={activeFilterId === filter.id ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setAutoFilter(false);
                    activeFilterRef.current = filter;
                    settingsRef.current = {
                      ...settingsRef.current,
                      filter,
                      polarity: filterPolarityMap[filter.id],
                    };
                    setActiveFilterId(filter.id);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="relief-route-grid" aria-label="Per-preset polarity settings">
              {effectFilters.map((filter) => (
                <div key={filter.id} className="relief-route-row">
                  <span>{filter.label}</span>
                  <div className="relief-toggle" role="group" aria-label={`${filter.label} polarity`}>
                    {polarityOptions.map((option) => (
                      <button
                        key={option.value}
                        className={filterPolarityMap[filter.id] === option.value ? "active" : ""}
                        type="button"
                        aria-pressed={filterPolarityMap[filter.id] === option.value}
                        onClick={() => {
                          setFilterPolarityMap((currentMap) => {
                            const nextMap = {
                              ...currentMap,
                              [filter.id]: option.value,
                            };
                            filterPolarityMapRef.current = nextMap;
                            return nextMap;
                          });
                          if (activeFilterId === filter.id || renderedFilterRef.current.id === filter.id) {
                            settingsRef.current = {
                              ...settingsRef.current,
                              polarity: option.value,
                            };
                          }
                          window.requestAnimationFrame((now) => renderFrame(now));
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ascii-panel-group">
            <div className="panel-title">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <h2>Frequency Routing</h2>
            </div>
            <div className="frequency-route-grid" aria-label="Frequency filter routing">
              {frequencyRouteOptions.map((option) => (
                <label key={option.band} className="frequency-route-row">
                  <span>{option.label}</span>
                  <select
                    value={frequencyFilterMap[option.band]}
                    onChange={(event) => {
                      const nextFilterId = event.target.value as EffectFilterId;
                      setAutoFilter(true);
                      setFrequencyFilterMap((currentMap) => ({
                        ...currentMap,
                        [option.band]: nextFilterId,
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
            <div className="mode-segments render-segments" aria-label="ASCII render mode">
              <button
                className={viewMode === "split" ? "active" : ""}
                type="button"
                aria-pressed={viewMode === "split"}
                onClick={() => setViewMode("split")}
              >
                Split
              </button>
              <button
                className={viewMode === "overlay" ? "active" : ""}
                type="button"
                aria-pressed={viewMode === "overlay"}
                onClick={() => setViewMode("overlay")}
              >
                Overlay
              </button>
            </div>
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
              <span>Layer</span>
              <input
                max="1"
                min="0.25"
                step="0.01"
                type="range"
                value={overlayStrength}
                onChange={(event) => setOverlayStrength(Number(event.target.value))}
              />
              <strong>{Math.round(overlayStrength * 100)}%</strong>
            </label>
            <label className="range-row">
              <span>Source</span>
              <input
                max="1"
                min="0.35"
                step="0.01"
                type="range"
                value={sourceLevel}
                onChange={(event) => setSourceLevel(Number(event.target.value))}
              />
              <strong>{Math.round(sourceLevel * 100)}%</strong>
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
              <span>Pixel</span>
              <input
                max="1"
                min="0"
                step="0.01"
                type="range"
                value={pixelSize}
                onChange={(event) => setPixelSize(Number(event.target.value))}
              />
              <strong>{Math.round(pixelSize * 100)}%</strong>
            </label>
            <label className="select-row">
              <span>Glyph</span>
              <select
                value={glyphMode}
                onChange={(event) => setGlyphMode(event.target.value as GlyphMode)}
              >
                {glyphModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <strong>{getGlyphModeLabel(resolveGlyphMode(glyphMode, activeFilterId))}</strong>
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
            {clip && viewMode === "split" ? (
              <>
                <button
                  className="stage-hit stage-hit-generated"
                  type="button"
                  onClick={handleGeneratedFullscreen}
                >
                  <span>Generated Fullscreen</span>
                </button>
                <button
                  className="stage-hit stage-hit-original"
                  type="button"
                  onClick={handleOriginalFullscreen}
                >
                  <span>Source Fullscreen</span>
                </button>
              </>
            ) : null}
            <div className="ascii-stage-hud">
              <span>{clip?.name ?? "No clip"}</span>
              <span>{displayProgress.status === "analyzing"
                ? `analyzing ${Math.round(displayProgress.progress * 100)}%`
                : `${autoFilter ? "auto" : "manual"} · ${activeFilter.label}`}</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
