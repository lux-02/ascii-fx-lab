import FFT from 'fft.js';
import { FrequencyFrame, AudioAnalysisResult, AnalysisProgress } from "../types/audioAnalysis";

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
  return clamp(average * 0.58 + (peak / 255) * 0.42);
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

  return clamp((sum / ((end - start + 1) * 255)) * 0.68 + (peak / 255) * 0.32);
}

export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AudioAnalysisResult> {
  onProgress?.({ status: "analyzing", progress: 0 });

  const sampleRate = audioBuffer.sampleRate;
  const frames: FrequencyFrame[] = [];
  const hopSize = Math.floor(sampleRate / 30); // ~30fps
  const fftSize = 1024;
  const fft = new FFT(fftSize);

  const channelData = audioBuffer.getChannelData(0);
  const frequencyData = new Uint8Array(fftSize / 2);
  const previousData = new Uint8Array(fftSize / 2);

  // Hann window for better frequency analysis
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  for (let i = 0; i < channelData.length; i += hopSize) {
    // Extract and window the audio frame
    const frame = new Float32Array(fftSize);
    for (let j = 0; j < fftSize; j += 1) {
      const idx = i + j;
      frame[j] = (idx < channelData.length ? channelData[idx] : 0) * window[j];
    }

    // Perform FFT
    const spectrum = fft.createComplexArray();
    fft.realTransform(spectrum, frame);

    // Convert complex spectrum to magnitude (0-255 scale)
    for (let j = 0; j < fftSize / 2; j += 1) {
      const real = spectrum[2 * j] ?? 0;
      const imag = spectrum[2 * j + 1] ?? 0;
      const magnitude = Math.sqrt(real * real + imag * imag);
      frequencyData[j] = Math.max(0, Math.min(255, magnitude * 2));
    }

    // Calculate frequency bands using helper functions
    const sub = averageBand(frequencyData, sampleRate, 28, 80);
    const bass = averageBand(frequencyData, sampleRate, 80, 250);
    const lowMid = averageBand(frequencyData, sampleRate, 250, 500);
    const mid = averageBand(frequencyData, sampleRate, 500, 2000);
    const presence = averageBand(frequencyData, sampleRate, 2000, 4000);
    const high = averageBand(frequencyData, sampleRate, 4000, 8000);
    const air = averageBand(frequencyData, sampleRate, 8000, 16000);

    // Calculate flux using helper function
    const flux = positiveBandFlux(frequencyData, previousData, sampleRate, 28, 16000);

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

    const progress = i / channelData.length;
    onProgress?.({ status: "analyzing", progress });
  }

  onProgress?.({ status: "done", progress: 1 });

  return {
    duration: audioBuffer.duration,
    sampleRate,
    frames,
  };
}
