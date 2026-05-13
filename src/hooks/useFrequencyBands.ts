import { useRef, useCallback } from "react";
import { FrequencyFrame, AudioAnalysisResult } from "../types/audioAnalysis";

export function useFrequencyBands(analysisResult: AudioAnalysisResult | null) {
  const analysisRef = useRef(analysisResult);
  analysisRef.current = analysisResult;

  const getFrameAtTime = useCallback((time: number): FrequencyFrame | null => {
    if (!analysisRef.current) return null;

    const frames = analysisRef.current.frames;
    if (frames.length === 0) return null;

    // Binary search to find the frame at or before this time
    let left = 0;
    let right = frames.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (frames[mid].timestamp < time) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return frames[left] ?? frames[frames.length - 1];
  }, []);

  const interpolateFrames = useCallback(
    (time: number, smoothness: number = 0.1): FrequencyFrame | null => {
      if (!analysisRef.current) return null;

      const frames = analysisRef.current.frames;
      const frame = getFrameAtTime(time);
      if (!frame) return null;

      const currentIndex = frames.findIndex((f) => f.timestamp === frame.timestamp);
      const nextFrame = frames[currentIndex + 1];

      if (!nextFrame) return frame;

      const timeDelta = nextFrame.timestamp - frame.timestamp;
      const progress = timeDelta > 0 ? ((time - frame.timestamp) / timeDelta) * smoothness : 0;

      return {
        timestamp: time,
        sub: frame.sub + (nextFrame.sub - frame.sub) * progress,
        bass: frame.bass + (nextFrame.bass - frame.bass) * progress,
        lowMid: frame.lowMid + (nextFrame.lowMid - frame.lowMid) * progress,
        mid: frame.mid + (nextFrame.mid - frame.mid) * progress,
        presence: frame.presence + (nextFrame.presence - frame.presence) * progress,
        high: frame.high + (nextFrame.high - frame.high) * progress,
        air: frame.air + (nextFrame.air - frame.air) * progress,
        flux: frame.flux + (nextFrame.flux - frame.flux) * progress,
      };
    },
    [getFrameAtTime],
  );

  return { getFrameAtTime, interpolateFrames };
}
