# ReelGesture

브라우저에서 하나의 MP4/WebM/Mov 파일을 올리고 MediaPipe Gesture Recognizer로 손 제스처와 손 랜드마크를 감지하는 클라이언트 사이드 웹앱입니다. 영상은 일반 재생하지 않고 손가락 접힘 정도에 맞춰 프레임 위치만 이동합니다.

## 실행

```bash
npm install
npm run dev
```

개발 서버 기본 주소는 `http://localhost:5173/`입니다.

오디오 반응형 ASCII 프리뷰는 `http://localhost:5173/ascii`에서 실행합니다.

## 영상 제어

1. `영상 업로드`로 영상 하나를 선택합니다.
2. `웹캠 시작`을 눌러 카메라 권한을 허용합니다.
3. 영상은 첫 프레임에서 정지한 상태로 대기합니다.
4. 손바닥을 편 상태는 첫 프레임, 손을 움켜쥔 상태는 끝 프레임에 매핑됩니다.
5. 손을 빠르게 움켜쥐면 영상도 빠르게 이동하고, 천천히 움켜쥐면 같은 속도로 따라갑니다.

웹캠 프레임과 업로드한 영상은 서버로 전송하지 않습니다.

## ASCII 비디오 프리뷰

`/ascii` 라우트는 업로드한 영상을 상단 ASCII/도트 매트릭스 레이어와 하단 원본 영상으로 분할 합성합니다. 브라우저의 Web Audio API로 sub, bass, mid, presence, high, air, flux, beat 값을 분석해 배경 플래시, 점 밀도, 글리치 노이즈를 조절합니다. `Auto FX`가 켜져 있으면 Silver Dot, Thermal Bass, Matrix Rain, Edge Storm, Whiteout, Redline Beat 필터가 스펙트럼 상태에 따라 자동 전환되고, Kick/Bass/Snare/Hat/Lead/Pad 성향에 따라 줌, 흔들림, 스캔라인, strobe, RGB split 레이어가 실시간으로 변조됩니다. `Profile Routing`에서 각 프로필이 어떤 필터를 트리거할지 바꿀 수 있고, `React` 슬라이더로 전환 민감도와 필터 블렌딩 강도를, `Smooth` 슬라이더로 필터 전환 보간 정도를 조절합니다.

브라우저 내 녹화는 WebM으로 저장됩니다. MP4 export가 필요하면 FFmpeg 서버 렌더링 또는 ffmpeg.wasm 단계를 추가해야 합니다.
