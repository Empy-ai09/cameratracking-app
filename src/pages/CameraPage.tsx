import React, { useEffect, useRef, useState } from 'react';
import { IonPage, IonContent, IonButton, IonIcon } from '@ionic/react';
import { cameraOutline, arrowBackOutline, arrowForwardOutline, cubeOutline } from 'ionicons/icons';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Camera, CameraResultType } from '@capacitor/camera';

const TWO_PI = Math.PI * 2;
const GESTURE_COOLDOWN_MS = 900;
const PINCH_DISTANCE = 0.055;
const FIST_DISTANCE = 0.16;
const BACKEND = '2d' as const;

type Mode = '2D' | '3D';

type Landmark = { x: number; y: number };

type HandResult = {
  landmarks?: Landmark[][];
};

const drawPixels = (ctx: CanvasRenderingContext2D, w: number, h: number, fn: (r: number, g: number, b: number, a: number) => [number, number, number, number]) => {
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = fn(data[i], data[i + 1], data[i + 2], data[i + 3]);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
};

const FILTERS = [
  'none', 'dual-tone', 'thermal', 'sketch', 'pixelate', 'glitch', 'invert', 'red-channel', 'edge', 'blur', 'cartoon', 'rainbow-wave'
];

export const CameraPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [is3DMode, setIs3DMode] = useState(false);
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const requestRef = useRef<number>();
  const lastGestureTime = useRef(0);
  const fistState = useRef(false);
  const [mode, setMode] = useState<Mode>('2D');
  const [status, setStatus] = useState('Menyiapkan kamera...');
  const [cameraReady, setCameraReady] = useState(false);
  const [nativeCameraActive, setNativeCameraActive] = useState(false);
  const frameInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFrame = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    return () => {
      if (frameInterval.current) clearInterval(frameInterval.current);
    };
  }, []);

  const startNativeCamera = async () => {
    console.log('[CameraPage] startNativeCamera called');
    setNativeCameraActive(true);
    setStatus('Menggunakan kamera native (snapshot)');
    
    frameInterval.current = setInterval(async () => {
      try {
        const photo = await Camera.getPhoto({
          quality: 50,
          resultType: CameraResultType.DataUrl,
          allowEditing: false,
          saveToGallery: false,
          width: 1280,
          height: 720,
          correctOrientation: true
        });

        if (photo.dataUrl) {
          const img = new Image();
          img.src = photo.dataUrl;
          img.onload = () => {
            latestFrame.current = img;
            if (canvasRef.current) {
              canvasRef.current.width = img.width || 1280;
              canvasRef.current.height = img.height || 720;
              setCameraReady(true);
              setStatus('Kamera aktif');
              renderNative();
            }
          };
        }
      } catch (e) {
        console.error('[CameraPage] Native camera error', e);
        setStatus('Kamera native gagal');
        drawPlaceholder();
      }
    }, 2000);
  };

  const renderNative = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!latestFrame.current) {
      drawPlaceholder();
      return;
    }

    const img = latestFrame.current;
    ctx.save();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    applyFilter(ctx, FILTERS[filterIndex]);

    if (landmarker) {
      try {
        const results = landmarker.detect(img);
        if (results.landmarks) {
          for (const landmarks of results.landmarks) {
            drawHand(ctx, landmarks);
            checkGestures(landmarks, results);
          }
        }
      } catch (e) {
        console.error('[CameraPage] Native detect error', e);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '18px sans-serif';
      ctx.fillText('Kamera aktif, deteksi tangan dimuat nanti', 20, 40);
    }
  };

  useEffect(() => {
    drawPlaceholder();
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const hl = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "hand_landmarker.task", delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2
        });
        setLandmarker(hl);
      } catch (e) {
        console.error("Failed to load hand landmarker", e);
        setStatus('MediaPipe gagal dimuat');
      }
      await startCamera();
    }
    init();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  const startCamera = async () => {
    console.log('[CameraPage] startCamera called');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.log('[CameraPage] navigator.mediaDevices.getUserMedia not available');
        setStatus('Browser tidak mendukung kamera');
        // fallback to native camera capture
        await startNativeCamera();
        return;
      }
      console.log('[CameraPage] Requesting camera access');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      console.log('[CameraPage] Camera stream obtained');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        videoRef.current.onloadeddata = () => {
          console.log('[CameraPage] Video loaded data');
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth || 640;
            canvasRef.current.height = videoRef.current.videoHeight || 480;
            setCameraReady(true);
            setStatus('Kamera aktif');
            if (!landmarker) {
              drawPlaceholder();
            } else {
              render();
            }
          }
        };
        videoRef.current.onerror = (e) => {
          console.error('[CameraPage] Video error', e);
          setStatus('Video error');
          // fallback to native camera
          startNativeCamera();
        };
      }
    } catch (err) {
      console.error('[CameraPage] Camera access error:', err);
      setStatus('Izin kamera ditolak / gagal');
      // fallback to native camera
      startNativeCamera();
    }
  };

  const drawPlaceholder = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('Camera belum aktif', 20, 40);
    ctx.fillText(status, 20, 72);
  };

  const drawHand = (ctx: CanvasRenderingContext2D, landmarks: Landmark[]) => {
    const canvas = canvasRef.current!;
    ctx.fillStyle = "#00FF00";
    landmarks.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    const indexFinger = landmarks[8];
    const px = indexFinger.x * canvas.width;
    const py = indexFinger.y * canvas.height;
    ctx.strokeStyle = 'cyan';
    ctx.lineWidth = 3;
    if (mode === '2D') {
      ctx.beginPath();
      ctx.moveTo(px, py - 42);
      ctx.lineTo(px + 42, py);
      ctx.lineTo(px, py + 42);
      ctx.lineTo(px - 42, py);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 42, py - 42);
      ctx.lineTo(px + 42, py + 42);
      ctx.moveTo(px + 42, py - 42);
      ctx.lineTo(px - 42, py + 42);
      ctx.stroke();
    }

    if (mode === '3D') {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i < landmarks.length; i++) {
        for (let j = i + 1; j < landmarks.length; j++) {
          const d = Math.hypot(landmarks[i].x - landmarks[j].x, landmarks[i].y - landmarks[j].y);
          if (d < 0.1) {
            ctx.moveTo(landmarks[i].x * canvas.width, landmarks[i].y * canvas.height);
            ctx.lineTo(landmarks[j].x * canvas.width, landmarks[j].y * canvas.height);
          }
        }
      }
      ctx.stroke();
    }
  };

  const render = () => {
    if (!videoRef.current || !canvasRef.current || !landmarker) {
      drawPlaceholder();
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const startTimeMs = performance.now();
    const results = landmarker.detectForVideo(videoRef.current, startTimeMs);

    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvasRef.current.width, 0);
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.restore();

    applyFilter(ctx, FILTERS[filterIndex]);

    if (results.landmarks) {
      for (const landmarks of results.landmarks) {
        drawHand(ctx, landmarks);
        checkGestures(landmarks, results);
      }
    }

    requestRef.current = requestAnimationFrame(render);
  };

  const applyFilter = (ctx: CanvasRenderingContext2D, name: string) => {
    const canvas = canvasRef.current!;
    const { width: w, height: h } = canvas;
    if (name === 'none') return;

    if (name === 'dual-tone') drawPixels(ctx, w, h, (r, g, b, a) => {
      const l = (r + g + b) / 765;
      return l > 0.5 ? [255, 191, 0, a] : [19, 65, 160, a];
    });
    if (name === 'thermal') drawPixels(ctx, w, h, (r, g, b, a) => {
      const l = (r + g + b) / 765;
      const red = Math.min(255, l * 510);
      const green = Math.min(255, Math.max(0, (l - 0.25) * 510));
      const blue = Math.min(255, Math.max(0, (0.5 - l) * 510));
      return [red, green, blue, a];
    });
    if (name === 'sketch' || name === 'edge') {
      const source = ctx.getImageData(0, 0, w, h);
      const output = ctx.createImageData(w, h);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const lum = (offset: number) => (source.data[i + offset] + source.data[i + offset + 1] + source.data[i + offset + 2]) / 3;
        const gx = lum(4) - lum(-4);
        const gy = lum(w * 4) - lum(-w * 4);
        const value = name === 'sketch' ? 255 - Math.min(255, Math.hypot(gx, gy) * 1.8) : Math.min(255, Math.hypot(gx, gy) * 2.5);
        output.data[i] = value;
        output.data[i + 1] = value;
        output.data[i + 2] = value;
        output.data[i + 3] = 255;
      }
      ctx.putImageData(output, 0, 0);
    }
    if (name === 'pixelate') {
      const size = 12;
      const small = document.createElement('canvas');
      small.width = Math.ceil(w / size);
      small.height = Math.ceil(h / size);
      small.getContext(BACKEND)!.drawImage(canvas, 0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, w, h);
      ctx.restore();
    }
    if (name === 'glitch') {
      for (let i = 0; i < 9; i++) {
        const y = Math.random() * h;
        const slice = 4 + Math.random() * 20;
        ctx.drawImage(canvas, 0, y, w, slice, (Math.random() - 0.5) * 42, y, w, slice);
      }
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255, 0, 80, 0.14)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (name === 'invert') drawPixels(ctx, w, h, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a]);
    if (name === 'red-channel') drawPixels(ctx, w, h, (r, _g, _b, a) => [r, 0, 0, a]);
    if (name === 'blur') {
      const copy = document.createElement('canvas');
      copy.width = w;
      copy.height = h;
      copy.getContext(BACKEND)!.drawImage(canvas, 0, 0);
      ctx.save();
      ctx.filter = 'blur(6px)';
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
    }
    if (name === 'cartoon') drawPixels(ctx, w, h, (r, g, b, a) => [
      Math.round(r / 64) * 64,
      Math.round(g / 64) * 64,
      Math.round(b / 64) * 64,
      a
    ]);
    if (name === 'rainbow-wave') {
      const copy = document.createElement('canvas');
      copy.width = w;
      copy.height = h;
      copy.getContext(BACKEND)!.drawImage(canvas, 0, 0);
      const t = performance.now() / 450;
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        const shift = Math.sin(y / 32 + t) * 12;
        ctx.drawImage(copy, 0, y, w, 4, shift, y, w, 4);
      }
      ctx.globalCompositeOperation = 'hue';
      ctx.fillStyle = `hsl(${(t * 50) % 360} 100% 55%)`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  const isFist = (landmarks: Landmark[]) => [8, 12, 16, 20].every((tip) => {
    const wrist = landmarks[0];
    return Math.hypot(landmarks[tip].x - wrist.x, landmarks[tip].y - wrist.y) < FIST_DISTANCE;
  });

  const checkGestures = (landmarks: Landmark[], results: HandResult) => {
    const now = performance.now();
    if (now - lastGestureTime.current < GESTURE_COOLDOWN_MS) return;
    const pinch = Math.hypot(landmarks[4].x - landmarks[20].x, landmarks[4].y - landmarks[20].y) < PINCH_DISTANCE;
    if (pinch) {
      setFilterIndex((current) => (current + 1) % FILTERS.length);
      lastGestureTime.current = now;
      return;
    }
    const hands = results.landmarks ?? [];
    const bothFists = hands.length === 2 && hands.every(isFist);
    if (bothFists && !fistState.current) {
      setMode((current) => {
        const next = current === '2D' ? '3D' : '2D';
        setIs3DMode(next === '3D');
        return next;
      });
      lastGestureTime.current = now;
    }
    fistState.current = bothFists;
  };

  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `retrolens-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <IonPage>
      <IonContent>
        <div id="camera-container">
          <video ref={videoRef} id="video" playsInline muted style={{ display: 'none' }}></video>
          <canvas ref={canvasRef} id="canvas"></canvas>
          <div className="status-badge">{status}</div>
          <div className="ui-buttons">
            <IonButton onClick={() => setFilterIndex((prev) => (prev - 1 + FILTERS.length) % FILTERS.length)}>
              <IonIcon icon={arrowBackOutline} />
            </IonButton>
            <IonButton onClick={() => {
              const newMode = mode === '2D' ? '3D' : '2D';
              setMode(newMode);
              setIs3DMode(newMode === '3D');
            }}>
              <IonIcon icon={cubeOutline} />
            </IonButton>
            <IonButton onClick={() => setFilterIndex((prev) => (prev + 1) % FILTERS.length)}>
              <IonIcon icon={arrowForwardOutline} />
            </IonButton>
            <IonButton onClick={takeScreenshot}>
              <IonIcon icon={cameraOutline} />
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};
