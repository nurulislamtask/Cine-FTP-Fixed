# CineFTP — Vercel e Play Na Howar Fix

## Asol karon (code pore ja pawa gelo)

1. **Vercel e ffmpeg nai — etai prodhan karon.**
   FTP server gulor beshirbhag movie `.mkv` (HEVC/10-bit video, AC3/DTS audio).
   Browser সরাসরি MKV play korte pare na — server er ffmpeg diye MP4 e remux/transcode
   kore dite hoy (`/api/transcode`).
   AI Studio / local e ffmpeg thake, tai okhane play hoy.
   Vercel Serverless e ffmpeg nai, tai code nijei chupchap Range Proxy te fallback
   kore — mane kacha MKV file tai browser ke diye dey, jeta browser kokhonoi
   play korte parbe na. Tai play te click korle kichui hoy na / error dekhay.

2. **`/api/stream` proxy-r bug (Vercel e aro marattok).**
   Onek FTP/BDIX server Range request ignore kore puro file (2-4 GB) 200 diye
   pathiye dey. Purono code seta purotai Vercel function diye pipe korto —
   Vercel er duration/payload limit e stream majhpothe kete jay.
   AI Studio-r long-lived server e ei problem hoy na.

3. **Player vul fallback ghure somoy nosto korto** ar seshe "connection error"
   dekhay — asol karon (format support nai) user bujhtei parto na.

## Ja fix kora hoyeche (ei copy te)

- `api/index.ts` — Range ignore kora server theke asha 200 response ke ekhon
  requested chunk e slice kore sothik `206 + Content-Range` pathano hoy
  (test kore verify kora: 10 MB dummy file theke thik 2.5 MB chunk ase).
  Slow BDIX server er jonno upstream timeout 18s theke 30s kora hoyeche.
- `src/components/CinemaPlayer.tsx` — Player ekhon `/api/capabilities` diye
  check kore server e ffmpeg ache kina:
  - MKV/HEVC file + ffmpeg ache → soja `/api/transcode` diye play (agle 4 ta
    vua try ar hobe na).
  - Vercel e (ffmpeg nai) file cholbe na bujhle player ekhon sothik karon
    dekhabe + VLC/MX Player e kholar option samnei thakbe — vul "connection
    error" ar dekhabe na.
- `Dockerfile` (notun) — ffmpeg soho production image. Ei image diye deploy
  korlei sob file (MKV soho) browser e play hobe, thik AI Studio-r moto.

## Deploy — konta korbe?

### Option A (recommended): Docker diye deploy — SOB file play hobe
Ei copy ta Google Cloud Run e deploy koro (AI Studio app asole Cloud Run
er jonnoi design kora):

```
gcloud run deploy cine-ftp --source . --region asia-southeast1 \
  --allow-unauthenticated --memory 1Gi --timeout 3600
```

Athoba Render / Railway te "Docker" service hisebe ei repo ta connect
kore dilei hobe — Dockerfile auto-detect hobe.

Note: BDIX/IP-restricted server (DhakaFlix type private IP) cloud theke
kokhonoi pouchano jay na — segulor jonno app er vitorei deya Local Bridge
(bdix-bridge.bat nijer PC te chalu rakha) lagbe, seta ager motoi ache.

### Option B: Vercel ei thakte chao
Vercel e sudhu browser-native file-i play hobe: `.mp4` / `.webm`
(ftpbd-r `_reencoded.mp4` file gulo cholbe). `.mkv` Vercel e kono
vabei browser e play hobe na — karon convert korar ffmpeg tai nai.
Player ekhon ei khetre karon ta porishkar kore bole dibe.

## Verify
- `npm run build` ✓ pass
- `npx tsc --noEmit` ✓ pass
- Local server chaliye `/api/stream` range-slice test ✓ pass (206 verify kora)
