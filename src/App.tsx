import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { AppSource, ActiveNav, RecentlyPlayedEntry } from './types/cineftp';
import { ParsedFtpItem } from './utils/ftpParser';
import {
  browseFtpDirectory,
  browseDirectoryWithDeepScan,
  EnrichedMetadata,
  SeasonFolderInfo,
  resolvePlayableFromFolder,
  getCachedPlayableUrl,
  saveCachedPlayableUrl,
} from './services/ftpClient';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CatalogView } from './components/CatalogView';
import { MediaDetailView } from './components/MediaDetailView';
import { SettingsView } from './components/SettingsView';
import { CinemaPlayer } from './components/CinemaPlayer';
import { AiAssistantModal } from './components/AiAssistantModal';
import { MobileBottomNav } from './components/MobileBottomNav';

const INITIAL_SOURCES: AppSource[] = [
  {
    id: 'src-english-movies-7',
    name: 'English Movies',
    url: 'https://server2.ftpbd.net/FTP-2/English%20Movies/',
    type: 'movies',
    count: 3850,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-foreign-movies',
    name: 'Foreign Language Movies',
    url: 'https://server3.ftpbd.net/FTP-3/Foreign%20Language%20Movies/',
    type: 'movies',
    count: 1850,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-kolkata-bangla',
    name: 'Kolkata Bangla Movies',
    url: 'https://server3.ftpbd.net/FTP-3/Bangla%20Collection/BANGLA/Kolkata-Bangla-Movies/',
    type: 'movies',
    count: 720,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-hindi-movies',
    name: 'Hindi Movies',
    url: 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/',
    type: 'movies',
    count: 3733,
    lastSynced: '21 min ago',
    status: 'online',
  },
  {
    id: 'src-hindi-dubbed',
    name: 'Hindi Dubbed',
    url: 'https://server3.ftpbd.net/FTP-3/South%20Indian%20Movies/',
    type: 'movies',
    count: 2458,
    lastSynced: '9 min ago',
    status: 'online',
  },
  {
    id: 'src-korean-series',
    name: 'TV & Web Series',
    url: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/',
    type: 'series',
    count: 1200,
    lastSynced: 'Just now',
    status: 'online',
  },
  {
    id: 'src-anim-movies',
    name: 'Animation Movies',
    url: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/',
    type: 'movies',
    count: 1534,
    lastSynced: '3 min ago',
    status: 'online',
  },
];

import {
  SEED_SERIES_CATALOG,
  INITIAL_UNIFIED_CATALOG,
} from './utils/seedData';

export default function App() {
  const [activeNav, setActiveNav] = useState<ActiveNav>('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sources, setSources] = useState<AppSource[]>(() => {
    try {
      const raw = localStorage.getItem('cineftp_sources_v8') || localStorage.getItem('cineftp_sources_v7');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Auto-migrate any old 172.16.x LAN URLs to public HTTPS mirrors
          const migrated = parsed.map((s: AppSource) => {
            const matchInit = INITIAL_SOURCES.find((init) => init.id === s.id);
            if (matchInit && (/^http:\/\/172\./.test(s.url) || s.url.includes('dhaka-flix'))) {
              return { ...s, url: matchInit.url };
            }
            return s;
          });
          const clean = migrated.filter(
            (s: AppSource) =>
              !s.id.startsWith('src-anime-') &&
              !s.id.startsWith('src-series-') &&
              s.id !== 'src-docu' &&
              s.id !== 'src-aew' &&
              s.id !== 'src-wwe' &&
              s.id !== 'src-awards' &&
              s.id !== 'src-anim-1080p' &&
              s.id !== 'src-korean-lang'
          );
          if (clean.length > 0) return clean;
        }
      }
    } catch {}
    return INITIAL_SOURCES;
  });

  const [catalogItems, setCatalogItems] = useState<ParsedFtpItem[]>(INITIAL_UNIFIED_CATALOG);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [deepScanProgressText, setDeepScanProgressText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Folder Navigation State
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ label: string; url: string }[]>([]);
  const [hasSubfolders, setHasSubfolders] = useState(false);
  const [isUnpackMode, setIsUnpackMode] = useState(true);

  // Watchlist & Recently Played
  const [watchlist, setWatchlist] = useState<ParsedFtpItem[]>(() => {
    try {
      const raw = localStorage.getItem('cineftp_watchlist_v6');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedEntry[]>(() => {
    try {
      const raw = localStorage.getItem('cineftp_recent_v6');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  // Selected Detail View
  const [selectedMediaItem, setSelectedMediaItem] = useState<{
    item: ParsedFtpItem;
    meta?: EnrichedMetadata | null;
  } | null>(null);

  // Active Cinema Video Player
  const [activePlayerState, setActivePlayerState] = useState<{
    video: ParsedFtpItem;
    playlist: ParsedFtpItem[];
    subtitles: ParsedFtpItem[];
    seasons?: SeasonFolderInfo[];
    initialStartTime?: number;
  } | null>(null);

  // AI Assistant Modal
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Save sources on change
  const saveSources = (updated: AppSource[]) => {
    setSources(updated);
    try {
      localStorage.setItem('cineftp_sources_v8', JSON.stringify(updated));
    } catch {}
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const watchlistSet = useMemo(() => {
    return new Set(watchlist.map((w) => w.id));
  }, [watchlist]);

  const toggleWatchlist = (item: ParsedFtpItem) => {
    setWatchlist((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists ? prev.filter((i) => i.id !== item.id) : [item, ...prev];
      try {
        localStorage.setItem('cineftp_watchlist_v6', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const recordRecentlyPlayed = (video: ParsedFtpItem, playlist: ParsedFtpItem[]) => {
    setRecentlyPlayed((prev) => {
      const next = [
        {
          id: video.id,
          video,
          playlist,
          subtitles: [],
          currentTime: 0,
          duration: 0,
          updatedAt: Date.now(),
        },
        ...prev.filter((p) => p.id !== video.id),
      ].slice(0, 30);
      try {
        localStorage.setItem('cineftp_recent_v6', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Helper to load directory items
  const loadDirectory = useCallback(async (url: string, unpack = true, isRootSource = false) => {
    setIsLoading(true);
    setIsDeepScanning(false);
    setDeepScanProgressText('');

    const isSeries = /series|tv|anime|cartoon|drama|ftp-4/i.test(url);

    try {
      if (unpack) {
        setIsDeepScanning(true);
        // Deep scan with progressive streaming so movies show up immediately!
        const deepRes = await browseDirectoryWithDeepScan(
          url,
          (count, name) => {
            setDeepScanProgressText(`Auto-indexing ${name} (${count} ${isSeries ? 'series' : 'movies'} loaded)...`);
          },
          (streamedChunk) => {
            if (isRootSource && isSeries) {
              const merged = [...SEED_SERIES_CATALOG];
              streamedChunk.forEach((item) => {
                if (!merged.some((m) => m.cleanTitle.toLowerCase() === item.cleanTitle.toLowerCase())) {
                  merged.push(item);
                }
              });
              setCatalogItems(merged);
            } else {
              setCatalogItems(streamedChunk);
            }
          }
        );
        setHasSubfolders(deepRes.hasSubfolders);
        setIsUnpackMode(deepRes.hasSubfolders);
      } else {
        const res = await browseFtpDirectory(url);
        const subfolders = res.items.filter((i) => i.isDirectory);
        const hasSub = subfolders.length > 0;
        setHasSubfolders(hasSub);
        setIsUnpackMode(false);

        // If it's a TV series root, merge with the pristine seed series catalog
        if (isRootSource && isSeries) {
          const merged = [...SEED_SERIES_CATALOG];
          res.items.forEach((item) => {
            if (!merged.some((m) => m.cleanTitle.toLowerCase() === item.cleanTitle.toLowerCase())) {
              merged.push(item);
            }
          });
          setCatalogItems(merged);
        } else {
          setCatalogItems(res.items);
        }
      }
    } catch (err) {
      console.warn('Could not load directory:', err);
    } finally {
      setIsLoading(false);
      setIsDeepScanning(false);
    }
  }, []);

  // Load & Aggregate multiple sources together (for Home, All Movies, All TV Shows)
  const loadMultiSourceGroup = useCallback(
    async (targetSources: AppSource[], groupTitle: string, isSeriesGroup = false) => {
      setIsLoading(true);
      setIsDeepScanning(true);
      setDeepScanProgressText(`Aggregating library across ${targetSources.length} servers...`);
      setFolderBreadcrumbs([{ label: groupTitle, url: groupTitle }]);
      setIsUnpackMode(true);
      setHasSubfolders(false);

      // Pre-seed with unified catalog on home, or series on series group, or movies on movies group
      let combined: ParsedFtpItem[] = groupTitle.toLowerCase().includes('home')
        ? [...INITIAL_UNIFIED_CATALOG]
        : isSeriesGroup
        ? [...SEED_SERIES_CATALOG]
        : [...INITIAL_UNIFIED_CATALOG.filter((i) => i.mediaKind === 'movie')];
      const seenIds = new Set<string>(combined.map((i) => i.id));
      setCatalogItems([...combined]);

      let finishedCount = 0;
      await Promise.all(
        targetSources.map(async (src) => {
          try {
            await browseDirectoryWithDeepScan(
              src.url,
              (count, name) => {
                setDeepScanProgressText(`Scanning ${src.name}: ${name} (${count} items)...`);
              },
              (streamedChunk) => {
                let addedAny = false;
                for (const item of streamedChunk) {
                  if (!seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    const isSeries = src.type === 'series' || /series|tv|anime|drama/i.test(src.url);
                    combined.push({
                      ...item,
                      mediaKind:
                        item.mediaKind === 'generic_folder'
                          ? isSeries
                            ? 'series'
                            : 'movie'
                          : item.mediaKind,
                      sourceServerName: src.name,
                      sourceServerUrl: src.url,
                    });
                    addedAny = true;
                  }
                }
                if (addedAny) {
                  setCatalogItems([...combined]);
                }
              }
            );
          } catch (err) {
            console.warn(`Could not load ${src.name}:`, err);
          } finally {
            finishedCount++;
            setDeepScanProgressText(
              `Indexed ${finishedCount}/${targetSources.length} servers (${combined.length} titles)...`
            );
          }
        })
      );

      setIsLoading(false);
      setIsDeepScanning(false);
    },
    []
  );

  // Fetch items whenever activeNav changes
  useEffect(() => {
    setSelectedMediaItem(null); // Clear detail view on section switch

    if (activeNav === 'settings') return;

    if (activeNav === 'watchlist') {
      setCatalogItems(watchlist);
      setFolderBreadcrumbs([{ label: 'Watchlist', url: 'watchlist' }]);
      setHasSubfolders(false);
      return;
    }

    if (activeNav === 'recent') {
      setCatalogItems(recentlyPlayed.map((r) => r.video));
      setFolderBreadcrumbs([{ label: 'Recently Played', url: 'recent' }]);
      setHasSubfolders(false);
      return;
    }

    // 1. Home Navigation: Combine ALL movies & series from all servers
    if (activeNav === 'home') {
      loadMultiSourceGroup(sources, 'Home — All Movies & Series', false);
      return;
    }

    // 2. Movies Navigation: Combine ALL movie sources together
    if (activeNav === 'movies') {
      const movieSources = sources.filter((s) => s.type === 'movies');
      loadMultiSourceGroup(movieSources, 'All Movies', false);
      return;
    }

    // 3. TV Shows Navigation: Combine ALL TV series sources together
    if (activeNav === 'series') {
      const seriesSources = sources.filter((s) => s.type === 'series');
      loadMultiSourceGroup(seriesSources, 'All TV Shows & Series', true);
      return;
    }

    // 4. Individual Source clicked under "SOURCES"
    if (typeof activeNav === 'object' && activeNav.type === 'source') {
      const targetSource = sources.find((s) => s.id === activeNav.sourceId);
      if (!targetSource) return;
      setFolderBreadcrumbs([{ label: targetSource.name, url: targetSource.url }]);
      setIsUnpackMode(true);
      loadDirectory(targetSource.url, true, true);
      return;
    }
  }, [activeNav, watchlist, recentlyPlayed, sources, loadDirectory, loadMultiSourceGroup]);

  // Navigate INTO a subfolder (e.g. clicking 2026/ or Korean-Language/)
  const handleOpenFolder = (folderUrl: string, folderTitle: string) => {
    setFolderBreadcrumbs((prev) => [...prev, { label: folderTitle, url: folderUrl }]);
    setIsUnpackMode(true);
    loadDirectory(folderUrl, true, false);
  };

  // Navigate via Breadcrumb click
  const handleNavigateBreadcrumb = (index: number) => {
    if (index >= folderBreadcrumbs.length) return;
    const target = folderBreadcrumbs[index];
    const newCrumbs = folderBreadcrumbs.slice(0, index + 1);
    setFolderBreadcrumbs(newCrumbs);
    setIsUnpackMode(true);
    loadDirectory(target.url, true, newCrumbs.length === 1);
  };

  // Toggle Unpack Mode (Deep Scan vs Raw Folders)
  const handleToggleUnpackMode = () => {
    const currentCrumb = folderBreadcrumbs[folderBreadcrumbs.length - 1];
    if (!currentCrumb) return;
    const nextMode = !isUnpackMode;
    setIsUnpackMode(nextMode);
    loadDirectory(currentCrumb.url, nextMode, folderBreadcrumbs.length === 1);
  };

  // Handle Play Direct from Card or Detail
  const handlePlayDirect = async (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => {
    // If stream link was already indexed or cached, launch player immediately with zero waiting!
    const cachedUrl = getCachedPlayableUrl(item.id) || getCachedPlayableUrl(item.url);
    if (cachedUrl) {
      const directItem: ParsedFtpItem = { ...item, url: cachedUrl, isDirectory: false };
      recordRecentlyPlayed(directItem, [directItem]);
      setActivePlayerState({
        video: directItem,
        playlist: [directItem],
        subtitles: [],
      });
      return;
    }

    const isFolder =
      item.isDirectory ||
      item.url.endsWith('/') ||
      !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(item.url);

    if (isFolder) {
      setIsLoading(true);
      try {
        const playable = await resolvePlayableFromFolder(item);
        if (playable.primaryVideo) {
          saveCachedPlayableUrl(item.id, playable.primaryVideo.url);
          saveCachedPlayableUrl(item.url, playable.primaryVideo.url);
          recordRecentlyPlayed(playable.primaryVideo, playable.allVideos);
          setActivePlayerState({
            video: playable.primaryVideo,
            playlist: playable.allVideos,
            subtitles: playable.subtitles,
            seasons: playable.seasons,
          });
          return;
        }
      } catch {
        // Continue to fallback
      } finally {
        setIsLoading(false);
      }
    }

    recordRecentlyPlayed(item, [item]);
    setActivePlayerState({
      video: item,
      playlist: [item],
      subtitles: [],
    });
  };

  // Add source in Settings (with Deep Scan to get accurate movie count!)
  const handleAddSource = async (newSrc: { name: string; url: string; type: 'movies' | 'series' }) => {
    const created: AppSource = {
      id: `src-${Date.now()}`,
      name: newSrc.name,
      url: newSrc.url,
      type: newSrc.type,
      count: 0,
      lastSynced: 'Just now',
      status: 'online',
    };

    try {
      // Run deep scan so count reflects actual movies inside subfolders!
      const deepRes = await browseDirectoryWithDeepScan(newSrc.url);
      created.count = deepRes.totalEstimatedCount || deepRes.unpackedItems.length;
    } catch {
      try {
        const res = await browseFtpDirectory(newSrc.url, true);
        created.count = res.items.length;
      } catch {}
    }

    saveSources([created, ...sources]);
  };

  const handleRemoveSource = (id: string) => {
    saveSources(sources.filter((s) => s.id !== id));
  };

  const handleSyncSource = async (id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    try {
      const deepRes = await browseDirectoryWithDeepScan(src.url);
      const totalCount = deepRes.totalEstimatedCount || deepRes.unpackedItems.length;
      const updated = sources.map((s) =>
        s.id === id ? { ...s, count: totalCount || s.count, lastSynced: 'Just now' } : s
      );
      saveSources(updated);
    } catch {}
  };

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      for (const src of sources.slice(0, 5)) {
        await handleSyncSource(src.id);
      }
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Filter items by search query if present
  const displayedCatalog = useMemo(() => {
    if (!searchQuery.trim()) return catalogItems;
    const q = searchQuery.toLowerCase();
    return catalogItems.filter(
      (i) =>
        i.cleanTitle.toLowerCase().includes(q) ||
        i.rawName.toLowerCase().includes(q) ||
        (i.year && String(i.year).includes(q))
    );
  }, [catalogItems, searchQuery]);

  // Current page title
  const currentTitle = useMemo(() => {
    if (typeof activeNav === 'string') {
      if (activeNav === 'home') return 'Home — All Movies & Series';
      if (activeNav === 'movies') return 'All Movies';
      if (activeNav === 'series') return 'All TV Shows & Series';
      if (activeNav === 'watchlist') return 'Watchlist';
      if (activeNav === 'recent') return 'Recently Played';
    }
    if (folderBreadcrumbs.length > 0) {
      return folderBreadcrumbs[folderBreadcrumbs.length - 1].label;
    }
    if (typeof activeNav === 'object' && activeNav.type === 'source') {
      const src = sources.find((s) => s.id === activeNav.sourceId);
      if (src) return src.name;
    }
    return 'Catalog';
  }, [folderBreadcrumbs, activeNav, sources]);

  const totalMoviesCount = useMemo(() => {
    const sum = sources
      .filter((s) => s.type === 'movies')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    return sum || 11575;
  }, [sources]);

  const totalSeriesCount = useMemo(() => {
    const sum = sources
      .filter((s) => s.type === 'series')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    return sum || 767;
  }, [sources]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090A0F] text-zinc-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* 1. Left Sidebar (Matching Screenshot 1, 2, 3) */}
      <Sidebar
        activeNav={activeNav}
        onNavigate={(nav) => {
          setActiveNav(nav);
          setSelectedMediaItem(null);
        }}
        sources={sources}
        moviesCount={totalMoviesCount}
        seriesCount={totalSeriesCount}
        recentCount={recentlyPlayed.length || 2}
        watchlistCount={watchlist.length}
        onAddSourceClick={() => {
          setActiveNav('settings');
          setSelectedMediaItem(null);
        }}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Center Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#090A0F] relative">
        {/* Top Search & Status Bar (Matching Screenshot 1, 2, 3) */}
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          syncProgress={{
            isSyncing: isLoading || isDeepScanning || isSyncingAll,
            current: 1215,
            total: 1534,
          }}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* View Switcher: Detail View, Settings, or Catalog Grid */}
        {selectedMediaItem ? (
          /* Media Detail View (Matching Screenshot 2) */
          <MediaDetailView
            item={selectedMediaItem.item}
            enrichedMeta={selectedMediaItem.meta}
            onBack={() => setSelectedMediaItem(null)}
            onPlayItem={async (video, playlist, subtitles, seasons) => {
              let playVideo = video;
              let playList = playlist;
              let playSubs = subtitles;
              let playSeasons = seasons;

              const isFolder =
                video.isDirectory ||
                video.url.endsWith('/') ||
                !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(video.url);

              if (isFolder) {
                const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
                if (cached) {
                  playVideo = { ...video, url: cached, isDirectory: false };
                  playList = [playVideo];
                } else {
                  try {
                    const resolved = await resolvePlayableFromFolder(video);
                    if (resolved.primaryVideo) {
                      playVideo = resolved.primaryVideo;
                      playList = resolved.allVideos.length > 0 ? resolved.allVideos : [resolved.primaryVideo];
                      playSubs = resolved.subtitles || subtitles;
                      playSeasons = resolved.seasons || seasons;
                      saveCachedPlayableUrl(video.id, resolved.primaryVideo.url);
                      saveCachedPlayableUrl(video.url, resolved.primaryVideo.url);
                    }
                  } catch {}
                }
              }

              recordRecentlyPlayed(playVideo, playList);
              setActivePlayerState({
                video: playVideo,
                playlist: playList.length > 0 ? playList : [playVideo],
                subtitles: playSubs,
                seasons: playSeasons,
              });
            }}
            isSaved={watchlistSet.has(selectedMediaItem.item.id)}
            onToggleWatchlist={toggleWatchlist}
          />
        ) : activeNav === 'settings' ? (
          /* Settings View (Matching Screenshot 1) */
          <SettingsView
            sources={sources}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
            onSyncSource={handleSyncSource}
            onSyncAll={handleSyncAll}
            isSyncingAll={isSyncingAll}
          />
        ) : (
          /* Catalog Browse Grid (Matching Screenshot 3) */
          <CatalogView
            title={currentTitle}
            items={displayedCatalog}
            isLoading={isLoading}
            isDeepScanning={isDeepScanning}
            deepScanProgressText={deepScanProgressText}
            breadcrumbs={folderBreadcrumbs}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            onOpenFolder={handleOpenFolder}
            onRefresh={() => {
              if (activeNav === 'home') {
                loadMultiSourceGroup(sources, 'Home — All Movies & Series', true);
              } else if (activeNav === 'movies') {
                loadMultiSourceGroup(sources.filter((s) => s.type === 'movies'), 'All Movies', false);
              } else if (activeNav === 'series') {
                loadMultiSourceGroup(sources.filter((s) => s.type === 'series'), 'All TV Shows & Series', true);
              } else {
                const crumb = folderBreadcrumbs[folderBreadcrumbs.length - 1];
                if (crumb) loadDirectory(crumb.url, isUnpackMode);
              }
            }}
            onSelectMedia={(item, meta) => {
              if (item.isDirectory && (item.mediaKind === 'year_folder' || item.mediaKind === 'category_folder')) {
                handleOpenFolder(item.url, item.cleanTitle);
              } else {
                setSelectedMediaItem({ item, meta });
              }
            }}
            onPlayDirect={handlePlayDirect}
            watchlistSet={watchlistSet}
            onToggleWatchlist={toggleWatchlist}
            hasSubfolders={hasSubfolders}
            isUnpackMode={isUnpackMode}
            onToggleUnpackMode={handleToggleUnpackMode}
            isHome={activeNav === 'home'}
            onNavigateSection={(sec) => {
              setActiveNav(sec);
            }}
          />
        )}

        {/* Floating Bottom-Right Yellow Sparkles Button (FAB) */}
        <button
          onClick={() => setIsAiModalOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 w-11 sm:w-12 h-11 sm:h-12 rounded-full bg-[#E5A00D] hover:bg-[#F59E0B] text-black flex items-center justify-center shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer z-40 border border-amber-300/30"
          title="Open AI Cinema Assistant"
        >
          <Sparkles className="w-5 h-5 fill-black" />
        </button>

        {/* Native Mobile Bottom Navigation Bar */}
        <MobileBottomNav
          activeNav={activeNav}
          onNavigate={(nav) => {
            setActiveNav(nav);
            setSelectedMediaItem(null);
          }}
          watchlistCount={watchlist.length}
        />
      </main>

      {/* Fullscreen Multi-Audio Cinema Player */}
      {activePlayerState && (
        <CinemaPlayer
          video={activePlayerState.video}
          playlist={activePlayerState.playlist}
          subtitles={activePlayerState.subtitles}
          seasons={activePlayerState.seasons}
          initialStartTime={activePlayerState.initialStartTime || 0}
          onClose={() => setActivePlayerState(null)}
          onSelectVideo={(nextVid) => {
            setActivePlayerState((prev) =>
              prev ? { ...prev, video: nextVid, initialStartTime: 0 } : null
            );
          }}
        />
      )}

      {/* Floating AI Cinema Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        libraryTitles={catalogItems.map((i) => i.cleanTitle)}
        onSelectTitle={(t) => {
          setSearchQuery(t);
          setIsAiModalOpen(false);
        }}
      />
    </div>
  );
}
