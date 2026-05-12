import FFT from 'fft.js';
import { FrequencyFrame, AudioAnalysisResult, AnalysisProgress } from "../types/audioAnalysis";

// === Constants ===
const TARGET_FPS = 30;
const FFT_SIZE = 1024;
const MAGNITUDE_SCALE = 2; // Hann window energy compensation
const BAND_MEAN_WEIGHT = 0.58;
const BAND_PEAK_WEIGHT = 0.42;
const FLUX_MEAN_WEIGHT = 0.68;
const FLUX_PEAK_WEIGHT = 0.32;

const FREQUENCY_BANDS = {
  sub: { low: 28, high: 80 },
  bass: { low: 80, high: 250 },
  lowMid: { low: 250, high: 500 },
  mid: { low: 500, high: 2000 },
  presence: { low: 2000, high: 4000 },
  high: { low: 4000, high: 8000 },
  air: { low: 8000, high: 16000 },
} as const;

const FLUX_FREQ_LOW = 28;
const FLUX_FREQ_HIGH = 16000;

// === Helpers ===
export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function averageBand(
  data: Uint8Array,
  sampleRate: number,
  lowFrequency: number,
  highFrequency: number,
): number {
  if (!data.length) return 0;

  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((lowFrequency / nyquist) * data.length));
  const end = Math.min(data.length - 1, Math.ceil((highFrequency / nyquist) * data.length));

  if (end <= start) return 0;

  let sum = 0;
  let peak = 0;
  for (let i = start; i <= end; i += 1) {
    const value = data[i] ?? 0;
    sum += value;
    peak = Math.max(peak, value);
  }

  const average = sum / ((end - start + 1) * 255);
  return clamp(average * BAND_MEAN_WEIGHT + (peak / 255) * BAND_PEAK_WEIGHT);
}

export function positiveBandFlux(
  data: Uint8Array,
  previousData: Uint8Array,
  sampleRate: number,
  lowFrequency: number,
  highFrequency: number,
): number {
  if (!data.length || previousData.length !== data.length) return 0;

  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((lowFrequency / nyquist) * data.length));
  const end = Math.min(data.length - 1, Math.ceil((highFrequency / nyquist) * data.length));
  if (end <= start) return 0;

  let sum = 0;
  let peak = 0;
  for (let i = start; i <= end; i += 1) {
    const diff = Math.max(0, (data[i] ?? 0) - (previousData[i] ?? 0));
    sum += diff;
    peak = Math.max(peak, diff);
  }

  return clamp((sum / ((end - start + 1) * 255)) * FLUX_MEAN_WEIGHT + (peak / 255) * FLUX_PEAK_WEIGHT);
}

// === Main Analysis ===
export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AudioAnalysisResult> {
  try {
    onProgress?.({ status: "analyzing", progress: 0 });

    // Validate input
    if (!audioBuffer || audioBuffer.numberOfChannels === 0 || audioBuffer.length === 0) {
      throw new Error("Invalid audio buffer: empty or no channels");
    }

    if (audioBuffer.sampleRate <= 0) {
      throw new Error("Invalid sample rate");
    }

    const sampleRate = audioBuffer.sampleRate;
    const frames: FrequencyFrame[] = [];
    const hopSize = Math.floor(sampleRate / TARGET_FPS);
    const fft = new FFT(FFT_SIZE);

    const channelData = audioBuffer.getChannelData(0);
    const frequencyData = new Uint8Array(FFT_SIZE / 2);
    const previousData = new Uint8Array(FFT_SIZE / 2);

    // Hann window
    const window = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i += 1) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    }

    // Allocate reusable buffers outside the loop
    const frame = new Float32Array(FFT_SIZE);
    const spectrum = fft.createComplexArray();

    const totalFrames = Math.ceil(channelData.length / hopSize);
    const progressReportInterval = Math.max(1, Math.floor(totalFrames / 100));

    for (let i = 0; i < channelData.length; i += hopSize) {
      // Extract and window
      for (let j = 0; j < FFT_SIZE; j += 1) {
        const idx = i + j;
        frame[j] = (idx < channelData.length ? channelData[idx] : 0) * window[j];
      }

      // Perform FFT
      fft.realTransform(spectrum, frame);

      // Convert complex spectrum to magnitude (0-255)
      for (let j = 0; j < FFT_SIZE / 2; j += 1) {
        const real = spectrum[2 * j] ?? 0;
        const imag = spectrum[2 * j + 1] ?? 0;
        const magnitude = Math.sqrt(real * real + imag * imag);
        frequencyData[j] = Math.max(0, Math.min(255, magnitude * MAGNITUDE_SCALE));
      }

      // Calculate bands
      const sub = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.sub.low, FREQUENCY_BANDS.sub.high);
      const bass = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.bass.low, FREQUENCY_BANDS.bass.high);
      const lowMid = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.lowMid.low, FREQUENCY_BANDS.lowMid.high);
      const mid = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.mid.low, FREQUENCY_BANDS.mid.high);
      const presence = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.presence.low, FREQUENCY_BANDS.presence.high);
      const high = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.high.low, FREQUENCY_BANDS.high.high);
      const air = averageBand(frequencyData, sampleRate, FREQUENCY_BANDS.air.low, FREQUENCY_BANDS.air.high);

      // Calculate flux
      const flux = positiveBandFlux(frequencyData, previousData, sampleRate, FLUX_FREQ_LOW, FLUX_FREQ_HIGH);

      frames.push({
        timestamp: i / sampleRate,
        sub,
        bass,
        lowMid,
        mid,
        presence,
        high,
        air,
        flux,
      });

      previousData.set(frequencyData);

      // Throttle progress callback to ~100 updates
      const frameIndex = Math.floor(i / hopSize);
      if (frameIndex % progressReportInterval === 0) {
        const progress = i / channelData.length;
        onProgress?.({ status: "analyzing", progress });
      }
    }

    onProgress?.({ status: "done", progress: 1 });

    return {
      duration: audioBuffer.duration,
      sampleRate,
      frames,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    onProgress?.({ status: "error", progress: 0, error: errorMessage });
    throw new Error(`오디오 분석 실패: ${errorMessage}`);
  }
}
