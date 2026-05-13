# ascii-fx-lab

audio-reactive ASCII/VJ visual lab for uploaded video clips.

## 배포 주소

- Production: [https://fx.n2f.site](https://fx.n2f.site)
- Vercel fallback: [https://ascii-fx-lab.vercel.app](https://ascii-fx-lab.vercel.app)
- GitHub: [https://github.com/lux-02/ascii-fx-lab](https://github.com/lux-02/ascii-fx-lab)

## 프로젝트 개요

`ascii-fx-lab`은 사용자가 업로드한 영상을 ASCII, 도트 매트릭스, 매트릭스 레인, 엣지 라인, 글리치 계열 비주얼로 변환하는 브라우저 기반 실험 도구입니다. 단순히 고정 필터를 씌우는 방식이 아니라, 영상의 오디오를 Web Audio API로 분석해 주파수 대역과 비트 변화에 따라 필터, 밀도, 색, 노이즈, 반전 효과가 실시간으로 반응하도록 구성했습니다.

작업 방향은 TouchDesigner나 Resolume Arena에서 VJ가 오디오 입력에 맞춰 비주얼 필터를 전환하는 흐름에 가깝습니다. 업로드한 클립을 재생하면 화면 오른쪽에는 생성된 ASCII 캔버스와 원본 영상이 함께 표시되고, 사용자는 `Split` 또는 `Overlay` 모드로 결과를 비교하거나 합성할 수 있습니다.

모든 영상 처리는 브라우저 안에서 이루어집니다. 업로드한 영상과 오디오 분석 데이터는 서버로 전송하지 않습니다.

## 주요 기능

### Audio Reactive FX

오디오 스펙트럼을 `Sub`, `Bass`, `Mid`, `Presence`, `High`, `Air`, `Flux`, `Beat` 값으로 나누어 분석합니다. `Auto FX`가 켜져 있으면 현재 강하게 반응하는 대역에 따라 필터가 자동으로 선택됩니다.

`Frequency Routing` 패널에서는 각 주파수 대역이 어떤 필터를 호출할지 직접 지정할 수 있습니다. 라우팅에 연결되지 않은 프리셋이 임의로 선택되지 않도록, 자동 전환은 사용자가 매핑한 필터 안에서만 동작합니다.

### Filter Presets

현재 프리셋은 다음 흐름을 기준으로 설계되어 있습니다.

- `Silver Dot`: 기본 도트 매트릭스 실루엣
- `Thermal Bass`: 저역 반응에 강한 컬러/열감 계열
- `Matrix Rain`: 세로 흐름과 문자 기반 매트릭스 질감
- `Edge Storm`: 윤곽선과 엣지 중심의 반응형 라인
- `Whiteout`: 밝은 배경과 하이톤 반전 질감
- `Redline Beat`: 비트에 맞춰 강하게 반응하는 레드 계열 프리셋

각 프리셋은 `Positive`, `Negative`, `Beat` 상태를 별도로 설정할 수 있습니다. `Auto FX`가 켜져 있어도 해당 프리셋에 지정된 극성 설정이 유지되며, `Beat`를 선택한 필터는 비트 감지에 맞춰 양각/음각 전환이 일어납니다.

### Visual Controls

실시간 프리뷰를 보면서 다음 값을 조절할 수 있습니다.

- `React`: 오디오 반응 강도
- `Layer`: 생성 캔버스 레이어의 존재감
- `Source`: 원본 영상의 노출 정도
- `Smooth`: 필터 전환 보간값
- `Density`: ASCII/도트 밀도
- `Pixel`: 픽셀 또는 문자 셀 크기
- `Glyph`: `Auto`, `Dot`, `ASCII`, `Block`, `Binary`, `Edge` 문자 모드

빠른 음악에서 과도하게 깜빡이지 않도록 전환에는 smoothing 값을 두었고, 화면 전체가 흔들리거나 스케일이 급격하게 바뀌는 효과는 제거했습니다. 오디오 반응은 유지하되 VJ 퍼포먼스에서 보기 편한 방향으로 필터 변화가 이어지도록 조정했습니다.

### Split / Overlay View

`Split` 모드는 상단에 생성된 ASCII 캔버스, 하단에 원본 영상을 배치합니다. 각 영역을 클릭하면 해당 영상만 전체 화면처럼 크게 볼 수 있습니다.

`Overlay` 모드는 원본 영상 위에 생성 캔버스를 얹고 screen/additive 계열로 블렌딩합니다. 이 모드에서는 ASCII 레이어가 더 강하게 보이도록 `Layer`와 `Source` 값을 조절해 원본 영상과 생성 비주얼 사이의 균형을 맞출 수 있습니다.

## 라우트

- `/`: ASCII FX Lab 메인 화면
- `/ascii`: 메인 화면과 동일한 ASCII FX Lab 화면
- `/gesture`: 기존 MediaPipe 기반 Gesture Scrub 화면

Vercel 배포에서는 `vercel.json`의 SPA rewrite 설정을 통해 직접 URL로 접근해도 같은 앱이 정상적으로 로드됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

기본 개발 서버는 `http://localhost:5173/`에서 실행됩니다.

프로덕션 빌드는 다음 명령으로 확인할 수 있습니다.

```bash
npm run build
```

## 기술 스택

- React
- TypeScript
- Vite
- Web Audio API
- Canvas 2D
- MediaPipe Tasks Vision
- Vercel

## Gesture Scrub

`/gesture` 라우트에는 초기 버전의 MediaPipe Gesture Recognizer 기반 영상 스크러버가 남아 있습니다.

1. `Upload Video`로 영상을 선택합니다.
2. `Start Webcam`을 눌러 카메라 권한을 허용합니다.
3. 영상은 자동 재생되지 않고 첫 프레임에서 대기합니다.
4. 손을 펼치면 앞 프레임, 손을 쥐면 뒤 프레임으로 이동합니다.
5. 손을 빠르게 쥘수록 영상도 더 빠르게 스크럽됩니다.

이 기능 역시 웹캠 프레임과 업로드한 영상을 서버로 보내지 않습니다.
