// 한 프레임의 주파수 데이터
export type FrequencyFrame = {
  timestamp: number; // 초 단위
  sub: number;       // 28-80 Hz
  bass: number;      // 80-250 Hz
  lowMid: number;    // 250-500 Hz
  mid: number;       // 500-2000 Hz
  presence: number;  // 2000-4000 Hz
  high: number;      // 4000-8000 Hz
  air: number;       // 8000-16000 Hz
  flux: number;      // 변화도
};

// 분석 결과 컨테이너
export type AudioAnalysisResult = {
  duration: number;
  sampleRate: number;
  frames: FrequencyFrame[];
};

// 분석 진행 상태
export type AnalysisProgress = {
  status: "idle" | "analyzing" | "done" | "error";
  progress: number; // 0-1
  error?: string;
};
