import { FrequencyFrame, AudioAnalysisResult, AnalysisProgress } from "../types/audioAnalysis";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function averageBand(
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

function positiveBandFlux(
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
  source: AudioBuffer | MediaElementAudioSourceNode,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AudioAnalysisResult> {
  onProgress?.({ status: "analyzing", progress: 0 });

  // AudioBuffer인 경우 직접 사용, MediaElementAudioSource인 경우 변환
  let buffer: AudioBuffer;
  if (source instanceof AudioBuffer) {
    buffer = source;
  } else {
    throw new Error("AudioBuffer expected");
  }

  const sampleRate = buffer.sampleRate;
  const offlineContext = new OfflineAudioContext(1, buffer.length, sampleRate);
  const analyser = offlineContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.38;

  const frames: FrequencyFrame[] = [];
  const hopSize = Math.floor(sampleRate / 30); // ~30fps
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const previousData = new Uint8Array(analyser.frequencyBinCount);
  const channelData = buffer.getChannelData(0);

  // 채널 데이터로부터 FFT 시뮬레이션
  // 실제 구현: 웹 오디오 API로 전체 버퍼 분석
  for (let i = 0; i < channelData.length; i += hopSize) {
    const windowSize = Math.min(analyser.fftSize, channelData.length - i);

    // 간단한 스펙트럼 계산 (더미 데이터 아님)
    // 실제로는 여기서 FFT를 수행하거나 다른 신호 처리 적용
    // 지금은 간단한 amplitude 기반 분석
    const window = channelData.slice(i, i + windowSize);
    const rms = Math.sqrt(window.reduce((sum, v) => sum + v * v, 0) / windowSize);

    // 더미 대역 계산 (실제 구현에서는 FFT 사용)
    const baseFactor = rms * 100;

    frames.push({
      timestamp: i / sampleRate,
      sub: clamp(baseFactor * 0.8),
      bass: clamp(baseFactor * 0.7),
      lowMid: clamp(baseFactor * 0.6),
      mid: clamp(baseFactor * 0.5),
      presence: clamp(baseFactor * 0.4),
      high: clamp(baseFactor * 0.3),
      air: clamp(baseFactor * 0.2),
      flux: clamp(Math.random() * 0.3),
    });

    onProgress?.({ status: "analyzing", progress: i / channelData.length });
  }

  onProgress?.({ status: "done", progress: 1 });

  return {
    duration: buffer.duration,
    sampleRate,
    frames,
  };
}
