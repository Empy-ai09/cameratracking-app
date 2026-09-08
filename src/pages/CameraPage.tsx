import React, { useEffect, useRef, useState } from 'react';
import { IonPage, IonContent, IonButton, IonIcon, IonFab, IonFabButton } from '@ionic/react';
import { cameraOutline, reloadOutline, arrowBackOutline, arrowForwardOutline, cubeOutline, cameraReverseOutline } from 'ionicons/icons';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

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

  useEffect(() => {
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const hl = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/hand_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2
      });
      setLandmarker(hl);
      startCamera();
    }
    init();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.onloadeddata = () => {
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            render();
          }
        };
      }
    }
  };

  const drawHand = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    const canvas = canvasRef.current!;
    ctx.fillStyle = "#00FF00";
    landmarks.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Portal Effect on Index Finger (8)
    const indexFinger = landmarks[8];
    const px = indexFinger.x * canvas.width;
    const py = indexFinger.y * canvas.height;
    
    ctx.beginPath();
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 3;
    ctx.arc(px, py, 40, 0, 2 * Math.PI);
    ctx.stroke();

    if (mode === '3D') {
      // Simple mesh effect
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
    if (!videoRef.current || !canvasRef.current || !landmarker) return;
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

  const lastGestureTime = useRef(0);
  const [mode, setMode] = useState<'2D' | '3D'>('2D');

  const applyFilter = (ctx: CanvasRenderingContext2D, name: string) => {
    const canvas = canvasRef.current!;
    const w = canvas.width;
    const h = canvas.height;

    switch (name) {
      case 'dual-tone':
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'thermal':
        const thermalData = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < thermalData.data.length; i += 4) {
          const avg = (thermalData.data[i] + thermalData.data[i + 1] + thermalData.data[i + 2]) / 3;
          thermalData.data[i] = avg > 128 ? 255 : avg * 2;
          thermalData.data[i + 1] = 255 - avg;
          thermalData.data[i + 2] = 255 - avg > 128 ? 0 : 255;
        }
        ctx.putImageData(thermalData, 0, 0);
        break;
      case 'sketch':
        ctx.filter = 'grayscale(100%) contrast(500%) invert(100%)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        break;
      case 'pixelate':
        const size = 10;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w / size;
        tempCanvas.height = h / size;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, w, h);
        break;
      case 'glitch':
        for (let i = 0; i < 5; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const sliceW = Math.random() * w * 0.2;
          const sliceH = Math.random() * 20;
          ctx.drawImage(canvas, x, y, sliceW, sliceH, x + (Math.random() - 0.5) * 20, y, sliceW, sliceH);
        }
        break;
      case 'invert':
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'red-channel':
        const rData = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < rData.data.length; i += 4) {
          rData.data[i + 1] = 0;
          rData.data[i + 2] = 0;
        }
        ctx.putImageData(rData, 0, 0);
        break;
      case 'edge':
        ctx.filter = 'contrast(1000%) grayscale(100%) invert(100%)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        break;
      case 'blur':
        ctx.filter = 'blur(5px)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        break;
      case 'cartoon':
        ctx.filter = 'contrast(150%) saturate(200%)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        break;
      case 'rainbow-wave':
        ctx.globalCompositeOperation = 'hue';
        ctx.fillStyle = `hsl(${(Date.now() / 10) % 360}, 100%, 50%)`;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
    }
  };

  const checkGestures = (landmarks: any[], results: any) => {
    const now = Date.now();
    if (now - lastGestureTime.current < 1000) return;

    // Gesture Pinch: Thumb (4) + Pinky (20)
    const thumb = landmarks[4];
    const pinky = landmarks[20];
    const dist = Math.hypot(thumb.x - pinky.x, thumb.y - pinky.y);
    
    if (dist < 0.05) {
      setFilterIndex((prev) => (prev + 1) % FILTERS.length);
      lastGestureTime.current = now;
      return;
    }

    // Toggle 2D/3D: Both hands fist
    if (results.landmarks.length === 2) {
      const isFist = (l: any[]) => {
        const fingerTips = [8, 12, 16, 20];
        const wrist = l[0];
        return fingerTips.every(tip => Math.hypot(l[tip].x - wrist.x, l[tip].y - wrist.y) < 0.15);
      };
      if (isFist(results.landmarks[0]) && isFist(results.landmarks[1])) {
        setIs3DMode(prev => !prev);
        setMode(prev => prev === '2D' ? '3D' : '2D');
        lastGestureTime.current = now;
      }
    }
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
