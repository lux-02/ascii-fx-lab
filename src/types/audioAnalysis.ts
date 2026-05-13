// Frequency data for one frame.
export type FrequencyFrame = {
  timestamp: number; // seconds
  sub: number;       // 28-80 Hz
  bass: number;      // 80-250 Hz
  lowMid: number;    // 250-500 Hz
  mid: number;       // 500-2000 Hz
  presence: number;  // 2000-4000 Hz
  high: number;      // 4000-8000 Hz
  air: number;       // 8000-16000 Hz
  flux: number;      // spectral change
};

// Analysis result container.
export type AudioAnalysisResult = {
  duration: number;
  sampleRate: number;
  frames: FrequencyFrame[];
};

// Analysis progress state.
export type AnalysisProgress = {
  status: "idle" | "analyzing" | "done" | "error";
  progress: number; // 0-1
  error?: string;
};
