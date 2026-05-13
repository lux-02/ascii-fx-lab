import { Camera, FileVideo, Hand, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AsciiVideoPage } from "./AsciiVideoPage";
import {
  DrawingUtils,
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

type Clip = {
  duration?: number;
  error?: string;
  frameHeight?: number;
  frames?: ImageBitmap[];
  framesReady: boolean;
  frameWidth?: number;
  id: string;
  metadataReady: boolean;
  name: string;
  url: string;
};

type CameraState = "idle" | "loading" | "ready" | "error";
type FrameState = "loading" | "first" | "moving" | "end";
type GestureName = "Closed_Fist" | "Open_Palm" | "None" | "Unknown";

const wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const modelPath = "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task";
const confidenceThreshold = 0.56;
const firstFrameThreshold = 4;
const endFrameThreshold = 96;
const precomputedFrameCount = 56;
const maxPrecomputedFrameSide = 860;

function formatGesture(gesture: GestureName) {
  if (gesture === "Closed_Fist") return "Closed Fist";
  if (gesture === "Open_Palm") return "Open Palm";
  if (gesture === "None") return "No hand";
  return "Unknown";
}

function formatDuration(duration?: number) {
  if (!duration || !Number.isFinite(duration)) return "metadata";

  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function readTopGesture(result: GestureRecognizerResult): { name: GestureName; score: number } {
  const gesture = result.gestures[0]?.[0];
  if (!gesture) return { name: "None", score: 0 };

  const name = gesture.categoryName as GestureName;
  return {
    name: name === "Closed_Fist" || name === "Open_Palm" ? name : "Unknown",
    score: gesture.score ?? 0,
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function fingerExtension(landmarks: NormalizedLandmark[], tipIndex: number, mcpIndex: number) {
  const wrist = landmarks[0];
  const tip = landmarks[tipIndex];
  const mcp = landmarks[mcpIndex];
  if (!wrist || !tip || !mcp) return null;

  const palmDistance = Math.max(distance(mcp, wrist), 0.0001);
  const extensionRatio = distance(tip, wrist) / palmDistance;
  return clamp((extensionRatio - 1.08) / 0.78);
}

function handClosureFromLandmarks(landmarks: NormalizedLandmark[] | undefined, gesture: GestureName, score: number) {
  if (!landmarks?.length) return null;

  const extensions = [
    fingerExtension(landmarks, 8, 5),
    fingerExtension(landmarks, 12, 9),
    fingerExtension(landmarks, 16, 13),
    fingerExtension(landmarks, 20, 17),
  ].filter((value): value is number => typeof value === "number");

  if (!extensions.length) return null;

  const averageExtension = extensions.reduce((sum, value) => sum + value, 0) / extensions.length;
  let closure = clamp(1 - averageExtension);

  if (gesture === "Open_Palm" && score >= 0.72) closure = Math.min(closure, 0.08);
  if (gesture === "Closed_Fist" && score >= 0.72) closure = Math.max(closure, 0.92);

  return closure;
}

function preloadVideoMetadata(url: string) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error("Invalid video duration"));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Unable to load video metadata"));
    };
    video.src = url;
    video.load();
  });
}

function disposeClipFrames(clipToDispose: Clip | null | undefined) {
  clipToDispose?.frames?.forEach((frame) => frame.close());
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onLoadedData = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to seek video"));
    };

    if (Math.abs(video.currentTime - time) < 0.001) {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }
      video.addEventListener("loadeddata", onLoadedData, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.load();
      return;
    }

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video seek timed out"));
    }, 4000);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

async function preloadVideoFrames(url: string, duration: number) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  video.load();

  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to load video frames"));
    });
  }

  const sourceWidth = video.videoWidth || 720;
  const sourceHeight = video.videoHeight || 1280;
  const scale = Math.min(1, maxPrecomputedFrameSide / Math.max(sourceWidth, sourceHeight));
  const frameWidth = Math.max(1, Math.round(sourceWidth * scale));
  const frameHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas unavailable");

  canvas.width = frameWidth;
  canvas.height = frameHeight;

  const frames: ImageBitmap[] = [];
  const lastTime = Math.max(0, duration - 0.045);
  const lastFrameIndex = Math.max(1, precomputedFrameCount - 1);

  for (let index = 0; index < precomputedFrameCount; index += 1) {
    const progress = index / lastFrameIndex;
    await waitForSeek(video, lastTime * progress);
    context.drawImage(video, 0, 0, frameWidth, frameHeight);
    frames.push(await createImageBitmap(canvas));
  }

  video.removeAttribute("src");
  video.load();
  return { frameHeight, frames, frameWidth };
}

function drawHandOverlay(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[][],
  gesture: GestureName,
  closure: number | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const drawingUtils = new DrawingUtils(ctx);

  for (const handLandmarks of landmarks) {
    drawingUtils.drawConnectors(handLandmarks, GestureRecognizer.HAND_CONNECTIONS, {
      color: closure !== null && closure > 0.55 ? "#f5bd3d" : "#17b6a4",
      lineWidth: 3,
    });
    drawingUtils.drawLandmarks(handLandmarks, {
      color: "#f2f4ef",
      fillColor: closure !== null && closure > 0.55 ? "#f5bd3d" : "#17b6a4",
      lineWidth: 1,
      radius: 3,
    });
  }

  if (closure !== null) {
    const width = canvas.width * 0.28;
    const height = Math.max(6, canvas.height * 0.012);
    const x = canvas.width * 0.04;
    const y = canvas.height * 0.08;
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = closure > 0.55 ? "#f5bd3d" : "#17b6a4";
    ctx.fillRect(x, y, width * closure, height);
  }
}

function ReelGesturePage() {
  const [clip, setClip] = useState<Clip | null>(null);
  const [videoSource, setVideoSource] = useState("");
  const [frameState, setFrameState] = useState<FrameState>("first");
  const [frameProgress, setFrameProgress] = useState(0);
  const [motionSpeed, setMotionSpeed] = useState(0);
  const [clipReady, setClipReady] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [gesture, setGesture] = useState<GestureName>("None");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrubRafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const pendingClosureRef = useRef<number | null>(null);
  const uploadBatchRef = useRef(0);
  const motionRef = useRef({
    progress: 0,
    lastProgress: 0,
    lastTime: 0,
    lastUiUpdate: 0,
  });

  const activeFramesReady = Boolean(clip?.framesReady);

  const drawClipFrame = useCallback((clipToDraw: Clip | null | undefined, progressValue: number) => {
    const canvas = stageCanvasRef.current;
    const frames = clipToDraw?.frames;
    if (!canvas || !frames?.length || !clipToDraw?.frameWidth || !clipToDraw.frameHeight) return;

    if (canvas.width !== clipToDraw.frameWidth || canvas.height !== clipToDraw.frameHeight) {
      canvas.width = clipToDraw.frameWidth;
      canvas.height = clipToDraw.frameHeight;
    }

    const context = canvas.getContext("2d", { alpha: false });
    const frameIndex = Math.round(clamp(progressValue) * (frames.length - 1));
    const frame = frames[frameIndex];
    if (!context || !frame) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }, []);

  const applyFrameProgress = useCallback((video: HTMLVideoElement, progressValue: number, now: number) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

    const progress = clamp(progressValue);
    const motion = motionRef.current;
    const elapsedSeconds = motion.lastTime ? Math.max((now - motion.lastTime) / 1000, 0.001) : 0.016;
    const targetTime = Math.max(0, video.duration - 0.045) * progress;
    const progressPercent = Math.round(progress * 100);
    const speed = Math.min(999, Math.abs(progress - motion.lastProgress) / elapsedSeconds);

    video.currentTime = targetTime;
    drawClipFrame(clipRef.current, progress);
    motion.progress = progress;
    motion.lastProgress = progress;
    motion.lastTime = now;

    if (now - motion.lastUiUpdate > 55 || progressPercent <= firstFrameThreshold || progressPercent >= endFrameThreshold) {
      motion.lastUiUpdate = now;
      setFrameProgress(progressPercent);
      setMotionSpeed(Math.round(speed * 100));
      setFrameState(
        progressPercent <= firstFrameThreshold
          ? "first"
          : progressPercent >= endFrameThreshold
            ? "end"
            : "moving",
      );
    }

    return true;
  }, [drawClipFrame]);

  const cancelFrameTransition = useCallback(() => {
    if (scrubRafRef.current) {
      window.cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = null;
    }
  }, []);

  const resetMotion = useCallback(() => {
    pendingClosureRef.current = null;
    motionRef.current.progress = 0;
    motionRef.current.lastProgress = 0;
    motionRef.current.lastTime = 0;
    setFrameProgress(0);
    setMotionSpeed(0);
    setFrameState("first");
  }, []);

  const resetActiveFrame = useCallback(() => {
    const current = videoRef.current;
    if (!current || !current.src) return;

    cancelFrameTransition();
    current.pause();
    if (Number.isFinite(current.duration) && current.duration > 0) current.currentTime = 0;
    drawClipFrame(clipRef.current, 0);
    resetMotion();
  }, [cancelFrameTransition, drawClipFrame, resetMotion]);

  const moveToEndFrame = useCallback(() => {
    const current = videoRef.current;
    if (!current || !current.src || !Number.isFinite(current.duration) || current.duration <= 0) {
      return;
    }

    cancelFrameTransition();
    current.pause();
    pendingClosureRef.current = 1;
    applyFrameProgress(current, 1, performance.now());
  }, [applyFrameProgress, cancelFrameTransition]);

  const syncFrameToHand = useCallback((closure: number | null, now: number) => {
    const current = videoRef.current;
    if (closure === null || !current || !current.src) {
      return;
    }

    if (!Number.isFinite(current.duration) || current.duration <= 0) {
      pendingClosureRef.current = closure;
      setClipReady(false);
      setFrameState("loading");
      if (current.readyState === HTMLMediaElement.HAVE_NOTHING) current.load();
      return;
    }

    if (!clipRef.current?.framesReady) {
      pendingClosureRef.current = closure;
      setClipReady(false);
      setFrameState("loading");
      return;
    }

    cancelFrameTransition();
    current.pause();

    const motion = motionRef.current;
    const delta = closure - motion.progress;
    const smoothing = Math.abs(delta) > 0.16 ? 0.72 : 0.48;
    const progress = clamp(motion.progress + delta * smoothing);
    pendingClosureRef.current = closure;
    setClipReady(true);
    applyFrameProgress(current, progress, now);
  }, [applyFrameProgress, cancelFrameTransition]);

  const processWebcamFrame = useCallback(() => {
    const webcam = webcamRef.current;
    const overlay = overlayRef.current;
    const recognizer = recognizerRef.current;

    if (webcam && overlay && recognizer && webcam.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (overlay.width !== webcam.videoWidth || overlay.height !== webcam.videoHeight) {
        overlay.width = webcam.videoWidth;
        overlay.height = webcam.videoHeight;
      }

      const now = performance.now();
      const result = recognizer.recognizeForVideo(webcam, now);
      const topGesture = readTopGesture(result);
      const recognizedGesture = topGesture.score >= confidenceThreshold ? topGesture.name : "None";
      const closure = handClosureFromLandmarks(result.landmarks[0], recognizedGesture, topGesture.score);
      drawHandOverlay(overlay, result.landmarks, recognizedGesture, closure);
      setGesture(recognizedGesture);
      syncFrameToHand(closure, now);
    }

    rafRef.current = window.requestAnimationFrame(processWebcamFrame);
  }, [syncFrameToHand]);

  const startCamera = useCallback(async () => {
    if (cameraState === "loading" || cameraState === "ready") return;

    setCameraState("loading");
    setCameraError("");

    try {
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "GPU",
        },
        numHands: 1,
        runningMode: "VIDEO",
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const webcam = webcamRef.current;
      if (!webcam) return;

      webcam.srcObject = stream;
      await webcam.play();
      setCameraState("ready");
      rafRef.current = window.requestAnimationFrame(processWebcamFrame);
    } catch (error) {
      setCameraState("error");
      setCameraError(error instanceof Error ? error.message : "Check webcam permission or model loading.");
    }
  }, [cameraState, processWebcamFrame]);

  const handleFiles = useCallback((files: FileList | null) => {
    const file = Array.from(files ?? []).find((nextFile) => nextFile.type.startsWith("video/"));
    if (!file) return;

    disposeClipFrames(clipRef.current);
    if (clipRef.current?.url) URL.revokeObjectURL(clipRef.current.url);

    const uploadBatch = uploadBatchRef.current + 1;
    uploadBatchRef.current = uploadBatch;
    const nextClip: Clip = {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      framesReady: false,
      metadataReady: false,
      name: file.name,
      url: URL.createObjectURL(file),
    };

    clipRef.current = nextClip;
    setClip(nextClip);
    setVideoSource(nextClip.url);
    setClipReady(false);
    resetMotion();
    setFrameState("loading");

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.src = nextClip.url;
      video.preload = "metadata";
      video.load();
    }

    preloadVideoMetadata(nextClip.url)
      .then((duration) => {
        if (uploadBatchRef.current !== uploadBatch) return;

        const metadataClip = { ...nextClip, duration, metadataReady: true, error: undefined };
        clipRef.current = metadataClip;
        setClip(metadataClip);

        return preloadVideoFrames(nextClip.url, duration).then((frameData) => {
          if (uploadBatchRef.current !== uploadBatch) {
            frameData.frames.forEach((frame) => frame.close());
            return;
          }

          disposeClipFrames(clipRef.current);
          const readyClip = { ...metadataClip, ...frameData, framesReady: true };
          clipRef.current = readyClip;
          setClip(readyClip);
          setClipReady(true);
          drawClipFrame(readyClip, pendingClosureRef.current ?? 0);
          setFrameState((currentState) => (currentState === "loading" ? "first" : currentState));
        });
      })
      .catch((error) => {
        if (uploadBatchRef.current !== uploadBatch) return;

        const errorClip = {
          ...nextClip,
          error: error instanceof Error ? error.message : "metadata error",
          framesReady: false,
          metadataReady: false,
        };
        clipRef.current = errorClip;
        setClip(errorClip);
        setClipReady(false);
        setFrameState("loading");
      });
  }, [drawClipFrame, resetMotion]);

  useEffect(() => {
    const current = videoRef.current;
    if (!current || !videoSource) return;

    if (current.src !== videoSource) {
      current.src = videoSource;
      current.loop = false;
      current.preload = "metadata";
      current.pause();
      current.load();
    }
  }, [videoSource]);

  const handleVideoMetadata = useCallback(() => {
    const current = videoRef.current;
    if (!current || !Number.isFinite(current.duration) || current.duration <= 0) return;

    if (clipRef.current?.framesReady) setClipReady(true);
    current.pause();
    applyFrameProgress(current, pendingClosureRef.current ?? motionRef.current.progress, performance.now());
  }, [applyFrameProgress]);

  useEffect(() => {
    if (!clip?.framesReady) return;
    drawClipFrame(clip, motionRef.current.progress);
  }, [clip, drawClipFrame]);

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      if (scrubRafRef.current) window.cancelAnimationFrame(scrubRafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recognizerRef.current?.close();
      disposeClipFrames(clipRef.current);
      if (clipRef.current?.url) URL.revokeObjectURL(clipRef.current.url);
    };
  }, []);

  const clipStatus = clip?.error
    ? "frame error"
    : clip?.framesReady
      ? `${formatDuration(clip.duration)} cached`
      : clip?.metadataReady
        ? `${formatDuration(clip.duration)} caching`
        : clip
          ? "loading"
          : "mp4, webm, mov";

  return (
    <main className="shell">
      <section className="workspace" aria-label="ReelGesture workspace">
        <aside className="control-panel">
          <a className="page-link" href="/">
            <Sparkles size={15} aria-hidden="true" />
            ASCII Lab
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

          <button className="upload-zone" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} aria-hidden="true" />
            <span>Upload Video</span>
            <small>{clipStatus}</small>
          </button>

          <div className="button-grid">
            <button className="primary" type="button" onClick={startCamera} disabled={cameraState === "loading"}>
              <Camera size={17} aria-hidden="true" />
              {cameraState === "ready" ? "Webcam Running" : "Start Webcam"}
            </button>
            <button type="button" onClick={resetActiveFrame} disabled={!clip}>
              <RotateCcw size={17} aria-hidden="true" />
              First Frame
            </button>
            <button type="button" onClick={moveToEndFrame} disabled={!clip || !activeFramesReady}>
              <Hand size={17} aria-hidden="true" />
              Jump To End
            </button>
          </div>

          <div className="gesture-panel" aria-live="polite">
            <div>
              <span>Gesture</span>
              <strong>{formatGesture(gesture)}</strong>
            </div>
            <div>
              <span>Grip</span>
              <strong>{frameProgress}%</strong>
            </div>
            <div>
              <span>Speed</span>
              <strong>{motionSpeed}%/s</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{clip && !clipReady ? "loading" : frameState}</strong>
            </div>
          </div>
          <div className="frame-meter" aria-label="Frame transition progress">
            <span style={{ width: `${frameProgress}%` }} />
          </div>

          <div className="clip-status" aria-label="Current clip">
            <FileVideo size={15} aria-hidden="true" />
            <span>
              <strong>{clip?.name ?? "No video uploaded."}</strong>
              <em>{clipStatus}</em>
            </span>
          </div>

          {cameraError ? <p className="camera-error">{cameraError}</p> : null}

          <div className="webcam-monitor control-webcam">
            <video ref={webcamRef} className="webcam-video" playsInline muted />
            <canvas ref={overlayRef} className="landmark-canvas" />
            <div className="monitor-label">
              <span>{cameraState === "ready" ? "Live Camera" : "Camera Offline"}</span>
              <strong>{frameState === "moving" ? "Synced motion" : formatGesture(gesture)}</strong>
            </div>
          </div>
        </aside>

        <section className="main-panel">
          <div className={frameState === "moving" ? "stage switching" : "stage"}>
            {clip ? (
              <>
                <canvas ref={stageCanvasRef} className={clip.framesReady ? "stage-canvas ready" : "stage-canvas"} />
                <video
                  ref={videoRef}
                  className="reel-video visible"
                  playsInline
                  muted
                  preload="metadata"
                  controls={false}
                  onLoadedMetadata={handleVideoMetadata}
                />
              </>
            ) : (
              <div className="stage-empty">
                <Hand size={30} aria-hidden="true" />
                <strong>Open Palm → End Frame</strong>
              </div>
            )}
            <div className="stage-hud">
              <span>{clip?.name ?? "No clip"}</span>
              <button type="button" onClick={resetActiveFrame} disabled={!clip || frameState === "first"}>
                <RotateCcw size={15} aria-hidden="true" />
              </button>
            </div>
            {clip ? (
              <div className="stage-progress" aria-hidden="true">
                <span style={{ width: `${frameProgress}%` }} />
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function App() {
  const pathname = window.location.pathname.replace(/\/$/, "");
  if (pathname === "/gesture") return <ReelGesturePage />;

  return <AsciiVideoPage />;
}
