import {
  DirectoryBrowseResult,
  ParsedFtpItem,
  parseDirectoryHtml,
  isPrivateOrBdixUrl,
  extractSeasonNumber,
  isSeasonFolderName,
} from '../utils/ftpParser';
import { INITIAL_UNIFIED_CATALOG } from '../utils/seedData';

const LOCAL_BRIDGE_BASE = 'http://127.0.0.1:7788';
const META_STORAGE_KEY = 'cineftp_meta_cache_v1';

export interface EnrichedMetadata {
  found: boolean;
  posterUrl?: string;
  backdropUrl?: string;
  imdbId?: string;
  imdbRating?: string;
  year?: number;
  cast?: string;
  director?: string;
  tagline?: string;
  genres?: string[];
  plot?: string;
  runtime?: string;
}

export interface ProbedAudioTrack {
  audioIndex: number;
  streamIndex: number;
  codec: string;
  language: string;
  label: string;
  channels: number;
  isBrowserNative: boolean;
  companionUrl?: string;
}

export interface ProbedSubtitleTrack {
  subIndex: number;
  streamIndex: number;
  codec: string;
  language: string;
  label: string;
}

export interface MediaProbeInfo {
  duration: number;
  video: {
    codec: string;
    profile?: string;
    pixFmt?: string;
    width: number;
    height: number;
    needsVideoTranscode?: boolean;
  } | null;
  audioTracks: ProbedAudioTrack[];
  subtitleTracks: ProbedSubtitleTrack[];
  ffmpegAvailable?: boolean;
}

export interface SeasonFolderInfo {
  id: string;
  seasonNumber: number;
  label: string;
  qualityLabel?: string;
  url: string;
  episodes?: ParsedFtpItem[];
  subtitles?: ParsedFtpItem[];
}

export interface SeriesInspectionResult {
  seriesItem: ParsedFtpItem;
  seasons: SeasonFolderInfo[];
  initialEpisodes: ParsedFtpItem[];
  initialSubtitles: ParsedFtpItem[];
}

const localMetaCache: Map<string, EnrichedMetadata> = new Map();
try {
  const raw = localStorage.getItem(META_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      localMetaCache.set(k, v as EnrichedMetadata);
    }
  }
} catch {}

function saveMetaCache() {
  try {
    if (localMetaCache.size > 600) {
      const keys = Array.from(localMetaCache.keys()).slice(0, 150);
      keys.forEach((k) => localMetaCache.delete(k));
    }
    const obj: Record<string, EnrichedMetadata> = {};
    localMetaCache.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

let isLocalBridgeAvailable = false;

export async function checkLocalBridge(): Promise<boolean> {
  // Try both loopback spellings — some browsers treat them differently for
  // local-network access permissions.
  for (const base of [LOCAL_BRIDGE_BASE, 'http://localhost:7788']) {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        isLocalBridgeAvailable = true;
        return true;
      }
    } catch {}
  }
  isLocalBridgeAvailable = false;
  return false;
}

export function getLocalBridgeStatus(): boolean {
  return isLocalBridgeAvailable;
}

export function normalizeFtpUrl(input: string): string {
  let clean = input.trim();
  if (!clean) return '';
  if (!/^(https?|ftp):\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  try {
    const u = new URL(clean);
    if (u.pathname === '') u.pathname = '/';
    return u.href;
  } catch {
    return clean;
  }
}

const sessionDirCache = new Map<string, DirectoryBrowseResult>();

/**
 * Browse any FTP / HTTP Open Directory URL cleanly via /api/browse
 */
export async function browseFtpDirectory(
  rawUrl: string,
  forceRefresh = false
): Promise<DirectoryBrowseResult> {
  const targetUrl = normalizeFtpUrl(rawUrl);
  if (!targetUrl) {
    throw new Error('Please enter a valid FTP or HTTP server URL.');
  }

  if (!forceRefresh && sessionDirCache.has(targetUrl)) {
    return sessionDirCache.get(targetUrl)!;
  }

  // If user explicitly connected Local Bridge, try it first
  if (isLocalBridgeAvailable && isPrivateOrBdixUrl(targetUrl)) {
    try {
      const bridgeRes = await fetch(
        `${LOCAL_BRIDGE_BASE}/raw?url=${encodeURIComponent(targetUrl)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (bridgeRes.ok) {
        const data = await bridgeRes.json();
        if (data.html) {
          const parsed = parseDirectoryHtml(
            data.html,
            data.finalUrl || targetUrl,
            'local-bridge'
          );
          sessionDirCache.set(targetUrl, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  // Primary Cloud Backend + BDIX Public Gateway Resolver (/api/browse always returns 200 OK)
  const apiRes = await fetch(`/api/browse?url=${encodeURIComponent(targetUrl)}`);
  const data = await apiRes.json();

  if (data.error || !Array.isArray(data.items)) {
    const err: any = new Error(data.error || 'Failed to load directory');
    err.isPrivateNetwork = Boolean(data.isPrivateNetwork || isPrivateOrBdixUrl(targetUrl));
    err.hint = data.hint;
    err.targetUrl = targetUrl;
    throw err;
  }

  const result = data as DirectoryBrowseResult;
  sessionDirCache.set(targetUrl, result);
  return result;
}

/**
 * Crawl & Combine Multiple FTP Links Together into One Unified Catalog
 * Automatically unpacks ALL year subfolders (2026, 2025, 2024... down to 1990)
 * so all movies across all years appear together without clicking into folders!
 */
export async function browseMultipleFtpDirectories(
  sources: { id: string; name: string; url: string }[],
  onStreamUpdate?: (
    items: ParsedFtpItem[],
    summaries: { name: string; url: string; count: number; ok: boolean }[]
  ) => void
): Promise<{
  combinedItems: ParsedFtpItem[];
  combinedSubtitles: ParsedFtpItem[];
  sourceSummaries: { name: string; url: string; count: number; ok: boolean }[];
}> {
  const combinedItems: ParsedFtpItem[] = [];
  const combinedSubtitles: ParsedFtpItem[] = [];
  const seenIds = new Set<string>();
  const sourceSummaries: { name: string; url: string; count: number; ok: boolean }[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const dirRes = await browseFtpDirectory(source.url);
        let addedCount = 0;
        const isSeriesSource = /series|tv|anime|cartoon|drama/i.test(source.url);

        const tagAndAdd = (item: ParsedFtpItem, fallbackYear?: number) => {
          // Never add year_folder items themselves when unpacking all years together
          if (item.mediaKind === 'year_folder') return;
          if (seenIds.has(item.id)) return;
          seenIds.add(item.id);
          let resolvedKind = item.mediaKind;
          if (item.isDirectory && resolvedKind === 'generic_folder') {
            resolvedKind = isSeriesSource ? 'series' : 'movie';
          }
          const tagged: ParsedFtpItem = {
            ...item,
            mediaKind: resolvedKind,
            year: item.year || fallbackYear,
            sourceServerName: source.name,
            sourceServerUrl: source.url,
          };
          combinedItems.push(tagged);
          addedCount++;
        };

        for (const sub of dirRes.subtitles) {
          if (!seenIds.has(sub.id)) {
            seenIds.add(sub.id);
            combinedSubtitles.push({
              ...sub,
              sourceServerName: source.name,
              sourceServerUrl: source.url,
            });
          }
        }

        const yearFolders = dirRes.items
          .filter((i) => i.isDirectory && i.mediaKind === 'year_folder')
          .sort((a, b) => (b.year || 0) - (a.year || 0));

        const directMedia = dirRes.items.filter(
          (i) => i.mediaKind === 'movie' || i.mediaKind === 'series' || i.mediaKind === 'episode'
        );

        for (const item of dirRes.items) {
          tagAndAdd(item);
        }

        const summaryEntry = {
          name: source.name,
          url: source.url,
          count: addedCount,
          ok: true,
        };
        sourceSummaries.push(summaryEntry);

        // Unpack ALL year subfolders (or top subfolders if no year folders) in parallel batches
        const targetFolders =
          yearFolders.length > 0
            ? yearFolders
            : directMedia.length < 8
            ? dirRes.items.filter((i) => i.isDirectory).slice(0, 6)
            : [];

        const BATCH_SIZE = 7;
        for (let i = 0; i < targetFolders.length; i += BATCH_SIZE) {
          const batch = targetFolders.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (subFolder) => {
              try {
                const subRes = await browseFtpDirectory(subFolder.url);
                const subIsSeries =
                  isSeriesSource || /series|tv|anime|cartoon|drama/i.test(subFolder.url);
                for (const subItem of subRes.items) {
                  if (subItem.isDirectory && subItem.mediaKind === 'generic_folder') {
                    subItem.mediaKind = subIsSeries ? 'series' : 'movie';
                  }
                  tagAndAdd(subItem, subFolder.year);
                }
              } catch {}
            })
          );
          summaryEntry.count = addedCount;
          if (onStreamUpdate) {
            onStreamUpdate([...combinedItems], [...sourceSummaries]);
          }
        }
      } catch {
        sourceSummaries.push({
          name: source.name,
          url: source.url,
          count: 0,
          ok: false,
        });
      }
    })
  );

  return {
    combinedItems,
    combinedSubtitles,
    sourceSummaries,
  };
}

const INDEX_STORAGE_KEY = 'cineftp_indexed_cache_v2';
const INDEX_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedIndexRecord {
  timestamp: number;
  items: ParsedFtpItem[];
  hasSubfolders: boolean;
}

const unpackedDirCache = new Map<string, ParsedFtpItem[]>();
const persistentIndexCache = new Map<string, CachedIndexRecord>();

// Hydrate indexed catalogs from localStorage for instant, zero-delay startup
try {
  const raw = localStorage.getItem(INDEX_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      const record = v as CachedIndexRecord;
      if (record && now - record.timestamp < INDEX_TTL_MS && Array.isArray(record.items)) {
        persistentIndexCache.set(k, record);
        unpackedDirCache.set(k, record.items);
      }
    }
  }
} catch {}

export function savePersistentIndexCache() {
  try {
    const obj: Record<string, CachedIndexRecord> = {};
    const entries = Array.from(persistentIndexCache.entries()).slice(-25);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

export function clearIndexedCache() {
  try {
    persistentIndexCache.clear();
    unpackedDirCache.clear();
    sessionDirCache.clear();
    playableLinksCache.clear();
    localStorage.removeItem(INDEX_STORAGE_KEY);
    localStorage.removeItem(PLAYABLE_CACHE_KEY);
  } catch {}
}

const PLAYABLE_CACHE_KEY = 'cineftp_playable_links_cache_v2';
const playableLinksCache = new Map<string, string>();

try {
  const raw = localStorage.getItem(PLAYABLE_CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') playableLinksCache.set(k, v);
    }
  }
} catch {}

export function getCachedPlayableUrl(idOrUrl: string): string | undefined {
  return playableLinksCache.get(idOrUrl);
}

export function saveCachedPlayableUrl(idOrUrl: string, streamUrl: string) {
  try {
    playableLinksCache.set(idOrUrl, streamUrl);
    const obj: Record<string, string> = {};
    const entries = Array.from(playableLinksCache.entries()).slice(-400);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    localStorage.setItem(PLAYABLE_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

// Concurrency control for metadata fetching to keep UI silky smooth (60 FPS)
let activeMetaFetches = 0;
const metaFetchQueue: (() => void)[] = [];
const inFlightMetaRequests = new Map<string, Promise<EnrichedMetadata | null>>();

async function acquireMetaSlot(): Promise<() => void> {
  if (activeMetaFetches < 5) {
    activeMetaFetches++;
    return () => {
      activeMetaFetches--;
      if (metaFetchQueue.length > 0) {
        const next = metaFetchQueue.shift();
        next?.();
      }
    };
  }
  return new Promise((resolve) => {
    metaFetchQueue.push(() => {
      activeMetaFetches++;
      resolve(() => {
        activeMetaFetches--;
        if (metaFetchQueue.length > 0) {
          const next = metaFetchQueue.shift();
          next?.();
        }
      });
    });
  });
}

/**
 * Deep-browse a single directory:
 * Automatically unpacks ALL year folders (2026, 2025, 2024... down to older)
 * or category/language subfolders, streaming items incrementally so users
 * never have to wait and never have to click any manual unpack button!
 */
export async function browseDirectoryWithDeepScan(
  url: string,
  onProgress?: (loadedCount: number, folderName: string) => void,
  onStreamChunk?: (items: ParsedFtpItem[]) => void,
  forceRefresh = false
): Promise<{
  directResult: DirectoryBrowseResult;
  hasSubfolders: boolean;
  unpackedItems: ParsedFtpItem[];
  subfolders: ParsedFtpItem[];
  totalEstimatedCount: number;
}> {
  const normUrl = normalizeFtpUrl(url);

  // Instant response from memory or persistent cache if already indexed
  if (!forceRefresh) {
    if (unpackedDirCache.has(normUrl)) {
      const cachedItems = unpackedDirCache.get(normUrl)!;
      if (onStreamChunk) onStreamChunk(cachedItems);
      return {
        directResult: {
          url: normUrl,
          serverName: 'FTP Server',
          pageTitle: 'Auto-Unpacked Directory',
          isH5ai: false,
          isPortalRoot: false,
          parentUrl: null,
          breadcrumbs: [{ label: 'Root', url: normUrl }],
          items: cachedItems,
          subtitles: [],
          fetchedVia: 'backend',
        },
        hasSubfolders: true,
        unpackedItems: cachedItems,
        subfolders: [],
        totalEstimatedCount: cachedItems.length,
      };
    }

    if (persistentIndexCache.has(normUrl)) {
      const record = persistentIndexCache.get(normUrl)!;
      unpackedDirCache.set(normUrl, record.items);
      if (onStreamChunk) onStreamChunk(record.items);
      return {
        directResult: {
          url: normUrl,
          serverName: 'FTP Server',
          pageTitle: 'Auto-Unpacked Directory',
          isH5ai: false,
          isPortalRoot: false,
          parentUrl: null,
          breadcrumbs: [{ label: 'Root', url: normUrl }],
          items: record.items,
          subtitles: [],
          fetchedVia: 'backend',
        },
        hasSubfolders: record.hasSubfolders,
        unpackedItems: record.items,
        subfolders: [],
        totalEstimatedCount: record.items.length,
      };
    }
  }

  const dirRes = await browseFtpDirectory(normUrl, forceRefresh);
  const subfolders = dirRes.items.filter((i) => i.isDirectory);
  const isSeriesSource = /series|tv|anime|cartoon|drama|dhaka-flix-12|dhaka-flix-14|ftp-4/i.test(normUrl);

  // If this is a TV series source (e.g. English-Foreign-TV-Series, Hindi TV Series, Anime Series):
  // The folders in this directory are the TV Series themselves!
  // They must NEVER be unpacked into individual "Season 1", "Season 2" duplicates in the main catalog.
  if (isSeriesSource) {
    const isLetterBucketFolder = (folder: ParsedFtpItem) =>
      /^[A-Z]$/i.test(folder.cleanTitle.trim()) ||
      /^(?:0-9|#|numeric|others?)$/i.test(folder.cleanTitle.trim());

    const letterBuckets = subfolders.filter(isLetterBucketFolder);

    if (letterBuckets.length >= 3) {
      // If organized by A-Z buckets, unpack the buckets to pull all TV Series
      const unpackedSeries: ParsedFtpItem[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < letterBuckets.length; i += 6) {
        const batch = letterBuckets.slice(i, i + 6);
        await Promise.all(
          batch.map(async (bucket) => {
            try {
              const bRes = await browseFtpDirectory(bucket.url);
              for (const item of bRes.items) {
                if (item.mediaKind === 'subtitle' || seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                let yr = item.year;
                const m = item.rawName.match(/(?:19|20)\d{2}/);
                if (m && !yr) yr = parseInt(m[0], 10);
                unpackedSeries.push({
                  ...item,
                  mediaKind: 'series',
                  year: yr,
                });
              }
            } catch {}
          })
        );
        if (onStreamChunk) onStreamChunk([...unpackedSeries]);
      }

      unpackedDirCache.set(normUrl, [...unpackedSeries]);
      return {
        directResult: dirRes,
        hasSubfolders: true,
        unpackedItems: unpackedSeries,
        subfolders,
        totalEstimatedCount: unpackedSeries.length,
      };
    }

    // Direct series root: every directory is an independent TV Series!
    const seriesItems: ParsedFtpItem[] = dirRes.items
      .filter((i) => i.mediaKind !== 'subtitle')
      .map((item) => {
        let yr = item.year;
        let title = item.cleanTitle;

        // Ensure series titles like 1923-2022, 1983-2018, 1883, 1899 have clean titles & correct years
        const yearTitleMatch = item.rawName.match(/^(1883|1899|1923|1983|1992|1971)(?:[\s\.\-_]+((?:19|20)\d{2}))?/i);
        if (yearTitleMatch) {
          title = yearTitleMatch[1];
          if (yearTitleMatch[2]) yr = parseInt(yearTitleMatch[2], 10);
        } else if (!yr) {
          const m = item.rawName.match(/(?:19|20)\d{2}/);
          if (m) yr = parseInt(m[0], 10);
        }

        return {
          ...item,
          cleanTitle: title,
          mediaKind: 'series' as const,
          year: yr,
        };
      });

    if (onStreamChunk) onStreamChunk(seriesItems);
    unpackedDirCache.set(normUrl, [...seriesItems]);
    persistentIndexCache.set(normUrl, {
      timestamp: Date.now(),
      items: [...seriesItems],
      hasSubfolders: false,
    });
    savePersistentIndexCache();

    return {
      directResult: dirRes,
      hasSubfolders: false,
      unpackedItems: seriesItems,
      subfolders: [],
      totalEstimatedCount: seriesItems.length,
    };
  }

  // Check for year subfolders or container subfolders in movie sources
  const yearFolders = subfolders
    .filter((i) => i.mediaKind === 'year_folder' || /^\(?\d{4}\)?$/.test(i.cleanTitle))
    .sort((a, b) => (b.year || 0) - (a.year || 0));

  const hasSubfolders = subfolders.length > 0;
  const isContainer = subfolders.length >= 2 && subfolders.length >= dirRes.items.length * 0.7;

  if (!isContainer && !hasSubfolders) {
    if (onStreamChunk) onStreamChunk(dirRes.items);
    return {
      directResult: dirRes,
      hasSubfolders: false,
      unpackedItems: dirRes.items,
      subfolders: [],
      totalEstimatedCount: dirRes.items.length,
    };
  }

  // Folders to crawl: all year folders or all subfolders
  const targetFolders = yearFolders.length > 0 ? yearFolders : subfolders.slice(0, 36);
  const unpackedItems: ParsedFtpItem[] = [];
  const seenIds = new Set<string>();

  // Add any direct media items already in root
  for (const item of dirRes.items) {
    if (!item.isDirectory) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        unpackedItems.push(item);
      }
    }
  }

  // Initial stream update with direct media items
  if (unpackedItems.length > 0 && onStreamChunk) {
    onStreamChunk([...unpackedItems]);
  }

  // Crawl in parallel batches of 6 for high performance
  const BATCH_SIZE = 6;
  for (let i = 0; i < targetFolders.length; i += BATCH_SIZE) {
    const batch = targetFolders.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (folder) => {
        try {
          const subRes = await browseFtpDirectory(folder.url);
          for (const subItem of subRes.items) {
            if (subItem.mediaKind === 'year_folder' || seenIds.has(subItem.id)) continue;
            seenIds.add(subItem.id);
            let kind = subItem.mediaKind;
            if (subItem.isDirectory && (kind === 'generic_folder' || kind === 'category_folder')) {
              kind = isSeriesSource ? 'series' : 'movie';
            }
            unpackedItems.push({
              ...subItem,
              mediaKind: kind,
              year: subItem.year || folder.year,
            });
          }
          if (onProgress) {
            onProgress(unpackedItems.length, folder.cleanTitle);
          }
        } catch {}
      })
    );

    // Stream the new batch of movies directly to the UI!
    if (onStreamChunk) {
      onStreamChunk([...unpackedItems]);
    }
  }

  // Cache in memory and localStorage for subsequent instant loading
  unpackedDirCache.set(normUrl, [...unpackedItems]);
  persistentIndexCache.set(normUrl, {
    timestamp: Date.now(),
    items: [...unpackedItems],
    hasSubfolders: true,
  });
  savePersistentIndexCache();

  return {
    directResult: dirRes,
    hasSubfolders: true,
    unpackedItems,
    subfolders,
    totalEstimatedCount: Math.max(unpackedItems.length, dirRes.items.length),
  };
}

export async function fetchItemMetadata(
  item: ParsedFtpItem
): Promise<EnrichedMetadata | null> {
  if (
    item.mediaKind !== 'movie' &&
    item.mediaKind !== 'series' &&
    item.mediaKind !== 'episode'
  ) {
    return null;
  }

  const cleanTitle = item.cleanTitle.trim();
  if (!cleanTitle || cleanTitle.length < 2) return null;

  const cacheKey = `${cleanTitle.toLowerCase()}|${item.year || ''}|${item.mediaKind}`;
  if (localMetaCache.has(cacheKey)) {
    return localMetaCache.get(cacheKey)!;
  }

  // In-flight deduplication
  if (inFlightMetaRequests.has(cacheKey)) {
    return inFlightMetaRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const release = await acquireMetaSlot();
    try {
      const params = new URLSearchParams({
        title: cleanTitle,
        kind: item.mediaKind,
      });
      if (item.year) params.set('year', String(item.year));

      const res = await fetch(`/api/metadata?${params.toString()}`);
      if (!res.ok) return null;
      const data: EnrichedMetadata = await res.json();
      localMetaCache.set(cacheKey, data);
      saveMetaCache();
      return data;
    } catch {
      return null;
    } finally {
      release();
      inFlightMetaRequests.delete(cacheKey);
    }
  })();

  inFlightMetaRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

function sortEpisodesList(videos: ParsedFtpItem[]): ParsedFtpItem[] {
  return [...videos].sort((a, b) => {
    const sa = a.season ?? 1;
    const sb = b.season ?? 1;
    if (sa !== sb) return sa - sb;
    if (a.episode !== undefined && b.episode !== undefined && a.episode !== b.episode) {
      return a.episode - b.episode;
    }
    return a.rawName.localeCompare(b.rawName, undefined, { numeric: true });
  });
}

/**
 * Load all Episode video files and subtitles from a specific Season folder URL
 */
export async function loadSeasonEpisodes(
  seasonFolder: SeasonFolderInfo,
  seriesItem?: ParsedFtpItem
): Promise<{ episodes: ParsedFtpItem[]; subtitles: ParsedFtpItem[] }> {
  if (seasonFolder.episodes && seasonFolder.episodes.length > 0) {
    return {
      episodes: seasonFolder.episodes,
      subtitles: seasonFolder.subtitles || [],
    };
  }

  const dirRes = await browseFtpDirectory(seasonFolder.url);
  let videos = dirRes.items.filter(
    (i) => !i.isDirectory && (i.mediaKind === 'movie' || i.mediaKind === 'episode')
  );
  const subtitles = [...dirRes.subtitles];

  // Check if there is a Subs subfolder or nested quality folder inside the Season folder
  const subFolders = dirRes.items.filter((i) => i.isDirectory);
  for (const sf of subFolders.slice(0, 4)) {
    if (/^(subs?|subtitles?)$/i.test(sf.rawName.trim())) {
      try {
        const sRes = await browseFtpDirectory(sf.url);
        subtitles.push(...sRes.subtitles);
      } catch {}
    } else if (videos.length === 0) {
      try {
        const nestedRes = await browseFtpDirectory(sf.url);
        const nestedVids = nestedRes.items.filter(
          (i) => !i.isDirectory && (i.mediaKind === 'movie' || i.mediaKind === 'episode')
        );
        if (nestedVids.length > 0) {
          videos.push(...nestedVids);
          subtitles.push(...nestedRes.subtitles);
        }
      } catch {}
    }
  }

  videos = videos.map((v, idx) => ({
    ...v,
    mediaKind: 'episode',
    season: v.season ?? seasonFolder.seasonNumber,
    episode: v.episode ?? idx + 1,
    cleanTitle: seriesItem?.cleanTitle || v.cleanTitle,
    posterUrl: v.posterUrl || dirRes.localPosterUrl || seriesItem?.posterUrl,
    backdropUrl: seriesItem?.backdropUrl || v.backdropUrl,
    year: v.year || seriesItem?.year,
  }));

  return {
    episodes: sortEpisodesList(videos),
    subtitles,
  };
}

/**
 * Inspect a TV Series folder (up to 3 levels deep, handling Quality folders + Season folders)
 * so the user can choose which Season (Season 1, Season 2, Season 3...) and Episode to play!
 */
export async function crawlSeriesSeasons(
  seriesItem: ParsedFtpItem
): Promise<SeriesInspectionResult> {
  // If explicitly a movie, do not crawl or format as TV series
  if (seriesItem.mediaKind === 'movie') {
    return {
      seriesItem,
      seasons: [],
      initialEpisodes: [],
      initialSubtitles: [],
    };
  }

  const rootRes = await browseFtpDirectory(seriesItem.url);

  const directVideos = rootRes.items.filter(
    (i) => !i.isDirectory && (i.mediaKind === 'movie' || i.mediaKind === 'episode')
  );
  const childDirs = rootRes.items.filter(
    (i) =>
      i.isDirectory &&
      !/^(subs?|subtitles?|sample|extras?|featurettes?)$/i.test(i.rawName.trim())
  );

  const seasons: SeasonFolderInfo[] = [];

  // Check if childDirs are directly Season folders (e.g. "Season-1", "Season 2", "S01")
  for (const dir of childDirs) {
    const sNum = extractSeasonNumber(dir.rawName);
    if (sNum !== undefined || isSeasonFolderName(dir.rawName)) {
      const num = sNum ?? seasons.length + 1;
      seasons.push({
        id: dir.url,
        seasonNumber: num,
        label: `Season ${num}`,
        qualityLabel: dir.quality || dir.audioTag,
        url: dir.url,
      });
    }
  }

  // If childDirs are Quality/Language containers (e.g., "1080p-English/", "720p-Dual-Audio/"),
  // crawl inside them to find the actual Season folders!
  if (seasons.length === 0 && childDirs.length > 0) {
    await Promise.all(
      childDirs.slice(0, 4).map(async (qDir) => {
        try {
          const qRes = await browseFtpDirectory(qDir.url);
          const qSubDirs = qRes.items.filter(
            (i) =>
              i.isDirectory &&
              !/^(subs?|subtitles?|sample|extras?)$/i.test(i.rawName.trim())
          );
          const qVideos = qRes.items.filter(
            (i) => !i.isDirectory && (i.mediaKind === 'movie' || i.mediaKind === 'episode')
          );

          for (const sDir of qSubDirs) {
            const sNum = extractSeasonNumber(sDir.rawName);
            const num = sNum ?? seasons.length + 1;
            const qTag = qDir.rawName.replace(/[-_]+/g, ' ').trim();
            seasons.push({
              id: sDir.url,
              seasonNumber: num,
              label: `Season ${num}`,
              qualityLabel: sDir.quality || qTag,
              url: sDir.url,
            });
          }

          // If the quality folder directly holds episodes without Season subfolders
          if (qSubDirs.length === 0 && qVideos.length > 0) {
            const sNum = extractSeasonNumber(qDir.rawName) ?? 1;
            const sortedEps = sortEpisodesList(
              qVideos.map((v, idx) => ({
                ...v,
                mediaKind: 'episode',
                season: v.season ?? sNum,
                episode: v.episode ?? idx + 1,
                cleanTitle: seriesItem.cleanTitle || v.cleanTitle,
                posterUrl: v.posterUrl || seriesItem.posterUrl,
              }))
            );
            seasons.push({
              id: qDir.url,
              seasonNumber: sNum,
              label: `Season ${sNum}`,
              qualityLabel: qDir.rawName.replace(/[-_]+/g, ' ').trim(),
              url: qDir.url,
              episodes: sortedEps,
              subtitles: qRes.subtitles,
            });
          }
        } catch {}
      })
    );
  }

  // If episodes are directly in the root folder without Season subfolders, group them by season number
  // Only treat as series episodes if there are multiple videos or videos have explicit episode tags
  const hasSeriesTag = directVideos.some((v) => v.season !== undefined || v.episode !== undefined);
  if (seasons.length === 0 && directVideos.length > 0 && (hasSeriesTag || directVideos.length > 1)) {
    const bySeason = new Map<number, ParsedFtpItem[]>();
    for (const v of directVideos) {
      const sNum = v.season ?? 1;
      const list = bySeason.get(sNum) || [];
      list.push({
        ...v,
        mediaKind: 'episode',
        season: sNum,
        posterUrl: v.posterUrl || rootRes.localPosterUrl || seriesItem.posterUrl,
      });
      bySeason.set(sNum, list);
    }

    Array.from(bySeason.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([sNum, eps]) => {
        seasons.push({
          id: `${seriesItem.url}#s${sNum}`,
          seasonNumber: sNum,
          label: `Season ${sNum}`,
          url: seriesItem.url,
          episodes: sortEpisodesList(eps),
          subtitles: rootRes.subtitles,
        });
      });
  }

  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  let initialEpisodes: ParsedFtpItem[] = [];
  let initialSubtitles: ParsedFtpItem[] = [...rootRes.subtitles];

  if (seasons.length > 0) {
    try {
      const firstLoaded = await loadSeasonEpisodes(seasons[0], seriesItem);
      seasons[0].episodes = firstLoaded.episodes;
      seasons[0].subtitles = firstLoaded.subtitles;
      initialEpisodes = firstLoaded.episodes;
      initialSubtitles = firstLoaded.subtitles;
    } catch {}
  }

  return {
    seriesItem,
    seasons,
    initialEpisodes,
    initialSubtitles,
  };
}

export async function resolvePlayableFromFolder(folderItem: ParsedFtpItem): Promise<{
  primaryVideo: ParsedFtpItem;
  allVideos: ParsedFtpItem[];
  subtitles: ParsedFtpItem[];
  seasons?: SeasonFolderInfo[];
  folderResult: DirectoryBrowseResult;
}> {
  // 1. Instant return from cache
  const cachedUrl = getCachedPlayableUrl(folderItem.id) || getCachedPlayableUrl(folderItem.url);
  if (cachedUrl) {
    const cachedItem: ParsedFtpItem = {
      ...folderItem,
      id: cachedUrl,
      url: cachedUrl,
      isDirectory: false,
    };
    return {
      primaryVideo: cachedItem,
      allVideos: [cachedItem],
      subtitles: [],
      folderResult: {
        url: folderItem.url,
        serverName: folderItem.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [cachedItem],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  // 2. Check if this movie exists in our known seed catalog with a verified direct stream URL
  const normStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetNorm = normStr(folderItem.cleanTitle);
  const rawNorm = normStr(folderItem.rawName);

  // Seed entries point at public ftpbd URLs. For a folder that lives on a
  // private BDIX server, the seed shortcut is only safe on Vercel (where the
  // private address is unreachable anyway). On a local/PC deployment the
  // real folder must be scanned — its original private URLs are the ones
  // that play.
  const allowSeedShortcut = isVercelHost() || !isPrivateOrBdixUrl(folderItem.url);
  const seedMatch = !allowSeedShortcut
    ? undefined
    : INITIAL_UNIFIED_CATALOG.find((s) => {
    if (s.id === folderItem.id || s.url === folderItem.url) return true;
    const sNorm = normStr(s.cleanTitle);
    if (
      sNorm &&
      targetNorm &&
      (sNorm === targetNorm ||
        (targetNorm.length > 4 && sNorm.includes(targetNorm)) ||
        (sNorm.length > 4 && targetNorm.includes(sNorm)))
    ) {
      return true;
    }
    if (sNorm && rawNorm && (rawNorm.includes(sNorm) || sNorm.includes(rawNorm))) {
      return true;
    }
    try {
      if (folderItem.url.includes(encodeURIComponent(s.cleanTitle))) return true;
    } catch {}
    return false;
  });

  if (seedMatch && !seedMatch.isDirectory && /\.(mp4|mkv|webm)(\?.*)?$/i.test(seedMatch.url)) {
    saveCachedPlayableUrl(folderItem.id, seedMatch.url);
    saveCachedPlayableUrl(folderItem.url, seedMatch.url);
    const resolvedSeed: ParsedFtpItem = {
      ...folderItem,
      ...seedMatch,
      id: seedMatch.url,
      url: seedMatch.url,
      isDirectory: false,
    };
    return {
      primaryVideo: resolvedSeed,
      allVideos: [resolvedSeed],
      subtitles: [],
      folderResult: {
        url: folderItem.url,
        serverName: folderItem.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [resolvedSeed],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  let dirResult: DirectoryBrowseResult | null = null;
  try {
    dirResult = await browseFtpDirectory(folderItem.url);
  } catch (err) {
    console.warn('Network scan of folder timed out or failed:', err);
  }

  const rawItems = dirResult?.items || [];
  const videos = rawItems.filter(
    (i) =>
      !i.isDirectory &&
      (i.mediaKind === 'movie' ||
        i.mediaKind === 'episode' ||
        (i.extension && /^(mp4|mkv|webm|avi|mov|ts|m4v)$/i.test(i.extension)) ||
        /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(i.url))
  );
  const subtitles = dirResult ? [...dirResult.subtitles] : [];

  // Also check if there is a "Subs" or "Subtitles" subfolder inside the movie folder
  const subFolder = rawItems.find(
    (i) => i.isDirectory && /^(subs?|subtitles?)$/i.test(i.rawName.trim())
  );
  if (subFolder) {
    try {
      const subDirRes = await browseFtpDirectory(subFolder.url);
      subtitles.push(...subDirRes.subtitles);
    } catch {}
  }

  // If no direct video in Level 1 and it might be a series, check series seasons
  if (videos.length === 0 && folderItem.mediaKind !== 'movie') {
    try {
      const seriesCheck = await crawlSeriesSeasons(folderItem);
      if (seriesCheck.initialEpisodes.length > 0) {
        const firstEp = seriesCheck.initialEpisodes[0];
        return {
          primaryVideo: {
            ...firstEp,
            posterUrl: firstEp.posterUrl || folderItem.posterUrl,
            backdropUrl: folderItem.backdropUrl || firstEp.backdropUrl,
            imdbRating: folderItem.imdbRating,
            plot: folderItem.plot,
            cast: folderItem.cast,
            genres: folderItem.genres,
            year: firstEp.year || folderItem.year,
          },
          allVideos: seriesCheck.initialEpisodes,
          subtitles: seriesCheck.initialSubtitles,
          seasons: seriesCheck.seasons,
          folderResult: dirResult || {
            url: folderItem.url,
            serverName: folderItem.sourceServerName || 'CineFTP',
            pageTitle: folderItem.cleanTitle,
            isH5ai: true,
            isPortalRoot: false,
            parentUrl: null,
            breadcrumbs: [],
            items: seriesCheck.initialEpisodes,
            subtitles: [],
            fetchedVia: 'backend',
          },
        };
      }
    } catch {}
  }

  // If still no video found (e.g. serverless proxy network restrictions on Vercel),
  // construct the canonical BDIX movie filename from folder name so playback NEVER bricks!
  if (videos.length === 0) {
    let fallbackVideoUrl = folderItem.url;
    if (
      folderItem.isDirectory ||
      folderItem.url.endsWith('/') ||
      !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(folderItem.url)
    ) {
      const cleanBaseUrl = folderItem.url.replace(/\/+$/, '');
      const folderSlug =
        cleanBaseUrl.split('/').pop() || folderItem.cleanTitle.replace(/[\s\.\-_]+/g, '-');
      fallbackVideoUrl = `${cleanBaseUrl}/${folderSlug}-1080p-English-DD-5-1--ESub_reencoded.mp4`;
    }
    const fallbackItem: ParsedFtpItem = {
      ...folderItem,
      id: fallbackVideoUrl,
      url: fallbackVideoUrl,
      isDirectory: false,
      mediaKind: 'movie',
    };
    saveCachedPlayableUrl(folderItem.id, fallbackVideoUrl);
    saveCachedPlayableUrl(folderItem.url, fallbackVideoUrl);

    return {
      primaryVideo: fallbackItem,
      allVideos: [fallbackItem],
      subtitles: [],
      folderResult: dirResult || {
        url: folderItem.url,
        serverName: folderItem.sourceServerName || 'CineFTP Server',
        pageTitle: folderItem.cleanTitle,
        isH5ai: true,
        isPortalRoot: false,
        parentUrl: null,
        breadcrumbs: [],
        items: [fallbackItem],
        subtitles: [],
        fetchedVia: 'backend',
      },
    };
  }

  const hasEpisodes = videos.some((v) => v.episode !== undefined);
  if (hasEpisodes) {
    videos.sort((a, b) => {
      if (a.season !== b.season) return (a.season || 1) - (b.season || 1);
      if (a.episode !== b.episode) return (a.episode || 0) - (b.episode || 0);
      return a.rawName.localeCompare(b.rawName, undefined, { numeric: true });
    });
  } else {
    videos.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
  }

  const primaryVideo: ParsedFtpItem = {
    ...videos[0],
    posterUrl: videos[0].posterUrl || dirResult?.localPosterUrl || folderItem.posterUrl,
    backdropUrl: folderItem.backdropUrl || videos[0].backdropUrl,
    imdbRating: folderItem.imdbRating,
    plot: folderItem.plot,
    cast: folderItem.cast,
    genres: folderItem.genres,
    year: videos[0].year || folderItem.year,
  };

  saveCachedPlayableUrl(folderItem.id, primaryVideo.url);
  saveCachedPlayableUrl(folderItem.url, primaryVideo.url);

  return {
    primaryVideo,
    allVideos: videos,
    subtitles,
    folderResult: dirResult || {
      url: folderItem.url,
      serverName: folderItem.sourceServerName || 'CineFTP Server',
      pageTitle: folderItem.cleanTitle,
      isH5ai: true,
      isPortalRoot: false,
      parentUrl: null,
      breadcrumbs: [],
      items: videos,
      subtitles,
      fetchedVia: 'backend',
    },
  };
}

export function isVercelHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('vercel.app') || host.includes('vercel.com');
}

export async function probeVideoStreams(videoUrl: string): Promise<MediaProbeInfo | null> {
  try {
    const res = await fetch(`/api/probe?url=${encodeURIComponent(videoUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data as MediaProbeInfo;
  } catch {
    return null;
  }
}

export function buildStreamUrl(options: {
  videoUrl: string;
  mode: 'direct-proxy' | 'ffmpeg-remux' | 'raw-direct';
  audioTrack?: number;
  startSeconds?: number;
  reencodeVideo?: boolean;
}): string {
  const { videoUrl, mode, audioTrack = 0, startSeconds = 0, reencodeVideo = false } = options;

  const effectiveUrl = videoUrl;

  if (mode === 'raw-direct') {
    return effectiveUrl;
  }

  const useLocalBridge = isLocalBridgeAvailable && isPrivateOrBdixUrl(videoUrl);
  const base = useLocalBridge ? LOCAL_BRIDGE_BASE : '/api';

  if (mode === 'ffmpeg-remux') {
    const params = new URLSearchParams({
      url: effectiveUrl,
      audioTrack: String(audioTrack),
      start: String(Math.floor(startSeconds)),
    });
    if (reencodeVideo) params.set('reencode', '1');
    return `${base}/transcode?${params.toString()}`;
  }

  return `${base}/stream?url=${encodeURIComponent(effectiveUrl)}`;
}
