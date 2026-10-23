import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Settings,
  X,
  SkipForward,
  SkipBack,
  Check,
  Upload,
  ListVideo,
  PictureInPicture2,
  Globe,
  RotateCcw,
  RotateCw,
  Zap,
  ExternalLink,
  Copy,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Download,
  Film,
} from 'lucide-react';
import { ParsedFtpItem, convertSrtToVtt, resolvePublicBdixGatewayUrl, isPrivateOrBdixUrl } from '../utils/ftpParser';
import {
  probeVideoStreams,
  ProbedAudioTrack,
  ProbedSubtitleTrack,
  SeasonFolderInfo,
  resolvePlayableFromFolder,
  getCachedPlayableUrl,
  saveCachedPlayableUrl,
  isVercelHost,
  checkLocalBridge,
} from '../services/ftpClient';

interface CinemaPlayerProps {
  video: ParsedFtpItem;
  playlist: ParsedFtpItem[];
  subtitles: ParsedFtpItem[];
  seasons?: SeasonFolderInfo[];
  initialStartTime?: number;
  onSelectSeason?: (season: SeasonFolderInfo) => void;
  onClose: () => void;
  onSelectVideo: (item: ParsedFtpItem) => void;
  onProgressUpdate?: (currentTime: number, duration: number) => void;
}

type AspectMode = 'contain' | 'cover' | 'fill' | '21:9';

function parseRuntimeToSeconds(runtime?: string): number {
  if (!runtime) return 0;
  const clean = runtime.trim().toLowerCase();

  // Match "2h 21m", "2h", "1h 45m", "2 hr 21 min", "2 hrs"
  const hMatch = clean.match(/(\d+)\s*(?:h|hr|hours?)/);
  const mMatch = clean.match(/(\d+)\s*(?:m|min|minutes?)/);
  if (hMatch || mMatch) {
    const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
    const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
    return hours * 3600 + minutes * 60;
  }

  // Match "120 min", "120 mins", or plain numbers
  const minOnly = clean.match(/^(\d+)\s*(?:min|mins|minutes)?$/);
  if (minOnly) {
    const val = parseInt(minOnly[1], 10);
    if (val > 0) return val * 60;
  }

  return 0;
}

export const CinemaPlayer: React.FC<CinemaPlayerProps> = ({
  video,
  playlist,
  subtitles,
  seasons,
  initialStartTime = 0,
  onSelectSeason,
  onClose,
  onSelectVideo,
  onProgressUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hideControlsTimer = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const appliedInitialStartRef = useRef<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(initialStartTime || 0);
  const [duration, setDuration] = useState(0);
  const [probedDuration, setProbedDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  // Stream URL & Fallback state
  const [overrideVideoUrl, setOverrideVideoUrl] = useState<string | null>(null);
  const [streamFallbackStep, setStreamFallbackStep] = useState(0);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
  const [probedAudioTracks, setProbedAudioTracks] = useState<ProbedAudioTrack[]>([]);
  const [probedSubTracks, setProbedSubTracks] = useState<ProbedSubtitleTrack[]>([]);

  // Volume state
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Audio Volume Booster (GainNode & Dialogue Compressor for optional extra amplification)
  const [audioBoostLevel, setAudioBoostLevel] = useState<number>(1.0);
  const [isBoostEnabled, setIsBoostEnabled] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const ensureAudioNodes = useCallback(() => {
    // Only engage Web Audio API if boost is explicitly turned on and greater than 100%
    if (!isBoostEnabled || audioBoostLevel <= 1.0) return;
    const v = videoRef.current;
    if (!v) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!gainNodeRef.current) {
        const gainNode = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();

        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, ctx.currentTime);
        compressor.release.setValueAtTime(0.2, ctx.currentTime);

        const currentMultiplier = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNode.gain.setValueAtTime(currentMultiplier, ctx.currentTime);

        if (!audioSourceRef.current) {
          try {
            audioSourceRef.current = ctx.createMediaElementSource(v);
          } catch {}
        }

        if (audioSourceRef.current) {
          try {
            audioSourceRef.current.disconnect();
          } catch {}
          audioSourceRef.current.connect(compressor);
          compressor.connect(gainNode);
          gainNode.connect(ctx.destination);
        }

        gainNodeRef.current = gainNode;
        compressorRef.current = compressor;
      } else {
        const currentMultiplier = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNodeRef.current.gain.setValueAtTime(currentMultiplier, ctx.currentTime);
      }
    } catch (err) {
      console.warn('Audio booster init:', err);
    }
  }, [audioBoostLevel, isBoostEnabled]);

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      try {
        const mult = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNodeRef.current.gain.setValueAtTime(mult, audioCtxRef.current.currentTime);
      } catch {}
    }
  }, [audioBoostLevel, isBoostEnabled]);

  // Subtitles state
  const [activeSubId, setActiveSubId] = useState<string>('off');
  const [subOffset, setSubOffset] = useState(0);
  const [subFontSize, setSubFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [customSubs, setCustomSubs] = useState<
    { id: string; label: string; rawText: string }[]
  >([]);
  const [activeVttUrl, setActiveVttUrl] = useState<string | null>(null);

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [aspectMode, setAspectMode] = useState<AspectMode>('contain');
  const [activeMenu, setActiveMenu] = useState<
    null | 'audio' | 'subtitles' | 'settings' | 'playlist'
  >(null);
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);
  const [streamLoadFailed, setStreamLoadFailed] = useState(false);
  // Whether the backend can transcode/remux with ffmpeg (true locally and in
  // AI Studio / Cloud Run, FALSE on Vercel serverless where no ffmpeg exists).
  const [serverCanTranscode, setServerCanTranscode] = useState<boolean | null>(null);
  const [serverIsVercel, setServerIsVercel] = useState(false);
  // Local PC bridge (the bdix-bridge .bat running on the viewer's own PC at
  // 127.0.0.1:7788). It is the designed BDIX gateway for hosted deployments:
  // the viewer's PC can reach private BDIX servers (172.16.50.7 etc.) that
  // neither Vercel nor the browser page may contact directly.
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  // Manual override: the health probe can be blocked by the browser's
  // local-network permission even while the bridge is running fine. The
  // "Use PC Bridge" button forces the bridge route without the probe.
  const [forceBridge, setForceBridge] = useState(false);
  const bridgeOn = bridgeAvailable || forceBridge;
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const ok = await checkLocalBridge();
      if (!cancelled) setBridgeAvailable(ok);
    };
    probe();
    const iv = window.setInterval(probe, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);
  // When the bridge comes up mid-session, jump straight to the bridge route.
  useEffect(() => {
    if (bridgeAvailable) {
      setStreamFallbackStep(0);
      setStreamLoadFailed(false);
    }
  }, [bridgeAvailable]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/capabilities')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) {
          setServerCanTranscode(Boolean(d.ffmpegAvailable));
          setServerIsVercel(Boolean(d.isVercel));
        }
      })
      .catch(() => {
        if (!cancelled) setServerCanTranscode(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isResolvingFolder, setIsResolvingFolder] = useState(false);
  const [folderResolutionError, setFolderResolutionError] = useState<string | null>(null);

  // Auto-resolve playable file with instant persistent cache lookup
  useEffect(() => {
    const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
    if (cached) {
      setOverrideVideoUrl(cached);
      setIsResolvingFolder(false);
      return;
    }

    const isFolder =
      video.isDirectory ||
      video.url.endsWith('/') ||
      !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(video.url);

    if (!isFolder) {
      setIsResolvingFolder(false);
      return;
    }

    let cancelled = false;
    setIsResolvingFolder(true);
    setFolderResolutionError(null);

    resolvePlayableFromFolder(video)
      .then((playable) => {
        if (cancelled) return;
        setIsResolvingFolder(false);
        if (playable && playable.primaryVideo && playable.primaryVideo.url) {
          saveCachedPlayableUrl(video.id, playable.primaryVideo.url);
          saveCachedPlayableUrl(video.url, playable.primaryVideo.url);
          setOverrideVideoUrl(playable.primaryVideo.url);
          setStreamFallbackStep(0);
          setIsBuffering(true);
        } else {
          setFolderResolutionError('Scanning folder for playable stream...');
          setIsBuffering(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsResolvingFolder(false);
        setIsBuffering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [video.id, video.url, video.isDirectory]);

  const rawVideoUrl = overrideVideoUrl || video.url;

  // When loaded on an HTTPS website (like Vercel), upgrade known public HTTP mirrors to HTTPS
  // and resolve private BDIX IPs (172.16.x) to their public HTTPS mirrors
  const safePlayableUrl = useMemo(() => {
    let u = rawVideoUrl;
    if (u.startsWith('http://server') && u.includes('.ftpbd.net')) {
      u = u.replace(/^http:\/\//i, 'https://');
    }
    // If it's a private BDIX IP or DhakaFlix server, resolve to public HTTPS gateway
    if (/^(http:\/\/)?(172\.(1[6-9]|2\d|3[0-1])\.|10\.|192\.168\.)/i.test(u) || u.includes('dhakaflix') || u.includes('discoveryftp')) {
      const publicGw = resolvePublicBdixGatewayUrl(u);
      if (publicGw && publicGw !== 'PORTAL_ROOT') {
        u = publicGw;
      }
    }
    return u;
  }, [rawVideoUrl]);

  const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isDirectHttps = safePlayableUrl.startsWith('https://');
  const isVercel = isVercelHost() || serverIsVercel;

  const alternateMirrorUrl = useMemo(() => {
    if (safePlayableUrl.includes('server2.ftpbd.net')) {
      return safePlayableUrl.replace('server2.ftpbd.net', 'server3.ftpbd.net');
    }
    if (safePlayableUrl.includes('server3.ftpbd.net')) {
      return safePlayableUrl.replace('server3.ftpbd.net', 'server2.ftpbd.net');
    }
    if (safePlayableUrl.includes('server4.ftpbd.net')) {
      return safePlayableUrl.replace('server4.ftpbd.net', 'server2.ftpbd.net');
    }
    return null;
  }, [safePlayableUrl]);

  const isTargetFolder =
    video.isDirectory ||
    rawVideoUrl.endsWith('/') ||
    !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(rawVideoUrl);

  // Browsers can only play MP4/WebM (H.264/AAC) natively. MKV/AVI/TS files —
  // most FTP releases — need the ffmpeg remuxer. On Vercel there is NO ffmpeg,
  // so /api/transcode silently degrades to the raw proxy and can never play.
  const isBrowserNativeFile = useMemo(() => {
    const clean = safePlayableUrl.split('?')[0].toLowerCase();
    if (/\.(mkv|avi|ts|m2ts|flv|wmv|mpg|mpeg|ogv|3gp)(%20)?$/.test(clean)) return false;
    if (/(hevc|x265|h\.?265|10\s?-?bit)/.test(clean)) return false;
    return /\.(mp4|m4v|webm|mov)$/.test(clean);
  }, [safePlayableUrl]);

  // Stream URL served by the viewer's own PC bridge, when it is running.
  // For private BDIX sources the bridge must fetch the ORIGINAL private URL
  // (e.g. http://172.16.50.7/...) — not the public ftpbd gateway rewrite,
  // which is exactly the route that times out.
  const bridgeTargetUrl = isPrivateOrBdixUrl(rawVideoUrl) ? rawVideoUrl : safePlayableUrl;
  const bridgeStreamUrl = useMemo(() => {
    if (!bridgeOn) return null;
    if (!isBrowserNativeFile) {
      return `http://127.0.0.1:7788/transcode?url=${encodeURIComponent(bridgeTargetUrl)}&audioTrack=${selectedAudioTrack}`;
    }
    return `http://127.0.0.1:7788/stream?url=${encodeURIComponent(bridgeTargetUrl)}`;
  }, [bridgeOn, bridgeTargetUrl, isBrowserNativeFile, selectedAudioTrack]);

  const streamUrl = useMemo(() => {
    if (isResolvingFolder || (isTargetFolder && !overrideVideoUrl)) {
      return '';
    }

    // Non-native file + a backend WITH ffmpeg (AI Studio / local / Cloud Run):
    // go straight to the remuxer instead of burning 4 doomed fallback attempts.
    if (!isBrowserNativeFile && serverCanTranscode && streamFallbackStep === 0) {
      return `/api/transcode?url=${encodeURIComponent(safePlayableUrl)}&audioTrack=${selectedAudioTrack}`;
    }

    const isHttpOnHttps = isHttpsOrigin && safePlayableUrl.startsWith('http://') && !safePlayableUrl.startsWith('https://');

    // VERCEL MODE — the server-side routes cannot work here: Vercel's
    // datacenter IPs cannot reach BDIX/FTP servers at all (connect ETIMEDOUT)
    // and there is no ffmpeg for transcoding. The ONLY route that can play is
    // the viewer's own connection straight to the source (the viewer is in
    // Bangladesh, the source is a BDIX server). So on Vercel: try direct,
    // then the direct mirror, then ONE proxy attempt (still useful for
    // non-BDIX public hosts), then retry direct — and never burn the working
    // direct route on a 4-second timer (see the watchdog below).
    if (isVercel) {
      // BEST ROUTE — the viewer's own PC bridge: it fetches from the BDIX
      // server over the viewer's connection (the only connection that can
      // reach 172.16.50.7 & friends) and re-streams to this page over
      // loopback. Non-native files go through the bridge's ffmpeg remuxer.
      if (bridgeStreamUrl) {
        if (streamFallbackStep === 0) {
          return bridgeStreamUrl;
        }
        if (streamFallbackStep === 1) {
          return isHttpOnHttps
            ? `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`
            : safePlayableUrl;
        }
        if (streamFallbackStep === 2) {
          if (alternateMirrorUrl && alternateMirrorUrl.startsWith('https://')) {
            return alternateMirrorUrl;
          }
          return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
        }
        if (streamFallbackStep === 3) {
          return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
        }
        return safePlayableUrl;
      }
      if (isHttpOnHttps) {
        return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
      }
      if (streamFallbackStep === 0) {
        return safePlayableUrl;
      }
      if (streamFallbackStep === 1) {
        if (alternateMirrorUrl && alternateMirrorUrl.startsWith('https://')) {
          return alternateMirrorUrl;
        }
        return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
      }
      if (streamFallbackStep === 2) {
        return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
      }
      return safePlayableUrl;
    }

    // Step 0: Direct stream (fastest native route)
    if (streamFallbackStep === 0 && !isHttpOnHttps) {
      return safePlayableUrl;
    }

    // Step 1: High-Speed Range Proxy for primary server
    if (streamFallbackStep === 1 || isHttpOnHttps) {
      return `/api/stream?url=${encodeURIComponent(safePlayableUrl)}`;
    }

    // Step 2: Alternate Mirror Direct (if available)
    if (streamFallbackStep === 2 && alternateMirrorUrl) {
      if (!isHttpsOrigin || alternateMirrorUrl.startsWith('https://')) {
        return alternateMirrorUrl;
      }
      return `/api/stream?url=${encodeURIComponent(alternateMirrorUrl)}`;
    }

    // Step 3: Alternate Mirror Proxy
    if (streamFallbackStep === 3 && alternateMirrorUrl) {
      return `/api/stream?url=${encodeURIComponent(alternateMirrorUrl)}`;
    }

    // Step 4: Transcode / Remux stream
    return `/api/transcode?url=${encodeURIComponent(safePlayableUrl)}&audioTrack=${selectedAudioTrack}`;
  }, [safePlayableUrl, alternateMirrorUrl, streamFallbackStep, isResolvingFolder, isTargetFolder, overrideVideoUrl, isHttpsOrigin, selectedAudioTrack, isBrowserNativeFile, serverCanTranscode, isVercel, bridgeStreamUrl]);

  const fallbackAttemptsRef = useRef(0);

  // Toggle between direct stream, proxy route, and mirror smoothly
  const advanceStreamFallback = useCallback(() => {
    setStreamFallbackStep((prev) => {
      const maxSteps = isVercel ? (bridgeStreamUrl ? 4 : 3) : alternateMirrorUrl ? 4 : 2;
      return (prev + 1) % (maxSteps + 1);
    });
    setIsBuffering(true);
  }, [alternateMirrorUrl, isVercel, bridgeStreamUrl]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Failover watchdog: if the current route hangs with readyState === 0,
  // auto-advance to the next route. On Vercel the direct routes are the only
  // ones that can work and BDIX servers often need 10-20s to deliver the
  // first bytes of a large file — a 4s cutoff killed working streams and
  // threw the viewer onto the dead proxy route — so Vercel waits 20s and
  // also watches the direct-mirror step. Other hosts keep the fast 4s cut.
  useEffect(() => {
    if (!isPlaying && !isBuffering) return;
    if (streamLoadFailed || !streamUrl) return;

    const stallMs = isVercel ? 20000 : 4000;
    const onWatchedStep = isVercel
      ? streamFallbackStep <= (bridgeStreamUrl ? 2 : 1)
      : streamFallbackStep === 0;

    const timer = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState === 0 && isBuffering && onWatchedStep) {
        console.warn('Stream connection slow/unreachable, advancing to next route...');
        advanceStreamFallback();
        showToast(
          isVercel ? 'Trying another route...' : 'Connecting via high-speed stream proxy...'
        );
      }
    }, stallMs);

    return () => window.clearTimeout(timer);
  }, [streamUrl, streamFallbackStep, isBuffering, isPlaying, streamLoadFailed, advanceStreamFallback, showToast, isVercel, bridgeStreamUrl]);


  // Autoplay handler with audio policy fallback
  useEffect(() => {
    if (!streamUrl) return;
    const v = videoRef.current;
    if (!v) return;

    const playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch((err) => {
          if (err.name === 'NotAllowedError') {
            v.muted = true;
            setIsMuted(true);
            v.play().catch(() => {});
          }
        });
    }
  }, [streamUrl]);

  // Reset state on video change
  useEffect(() => {
    if (appliedInitialStartRef.current === video.id) {
      // Video hasn't changed; avoid resetting player state on re-renders
      return;
    }
    appliedInitialStartRef.current = video.id;
    fallbackAttemptsRef.current = 0;

    const startSec = initialStartTime > 5 ? Math.floor(initialStartTime) : 0;

    setCurrentTime(startSec);
    setScrubTime(startSec);
    setBufferedEnd(0);
    setDuration(0);
    setProbedDuration(0);
    setSelectedAudioTrack(0);
    setOverrideVideoUrl(null);
    setStreamFallbackStep(0);
    setStreamLoadFailed(false);
    setIsBuffering(true);

    if (subtitles.length > 0) {
      setActiveSubId(`ext-${subtitles[0].id}`);
    } else {
      setActiveSubId('off');
    }

    let cancelled = false;
    probeVideoStreams(video.url).then((info) => {
      if (cancelled) return;
      if (info) {
        if (info.duration > 0) setProbedDuration(info.duration);
        setProbedAudioTracks(info.audioTracks || []);
        setProbedSubTracks(info.subtitleTracks || []);
      } else {
        setProbedAudioTracks([
          {
            audioIndex: 0,
            streamIndex: 1,
            codec: 'aac',
            language: /hindi/i.test(video.rawName) ? 'hin' : 'eng',
            label: /hindi/i.test(video.rawName) ? 'Hindi' : 'English',
            channels: 2,
            isBrowserNative: true,
          },
        ]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [video.id, video.url, video.rawName, initialStartTime]);

  // Active subtitle WebVTT URL
  useEffect(() => {
    if (activeSubId === 'off') {
      setActiveVttUrl(null);
      return;
    }

    const activeSourceUrl = overrideVideoUrl || video.url;
    if (activeSubId.startsWith('ext-')) {
      const subId = activeSubId.slice(4);
      const subItem = subtitles.find((s) => s.id === subId);
      if (subItem) {
        setActiveVttUrl(
          `/api/subtitle?url=${encodeURIComponent(subItem.url)}&offset=${subOffset}`
        );
      }
    } else if (activeSubId.startsWith('emb-')) {
      const subIndex = parseInt(activeSubId.slice(4), 10) || 0;
      setActiveVttUrl(
        `/api/embedded-subtitle?url=${encodeURIComponent(activeSourceUrl)}&subIndex=${subIndex}&start=0`
      );
    } else if (activeSubId.startsWith('custom-')) {
      const custom = customSubs.find((c) => c.id === activeSubId);
      if (custom) {
        const vtt = convertSrtToVtt(custom.rawText, subOffset);
        const blob = new Blob([vtt], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        setActiveVttUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [activeSubId, subOffset, subtitles, video.url, overrideVideoUrl, customSubs]);

  const runtimeSeconds = useMemo(() => parseRuntimeToSeconds(video.runtime), [video.runtime]);
  const effectiveDuration = Math.max(duration, probedDuration, runtimeSeconds, 0);
  const displayedTime = isScrubbing ? scrubTime : currentTime;

  // Auto-hide controls after 3.5 seconds of inactivity while playing
  const scheduleAutoHide = useCallback(() => {
    if (hideControlsTimer.current) {
      window.clearTimeout(hideControlsTimer.current);
    }
    setShowControls(true);
    hideControlsTimer.current = window.setTimeout(() => {
      if (isPlaying && !activeMenu && !isScrubbing) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, activeMenu, isScrubbing]);

  useEffect(() => {
    scheduleAutoHide();
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    };
  }, [scheduleAutoHide]);

  const togglePlay = useCallback(() => {
    ensureAudioNodes();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioNodes]);

  const handleSeek = useCallback(
    (targetSec: number) => {
      const clamped = Math.max(0, Math.min(targetSec, effectiveDuration || targetSec));
      setCurrentTime(clamped);
      setScrubTime(clamped);
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
    },
    [effectiveDuration]
  );

  const skipRelative = useCallback(
    (delta: number) => {
      const target = Math.max(0, currentTime + delta);
      handleSeek(target);
      setSeekRipple(delta > 0 ? 'right' : 'left');
      window.setTimeout(() => setSeekRipple(null), 550);
    },
    [currentTime, handleSeek]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {}
  };

  const handleSelectAudioTrack = (trackIndex: number) => {
    const chosenTrack = probedAudioTracks.find((t) => t.audioIndex === trackIndex);
    const savedTime = currentTime;

    if (chosenTrack?.companionUrl) {
      setSelectedAudioTrack(trackIndex);
      setOverrideVideoUrl(chosenTrack.companionUrl);
      setStreamFallbackStep(0);
      setIsBuffering(true);
      window.setTimeout(() => {
        if (videoRef.current && savedTime > 0) {
          try {
            videoRef.current.currentTime = savedTime;
          } catch {}
        }
      }, 350);
      setActiveMenu(null);
      return;
    }

    setOverrideVideoUrl(null);
    setSelectedAudioTrack(trackIndex);

    const v = videoRef.current as any;
    if (v && v.audioTracks && v.audioTracks.length > trackIndex) {
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = i === trackIndex;
      }
    }
    setActiveMenu(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        e.preventDefault();
        skipRelative(10);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        skipRelative(-10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.min(1, Number((v + 0.1).toFixed(2)));
          if (videoRef.current) videoRef.current.volume = next;
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.max(0, Number((v - 0.1).toFixed(2)));
          if (videoRef.current) videoRef.current.volume = next;
          return next;
        });
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMuted((m) => !m);
      } else if (e.key === 'Escape') {
        if (activeMenu) setActiveMenu(null);
        else if (!document.fullscreenElement) onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, skipRelative, toggleFullscreen, activeMenu, onClose]);

  const handleUploadSubtitleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const newId = `custom-${Date.now()}`;
      setCustomSubs((prev) => [...prev, { id: newId, label: file.name, rawText: text }]);
      setActiveSubId(newId);
    };
    reader.readAsText(file);
  };

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || sec < 0) return '0:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const currentIdx = playlist.findIndex((p) => p.id === video.id);
  const prevVideo = currentIdx > 0 ? playlist[currentIdx - 1] : null;
  const nextVideo =
    currentIdx >= 0 && currentIdx < playlist.length - 1 ? playlist[currentIdx + 1] : null;

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (displayedTime / effectiveDuration) * 100) : 0;
  const bufferedPercent =
    effectiveDuration > 0 ? Math.min(100, (bufferedEnd / effectiveDuration) * 100) : 0;

  const subFontSizePx =
    subFontSize === 'sm'
      ? '1.05rem'
      : subFontSize === 'md'
      ? '1.35rem'
      : subFontSize === 'lg'
      ? '1.75rem'
      : '2.15rem';

  const currentAudioLabel =
    probedAudioTracks.find((t) => t.audioIndex === selectedAudioTrack)?.label ||
    probedAudioTracks[0]?.label ||
    'Audio';

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeMenu) {
      setActiveMenu(null);
      return;
    }

    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const delta = now - lastTapRef.current.time;

    // Double tap to skip 10s left or right
    if (delta < 280 && Math.abs(relX - lastTapRef.current.x) < 0.25) {
      lastTapRef.current = { time: 0, x: 0 };
      if (relX < 0.35) {
        skipRelative(-10);
      } else if (relX > 0.65) {
        skipRelative(10);
      } else {
        toggleFullscreen();
      }
      return;
    }

    lastTapRef.current = { time: now, x: relX };
    setShowControls((prev) => {
      const next = !prev;
      if (next) scheduleAutoHide();
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleAutoHide}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden"
    >
      <style>{`
        video::cue {
          background-color: rgba(0, 0, 0, 0.78);
          color: #ffffff;
          font-size: ${subFontSizePx};
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          line-height: 1.4;
          text-shadow: 0 2px 4px rgba(0,0,0,0.95);
        }
      `}</style>

      {/* Hidden File Input for Custom .SRT/.VTT Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={handleUploadSubtitleFile}
      />

      {/* Main Video Surface */}
      <div
        className="relative flex-1 w-full h-full flex items-center justify-center bg-black cursor-pointer"
        onClick={handleSurfaceClick}
      >
        <video
          ref={videoRef}
          key={video.id}
          src={streamUrl || undefined}
          preload="auto"
          autoPlay
          playsInline
          muted={isMuted}
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            ensureAudioNodes();
          }}
          onPlaying={() => setIsBuffering(false)}
          onLoadedData={() => setIsBuffering(false)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackSpeed;
              videoRef.current.volume = volume;
              if (currentTime > 2 && Math.abs(videoRef.current.currentTime - currentTime) > 3) {
                try {
                  videoRef.current.currentTime = currentTime;
                } catch {}
              }
            }
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && isFinite(d) && d > 0) {
              setDuration(d);
            }
            if (initialStartTime > 5 && e.currentTarget.currentTime < 2) {
              try {
                e.currentTarget.currentTime = initialStartTime;
              } catch {}
            }
          }}
          onProgress={(e) => {
            const v = e.currentTarget;
            if (v.buffered && v.buffered.length > 0) {
              setBufferedEnd(v.buffered.end(v.buffered.length - 1));
            }
          }}
          onTimeUpdate={(e) => {
            if (isScrubbing) return;
            const t = e.currentTarget.currentTime;
            setCurrentTime(t);
            setScrubTime(t);
            if (onProgressUpdate && t > 3) {
              onProgressUpdate(t, Math.max(duration, probedDuration, 0));
            }
          }}
          onEnded={() => {
            if (nextVideo) {
              onSelectVideo(nextVideo);
            }
          }}
          onError={() => {
            const maxAttempts = isVercel ? (bridgeStreamUrl ? 4 : 3) : alternateMirrorUrl ? 4 : 3;
            if (fallbackAttemptsRef.current < maxAttempts) {
              fallbackAttemptsRef.current += 1;
              const cur = videoRef.current?.currentTime || currentTime;
              advanceStreamFallback();
              setStreamLoadFailed(false);
              const nextStep = (streamFallbackStep + 1) % (maxAttempts + 1);
              const stepName = isVercel
                ? nextStep === 1
                  ? 'Trying backup mirror stream...'
                  : nextStep === 2
                  ? 'Switching to Stream Proxy...'
                  : 'Retrying direct stream...'
                : nextStep === 1
                  ? 'Switching to Stream Proxy...'
                  : nextStep === 2
                  ? 'Trying backup mirror stream...'
                  : nextStep === 3
                  ? 'Trying backup proxy stream...'
                  : 'Retrying stream connection...';
              showToast(stepName);
              window.setTimeout(() => {
                if (videoRef.current && cur > 0) {
                  try {
                    videoRef.current.currentTime = cur;
                  } catch {}
                }
              }, 300);
            } else {
              setIsBuffering(false);
              setStreamLoadFailed(true);
            }
          }}
          className={`w-full h-full transition-all duration-200 pointer-events-none ${
            aspectMode === 'cover'
              ? 'object-cover'
              : aspectMode === 'fill'
              ? 'object-fill'
              : aspectMode === '21:9'
              ? 'object-cover aspect-[21/9]'
              : 'object-contain'
          }`}
        >
          {activeVttUrl && (
            <track
              key={activeVttUrl}
              kind="subtitles"
              src={activeVttUrl}
              srcLang="en"
              label="Subtitles"
              default
            />
          )}
        </video>

        {/* Double-tap Skip Visual Feedback */}
        {seekRipple === 'left' && (
          <div className="absolute left-8 sm:left-16 top-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-2 text-white font-semibold pointer-events-none shadow-2xl">
            <RotateCcw className="w-5 h-5 text-[#E50914]" />
            <span>-10s</span>
          </div>
        )}
        {seekRipple === 'right' && (
          <div className="absolute right-8 sm:right-16 top-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-2 text-white font-semibold pointer-events-none shadow-2xl">
            <span>+10s</span>
            <RotateCw className="w-5 h-5 text-[#E50914]" />
          </div>
        )}

        {/* Folder Resolving Indicator */}
        {isResolvingFolder && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 z-20">
            <div className="w-12 h-12 border-3 border-[#E50914] border-t-transparent rounded-full animate-spin shadow-lg" />
            <span className="text-xs font-semibold text-white/90 bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 select-none shadow">
              Resolving media stream...
            </span>
          </div>
        )}

        {/* Clean Buffering Spinner */}
        {isBuffering && !isResolvingFolder && streamUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 z-20">
            <div className="w-12 h-12 border-3 border-[#E5A00D] border-t-transparent rounded-full animate-spin shadow-lg" />
            <span className="text-xs font-semibold text-white/90 bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 select-none shadow">
              {streamFallbackStep === 0
                ? bridgeStreamUrl
                  ? 'Connecting via your PC bridge...'
                  : 'Connecting direct stream...'
                : streamFallbackStep === 1
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Connecting direct stream...'
                    : 'Connecting backup mirror...'
                  : 'Loading proxy stream...'
                : streamFallbackStep === 2
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Connecting backup mirror...'
                    : 'Loading proxy stream...'
                  : 'Connecting backup mirror...'
                : streamFallbackStep === 3
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Loading proxy stream...'
                    : 'Retrying direct stream...'
                  : 'Loading backup proxy...'
                : isVercel && bridgeStreamUrl
                ? 'Retrying direct stream...'
                : 'Remuxing video stream...'}
            </span>
          </div>
        )}

        {/* Stream Load Failed Overlay */}
        {streamLoadFailed && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="max-w-md w-full bg-[#10141F] border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Playback Connection Error
                </h3>
                <p className="text-xs text-zinc-300 max-w-sm mx-auto leading-relaxed">
                  {!isBrowserNativeFile && serverCanTranscode === false
                    ? 'This file is MKV/HEVC — web browsers cannot play it directly, and Vercel has no ffmpeg to convert it. It plays in AI Studio because that server has ffmpeg. Host the app on Cloud Run / a VPS (see the included Dockerfile), or open this file in VLC / MX Player.'
                    : 'The upstream FTP / BDIX server is slow or not directly routable on your current ISP connection.'}
                </p>
                {isVercel && !bridgeOn && (
                  <p className="text-[11px] text-amber-300/90 max-w-sm mx-auto leading-relaxed">
                    Tip: BDIX servers (172.16.50.7 etc.) only answer PCs on a BDIX
                    connection. Start the free PC Bridge — Settings → “Download
                    Bridge .bat” (needs Node.js) — and keep its window open. This
                    player then streams through your own PC automatically.
                  </p>
                )}
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-zinc-400">
                  <span>Movie Length:</span>
                  <span className="text-white font-mono font-semibold">
                    {effectiveDuration > 0 ? formatTime(effectiveDuration) : video.runtime || '2 Hours'}
                  </span>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => {
                    setStreamLoadFailed(false);
                    fallbackAttemptsRef.current = 0;
                    advanceStreamFallback();
                    setIsBuffering(true);
                    window.setTimeout(() => {
                      if (videoRef.current) {
                        videoRef.current.load();
                        videoRef.current.play().catch(() => {});
                      }
                    }, 50);
                  }}
                  className="w-full bg-[#E50914] hover:bg-[#f6121d] text-white font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] cursor-pointer shadow-lg shadow-red-500/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    {streamFallbackStep === 0
                      ? 'Switch to High-Speed Proxy Route'
                      : streamFallbackStep === 1 && alternateMirrorUrl
                      ? 'Switch to Backup Mirror Server'
                      : 'Retry Stream Connection'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      const urlToCopy = safePlayableUrl;
                      navigator.clipboard?.writeText(urlToCopy);
                      showToast('Direct stream link copied to clipboard!');
                    }}
                    className="py-2 px-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Stream Link</span>
                  </button>

                  <a
                    href={safePlayableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2 px-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors text-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in VLC</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Big Clean Play Button Overlay when paused */}
        {!isPlaying && !isBuffering && !isResolvingFolder && streamUrl && !streamLoadFailed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl transition-transform hover:scale-105">
              <Play className="w-8 h-8 fill-white text-white translate-x-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#161B26] border border-amber-500/40 text-amber-300 text-xs font-semibold px-4 py-2 rounded-full shadow-2xl backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* Top HUD Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-4 sm:px-8 py-4 flex items-center justify-between transition-opacity duration-200 z-30 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Back to Catalog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-lg font-display font-bold text-white truncate">
              {video.cleanTitle}
              {video.season !== undefined && video.episode !== undefined && (
                <span className="ml-2 text-xs font-mono text-[#E50914] font-semibold">
                  S{String(video.season).padStart(2, '0')}E{String(video.episode).padStart(2, '0')}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-zinc-300 truncate">
              {video.year && <span>{video.year}</span>}
              {video.quality && (
                <>
                  <span>·</span>
                  <span>{video.quality}</span>
                </>
              )}
              {currentAudioLabel && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400 font-medium">{currentAudioLabel}</span>
                </>
              )}
              {video.runtime && (
                <>
                  <span>·</span>
                  <span className="text-amber-300 font-mono font-medium">{video.runtime}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Top Stream Controls & Playlist Drawer */}
        <div className="flex items-center gap-2 shrink-0">
          {/* PC Bridge toggle (Vercel): stream through the bridge app running
              on the viewer's own PC — the only route that reaches BDIX
              private servers like 172.16.50.7 */}
          {isVercel && (
            <button
              onClick={() => {
                setForceBridge((f) => !f);
                setStreamFallbackStep(0);
                setStreamLoadFailed(false);
                setIsBuffering(true);
                showToast(
                  !bridgeOn
                    ? 'PC Bridge route on — streaming via your PC...'
                    : 'PC Bridge route off'
                );
              }}
              className={`px-2.5 py-1.5 rounded-lg text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                bridgeOn
                  ? 'bg-emerald-600/80 hover:bg-emerald-600'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
              title="Stream through the CineFTP bridge running on your PC (127.0.0.1:7788)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{bridgeOn ? 'Bridge On' : 'Use PC Bridge'}</span>
            </button>
          )}

          {/* Stream Route Switcher */}
          <button
            onClick={advanceStreamFallback}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Toggle Direct, Proxy or Mirror stream route"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">
              {streamFallbackStep === 0
                ? bridgeStreamUrl
                  ? 'PC Bridge'
                  : 'Direct Route'
                : streamFallbackStep === 1
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Direct Route'
                    : 'Mirror Direct'
                  : 'Proxy Route'
                : streamFallbackStep === 2
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Mirror Direct'
                    : 'Proxy Route'
                  : 'Mirror Direct'
                : streamFallbackStep === 3
                ? isVercel
                  ? bridgeStreamUrl
                    ? 'Proxy Route'
                    : 'Direct Retry'
                  : 'Mirror Proxy'
                : isVercel && bridgeStreamUrl
                ? 'Direct Retry'
                : 'Remux Route'}
            </span>
          </button>

          {/* Copy Stream Link */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(safePlayableUrl);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 2000);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy playable stream URL"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-300" />
            <span className="hidden sm:inline">{copiedUrl ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Right Episodes Drawer Button (if playlist has multiple episodes or seasons exist) */}
          {(playlist.length > 1 || (seasons && seasons.length > 0)) && (
            <button
              onClick={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeMenu === 'playlist'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <ListVideo className="w-4 h-4" />
              <span>
                {seasons && seasons.length > 0 ? 'Episodes' : `(${playlist.length})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Popover Menus (Audio Language, Subtitles, Settings, Playlist) */}
      {activeMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-24 right-4 sm:right-8 w-[calc(100vw-2rem)] sm:w-80 max-h-[65vh] overflow-y-auto bg-[#11131C]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-4 shadow-2xl z-40 space-y-3"
        >
          {/* AUDIO LANGUAGE MENU */}
          {activeMenu === 'audio' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Audio Language</h3>
                </div>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                {probedAudioTracks.map((track) => {
                  const isSelected = selectedAudioTrack === track.audioIndex;
                  return (
                    <button
                      key={track.audioIndex}
                      onClick={() => handleSelectAudioTrack(track.audioIndex)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{track.label}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUBTITLES MENU */}
          {activeMenu === 'subtitles' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Subtitles className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Subtitles & Captions</h3>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer border border-amber-500/30 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload .SRT / .VTT
                </button>
              </div>

              {/* Subtitle Tracks List */}
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                <button
                  onClick={() => {
                    setActiveSubId('off');
                    setActiveMenu(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    activeSubId === 'off'
                      ? 'bg-[#E50914] text-white font-semibold'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                  }`}
                >
                  <span>Off</span>
                  {activeSubId === 'off' && <Check className="w-4 h-4" />}
                </button>

                {subtitles.map((sub) => {
                  const id = `ext-${sub.id}`;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveSubId(id);
                        setActiveMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                        activeSubId === id
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{sub.rawName}</span>
                      {activeSubId === id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}

                {probedSubTracks.map((sub) => {
                  const id = `emb-${sub.subIndex}`;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveSubId(id);
                        setActiveMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                        activeSubId === id
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{sub.label}</span>
                      {activeSubId === id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}

                {customSubs.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setActiveSubId(sub.id);
                      setActiveMenu(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      activeSubId === sub.id
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{sub.label}</span>
                    {activeSubId === sub.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}

                {subtitles.length === 0 && probedSubTracks.length === 0 && customSubs.length === 0 && (
                  <p className="text-[11px] text-zinc-400 p-2 text-center bg-white/5 rounded-lg">
                    No online subtitles found. Click "Upload .SRT" to add your own subtitle file!
                  </p>
                )}
              </div>

              {/* Subtitle Timing Sync (Delay Offset) */}
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Subtitle Sync / Delay</span>
                  <span className="font-mono text-amber-400">
                    {subOffset > 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-mono">
                  <button
                    onClick={() => setSubOffset((o) => Number((o - 1).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    -1.0s
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o - 0.5).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => setSubOffset(0)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-400 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o + 0.5).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    +0.5s
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o + 1).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    +1.0s
                  </button>
                </div>
              </div>

              {/* Font Size Selector */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Subtitle Size</span>
                <div className="flex items-center gap-1">
                  {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setSubFontSize(sz)}
                      className={`px-2.5 py-1 rounded-lg uppercase font-mono text-[11px] cursor-pointer transition-colors ${
                        subFontSize === sz
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS MENU (Speed & Screen Fit) */}
          {activeMenu === 'settings' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Player Settings</h3>
                </div>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Playback Speed */}
              <div className="space-y-1.5">
                <p className="text-xs text-zinc-400">Playback Speed</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        if (videoRef.current) videoRef.current.playbackRate = spd;
                      }}
                      className={`py-1.5 rounded-lg text-xs font-mono cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen Fit */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <p className="text-xs text-zinc-400">Screen Fit</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'contain', label: 'Original Fit' },
                      { id: 'cover', label: 'Zoom Fill' },
                      { id: '21:9', label: '21:9 Cinema' },
                      { id: 'fill', label: 'Stretch Full' },
                    ] as const
                  ).map((asp) => (
                    <button
                      key={asp.id}
                      onClick={() => setAspectMode(asp.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        aspectMode === asp.id
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      {asp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EPISODE / SEASON PLAYLIST MENU */}
          {activeMenu === 'playlist' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="text-sm font-semibold text-white">
                  {seasons && seasons.length > 0
                    ? `Seasons & Episodes (${playlist.length})`
                    : `Episodes (${playlist.length})`}
                </h3>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {seasons && seasons.length > 0 && onSelectSeason && (
                <div className="space-y-1.5 pb-2 border-b border-white/10">
                  <p className="text-[11px] font-mono text-zinc-400">Select Season:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {seasons.map((s) => {
                      const isCurrentSeason = video.season === s.seasonNumber;
                      return (
                        <button
                          key={s.id}
                          onClick={() => onSelectSeason(s)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isCurrentSeason
                              ? 'bg-[#E50914] text-white'
                              : 'bg-white/10 hover:bg-white/15 text-zinc-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {playlist.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectVideo(item);
                      setActiveMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer ${
                      item.id === video.id
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">
                      {item.episode !== undefined
                        ? `Ep ${item.episode} — ${item.cleanTitle}`
                        : `${idx + 1}. ${item.cleanTitle}`}
                    </span>
                    <span className="font-mono text-[11px] opacity-75 shrink-0">
                      {item.sizeFormatted}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Transport Controls HUD */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 sm:px-8 pt-10 pb-4 sm:pb-5 transition-opacity duration-200 z-30 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Timeline */}
        <div className="mb-3.5 flex items-center gap-3">
          <span className="text-xs font-mono text-white font-medium w-12 sm:w-14 text-right shrink-0">
            {formatTime(displayedTime)}
          </span>

          <div className="relative flex-1 flex items-center h-5 group">
            {/* Track Background */}
            <div className="w-full h-1.5 group-hover:h-2 bg-white/20 rounded-full overflow-hidden transition-all">
              {/* Buffered Bar */}
              <div
                className="h-full bg-white/35 transition-all duration-200"
                style={{ width: `${bufferedPercent}%` }}
              />
            </div>

            {/* Active Red Progress Bar */}
            <div
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-1.5 group-hover:h-2 bg-[#E50914] rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Thumb Indicator */}
            <div
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#E50914] shadow-[0_0_10px_rgba(229,9,20,0.9)] ring-2 ring-white transition-transform group-hover:scale-125"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Range Input */}
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              step={0.5}
              value={displayedTime}
              onMouseDown={() => setIsScrubbing(true)}
              onTouchStart={() => setIsScrubbing(true)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setIsScrubbing(true);
                setScrubTime(val);
              }}
              onMouseUp={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                handleSeek(val);
              }}
              onTouchEnd={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                handleSeek(val);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
            />
          </div>

          <span className="text-xs font-mono text-zinc-300 min-w-12 sm:min-w-16 shrink-0 font-medium text-left">
            {effectiveDuration > 0
              ? formatTime(effectiveDuration)
              : video.runtime || '--:--'}
          </span>
        </div>

        {/* Control Buttons Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Transport Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-[#E50914] hover:bg-[#f6121d] text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>

            <button
              onClick={() => skipRelative(-10)}
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden xs:inline">10s</span>
            </button>

            <button
              onClick={() => skipRelative(10)}
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
              title="Forward 10s"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden xs:inline">10s</span>
            </button>

            {prevVideo && (
              <button
                onClick={() => onSelectVideo(prevVideo)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer hidden md:flex"
                title={`Previous: ${prevVideo.cleanTitle}`}
              >
                <SkipBack className="w-5 h-5" />
              </button>
            )}

            {nextVideo && (
              <button
                onClick={() => onSelectVideo(nextVideo)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer hidden sm:flex items-center gap-1 text-xs font-medium"
                title={`Next Episode: ${nextVideo.cleanTitle}`}
              >
                <SkipForward className="w-5 h-5" />
                <span className="hidden lg:inline">Next</span>
              </button>
            )}

            {/* Volume Control & Sound Booster */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-0.5">
              <button
                onClick={() => setIsMuted((m) => !m)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer"
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (videoRef.current) videoRef.current.volume = val;
                }}
                className="hidden md:block w-16 lg:w-20 accent-[#E50914] cursor-pointer"
              />

              {/* Volume Booster (300% Clear Dialogue & Sound Boost) */}
              <button
                onClick={() => {
                  ensureAudioNodes();
                  // Cycle 1.0 (Normal 100%) -> 1.5 (150%) -> 2.0 (200%) -> 3.0 (300% Super Boost)
                  const levels = [1.0, 1.5, 2.0, 3.0];
                  const currentIndex = levels.indexOf(audioBoostLevel);
                  const nextLevel = levels[(currentIndex + 1) % levels.length] || 1.5;
                  setAudioBoostLevel(nextLevel);
                  setIsBoostEnabled(true);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border select-none ${
                  audioBoostLevel > 1.0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                }`}
                title="Sound Booster: Boost quiet audio & dialogue up to 300% with vocal compressor"
              >
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span>{Math.round(audioBoostLevel * 100)}%</span>
              </button>
            </div>
          </div>

          {/* Right Controls: Audio / Subtitles / Settings / PiP / Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Audio Language Button (only shown if multiple tracks detected) */}
            {probedAudioTracks.length > 1 && (
              <button
                onClick={() => setActiveMenu(activeMenu === 'audio' ? null : 'audio')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeMenu === 'audio'
                    ? 'bg-[#E50914] text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="Change Audio Language"
              >
                <Globe className="w-4 h-4 text-[#E50914] shrink-0" />
                <span className="max-w-[95px] sm:max-w-[140px] truncate">
                  {currentAudioLabel}
                </span>
              </button>
            )}

            {/* Subtitles Button (Always visible so users can upload .SRT/.VTT, sync offset, or pick subs) */}
            <button
              onClick={() => setActiveMenu(activeMenu === 'subtitles' ? null : 'subtitles')}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeMenu === 'subtitles' || activeSubId !== 'off'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Subtitles & Captions"
            >
              <Subtitles className="w-4 h-4" />
              <span className="hidden sm:inline">Subtitles</span>
              {activeSubId !== 'off' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5"></span>
              )}
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setActiveMenu(activeMenu === 'settings' ? null : 'settings')}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                activeMenu === 'settings'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Speed & Screen Fit"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Picture-in-Picture */}
            <button
              onClick={togglePiP}
              className="hidden sm:flex p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
