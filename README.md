# RetroLens Android

Aplikasi Android portrait berbasis Ionic React + Capacitor untuk efek kamera retro dengan deteksi tangan real-time.

## Fitur
- Kamera depan real-time
- Deteksi maksimal 2 tangan dengan MediaPipe Tasks Vision Web
- Portal filter mengikuti ujung jari
- 11 filter: dual-tone, thermal, sketch, pixelate, glitch, invert, red-channel, edge, blur, cartoon, rainbow-wave
- Gesture pinch ibu jari + kelingking: ganti filter berikutnya
- Dua tangan mengepal: toggle mode 2D/3D (quad/bowtie vs mesh)
- Tombol UI: next/previous filter, toggle mode, screenshot
- Screenshot tersimpan/diunduh

## Pengembangan

```bash
cd RetroLens-Android
npm install
npm run dev
```

## Build web

```bash
npm run build
```

## Capacitor Android

```bash
npx cap add android
npm run sync
npm run build:android
```

Build APK debug membutuhkan Android SDK (ANDROID_HOME/ANDROID_SDK_ROOT) dan Gradle terpasang.

## Lint & Typecheck

```bash
npm run lint
npm run typecheck
```

## CI GitHub Actions
- Install dependencies
- Build web
- Sync Capacitor Android
- Build APK debug
- Upload artifak
- Publish APK ke GitHub Release saat tag `v*`
