import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Info,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
  Film,
  Tv,
  Volume2,
  VolumeX,
  Sparkles,
  Flame,
  Clock,
  Layers,
  X,
  Globe,
  Smile,
  Clapperboard,
  Zap,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { EnrichedMetadata } from '../services/ftpClient';
import { MediaPosterCard } from './MediaPosterCard';
import { SeriesSeasonModal } from './SeriesSeasonModal';
import {
  SEED_HOLLYWOOD_CATALOG,
  SEED_BOLLYWOOD_CATALOG,
  SEED_SOUTH_CATALOG,
  SEED_ANIMATION_CATALOG,
  SEED_BANGLA_CATALOG,
  SEED_SERIES_CATALOG,
} from '../utils/seedData';

interface CinemaHomeProps {
  items: ParsedFtpItem[];
  isLoading: boolean;
  onSelectMedia: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onPlayDirect: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onOpenFolder?: (url: string, title: string) => void;
  watchlistSet: Set<string>;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onNavigateSection?: (section: 'movies' | 'series') => void;
}

// Curated high-definition movies and series organized into 6 thematic 2-Day Spotlight Cycles
export interface FeaturedNewMovie {
  id: string;
  cleanTitle: string;
  year: number;
  imdbRating: string;
  quality: string;
  audioTag: string;
  genres: string[];
  plot: string;
  backdropUrl: string;
  thumbUrl: string;
  runtime: string;
  streamUrl: string;
}

// 6 Thematic Spotlight Collections that automatically rotate every 1-2 days (48 hours)
export const FEATURED_SPOTLIGHT_SETS: { name: string; tag: string; movies: FeaturedNewMovie[] }[] = [
  {
    name: 'Epic Action & Sci-Fi Blockbusters',
    tag: 'Hollywood Premieres',
    movies: [
      {
        id: 'feat-dune-2',
        cleanTitle: 'Dune: Part Two',
        year: 2024,
        imdbRating: '8.8',
        quality: '4K Ultra HD • IMAX',
        audioTag: 'Dolby Atmos 7.1',
        genres: ['Sci-Fi', 'Action', 'Adventure'],
        plot: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family, facing a choice between love and the fate of the universe.',
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 46m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Substance-2024/The-Substance-2024-1080p-WEBDL-English_reencoded.mp4',
      },
      {
        id: 'feat-deadpool-wolverine',
        cleanTitle: 'Deadpool & Wolverine',
        year: 2024,
        imdbRating: '7.9',
        quality: '4K Ultra HD • HDR10',
        audioTag: 'Dual Audio (5.1)',
        genres: ['Action', 'Comedy', 'Sci-Fi'],
        plot: 'Deadpool is pulled from his quiet life by the Time Variance Authority and teams up with a cynical Wolverine on a mission that will change the history of the cinematic universe.',
        backdropUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 07m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Ministry-of-Ungentlemanly-Warfare-2024/The-Ministry-of-Ungentlemanly-Warfare-2024-1080p-English-DD-5-1--ESub_reencoded.mp4',
      },
      {
        id: 'feat-gladiator-2',
        cleanTitle: 'Gladiator II',
        year: 2025,
        imdbRating: '8.2',
        quality: '4K Ultra HD • IMAX',
        audioTag: 'Dolby Atmos',
        genres: ['Action', 'Adventure', 'Drama'],
        plot: 'Years after witnessing the death of Maximus, Lucius must enter the Colosseum after his home is conquered by tyrannical emperors who rule Rome with an iron fist.',
        backdropUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 28m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Ministry-of-Ungentlemanly-Warfare-2024/The-Ministry-of-Ungentlemanly-Warfare-2024-1080p-English-DD-5-1--ESub_reencoded.mp4',
      },
      {
        id: 'feat-avatar-water',
        cleanTitle: 'Avatar: The Way of Water',
        year: 2024,
        imdbRating: '8.1',
        quality: '4K Ultra HD • HDR',
        audioTag: 'Dolby Digital Plus 5.1',
        genres: ['Action', 'Sci-Fi', 'Fantasy'],
        plot: 'Jake Sully lives with his newfound family on the extrasolar moon Pandora. Once a familiar threat returns to finish what was previously started, Jake must work with Neytiri to protect their home.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '3h 12m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/Argylle-2024/Argylle-2024-WebRip-1080p-English_reencoded.mp4',
      },
      {
        id: 'feat-furiosa',
        cleanTitle: 'Furiosa: A Mad Max Saga',
        year: 2024,
        imdbRating: '7.7',
        quality: '1080p BluRay • HDR',
        audioTag: 'Atmos • Dual Audio',
        genres: ['Action', 'Adventure', 'Sci-Fi'],
        plot: 'The origin story of renegade warrior Furiosa before her encounter and teamup with Mad Max in Fury Road.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 28m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/Trap-2024/Trap-2024-1080P-WebDl-English-Msubs_reencoded.mp4',
      },
    ],
  },
  {
    name: 'Trending Korean Web Series & K-Dramas',
    tag: 'Asian Web Series',
    movies: [
      {
        id: 'feat-teach-you-lesson',
        cleanTitle: 'Teach You a Lesson',
        year: 2026,
        imdbRating: '9.4',
        quality: '1080p WEB-DL',
        audioTag: 'Multi Audio (Bengali + Hindi + Kor)',
        genres: ['Action', 'Drama', 'Crime'],
        plot: 'An elite former military officer becomes an educational rights inspector to eradicate classroom corruption and criminal gangs using uncompromising force.',
        backdropUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=300&auto=format&fit=crop&q=80',
        runtime: '10 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Lovely-Runner-2024/Season-1/Lovely-Runner-S01E01-1080p-Hindi-Korean-WEBDL_reencoded.mp4',
      },
      {
        id: 'feat-bloodhounds',
        cleanTitle: 'Bloodhounds',
        year: 2024,
        imdbRating: '8.4',
        quality: '1080p HDR',
        audioTag: 'Dual Audio (Hindi + Korean)',
        genres: ['Action', 'Crime', 'Thriller'],
        plot: 'Two rookie boxers team up with a benevolent moneylender to take down a ruthless loan shark who preys on the desperate and impoverished.',
        backdropUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80',
        runtime: '8 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Bloodhounds-2023/Season-1/Bloodhounds-S01E01-1080p-Hindi-English_reencoded.mp4',
      },
      {
        id: 'feat-lovely-horribly',
        cleanTitle: 'Lovely Horribly',
        year: 2018,
        imdbRating: '8.1',
        quality: '1080p HDTV',
        audioTag: 'Dual Audio (Hindi Dubbed)',
        genres: ['Comedy', 'Romance', 'Mystery'],
        plot: 'A top star and a drama writer who share a zero-sum fate where one can only be happy when the other is unfortunate collaborate on a mystery thriller series.',
        backdropUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&auto=format&fit=crop&q=80',
        runtime: '16 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Lovely-Runner-2024/Season-1/Lovely-Runner-S01E02-1080p-Hindi-Korean-WEBDL_reencoded.mp4',
      },
      {
        id: 'feat-trying-here',
        cleanTitle: 'We Are All Trying Here',
        year: 2026,
        imdbRating: '8.9',
        quality: '1080p WEB-DL',
        audioTag: 'Dual Audio',
        genres: ['Drama', 'Romance', 'Slice of Life'],
        plot: 'Four young professionals in Seoul navigate career breakthroughs, turbulent relationships, and unexpected friendships in a competitive modern society.',
        backdropUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=300&auto=format&fit=crop&q=80',
        runtime: '12 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Bloodhounds-2023/Season-1/Bloodhounds-S01E02-1080p-Hindi-English_reencoded.mp4',
      },
      {
        id: 'feat-perfect-crown',
        cleanTitle: 'Perfect Crown',
        year: 2026,
        imdbRating: '8.7',
        quality: '1080p WEB-DL',
        audioTag: 'Multi Audio',
        genres: ['Action', 'Thriller', 'Political'],
        plot: 'High-stakes battle for succession inside a modern dynasty with elite intelligence operations and covert betrayal.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '12 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Lovely-Runner-2024/Season-1/Lovely-Runner-S01E03-1080p-Hindi-Korean-WEBDL_reencoded.mp4',
      },
    ],
  },
  {
    name: 'Mega Indian & South Cinema Hits',
    tag: 'Bollywood & Tollywood',
    movies: [
      {
        id: 'feat-kalki',
        cleanTitle: 'Kalki 2898 AD',
        year: 2024,
        imdbRating: '8.2',
        quality: '4K Ultra HD • IMAX',
        audioTag: 'Dolby Atmos • Dual Audio',
        genres: ['Sci-Fi', 'Action', 'Mythology'],
        plot: 'A modern avatar of Vishnu descends to Earth in a dystopian post-apocalyptic future to protect the world from sinister dark forces.',
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '3h 01m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/2024/Article-370-2024/Article-370-2024-Hindi-1080p-WEBRip_reencoded.mp4',
      },
      {
        id: 'feat-fighter',
        cleanTitle: 'Fighter',
        year: 2024,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1 (Hindi Original)',
        genres: ['Action', 'Thriller', 'War'],
        plot: 'Top IAF aviators face imminent danger and internal conflicts while on a high-stakes aerial counter-terror operation.',
        backdropUrl: 'https://images.unsplash.com/photo-1519074069444-1ba4ea16e872?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1519074069444-1ba4ea16e872?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 46m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/2024/Bade-Miyan-Chote-Miyan-2024/Bade-Miyan-Chote-Miyan-2024-Hindi-1080p-WEBRip_reencoded.mp4',
      },
      {
        id: 'feat-salaar',
        cleanTitle: 'Salaar: Part 1 – Ceasefire',
        year: 2024,
        imdbRating: '8.1',
        quality: '1080p WEB-DL',
        audioTag: 'Hindi Dubbed 5.1',
        genres: ['Action', 'Crime', 'Drama'],
        plot: 'A gang leader makes a solemn promise to a dying friend and takes on rival criminal syndicates in the lawless city of Khansaar.',
        backdropUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 55m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/South%20Indian%20Movies/2024/Aavesham-%282024%29-Malayalam-1080p-WEB-DL/Aavesham%20%282024%29%20Malayalam%20%20WEB-DL%20-%201080p%20%20-%20ESub_reencoded.mp4',
      },
      {
        id: 'feat-water-2005',
        cleanTitle: 'Water',
        year: 2005,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Hindi • DD 5.1 Audio',
        genres: ['Drama', 'Romance'],
        plot: 'Deepa Mehta\'s critically acclaimed masterpiece examining faith, freedom, and love amidst social transformation in 1930s Varanasi.',
        backdropUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 57m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/2005/Water-2005/Water%202005%20Hindi%201080p%20Blu-Ray%20x264%20DD%205.1%20ESub-Masti_reencoded.mp4',
      },
      {
        id: 'feat-jawan',
        cleanTitle: 'Jawan',
        year: 2023,
        imdbRating: '8.0',
        quality: '1080p BluRay',
        audioTag: 'Dolby Atmos 5.1',
        genres: ['Action', 'Thriller'],
        plot: 'A high-octane emotional journey of a prison warden driven by a personal vendetta to right the wrongs of systemic injustice.',
        backdropUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 49m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/Hindi%20Movies/2024/Article-370-2024/Article-370-2024-Hindi-1080p-WEBRip_reencoded.mp4',
      },
    ],
  },
  {
    name: 'Animation & Animated Adventures',
    tag: 'Animated Sensations',
    movies: [
      {
        id: 'feat-wild-robot',
        cleanTitle: 'The Wild Robot',
        year: 2024,
        imdbRating: '8.5',
        quality: '4K Ultra HD',
        audioTag: 'Dolby Atmos • Dual Audio',
        genres: ['Animation', 'Adventure', 'Family'],
        plot: 'After a shipwreck, an intelligent robot named Roz is stranded on an uninhabited island and bonds with the island\'s animals while caring for an orphaned gosling.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 42m',
        streamUrl: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/%282024%29/Inside%20Out%202%20%282024%29%201080p%20WEB-DL/Inside.Out.2.2024.1080p.WEBDL.DDP5.1.H.264_reencoded.mp4',
      },
      {
        id: 'feat-inside-out-2',
        cleanTitle: 'Inside Out 2',
        year: 2024,
        imdbRating: '8.0',
        quality: '1080p BluRay',
        audioTag: 'Dual Audio (Hindi + English)',
        genres: ['Animation', 'Comedy', 'Family'],
        plot: 'Joy, Sadness, Anger, Fear and Disgust face unexpected headquarters renovations to make room for brand new emotions including Anxiety and Envy.',
        backdropUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 36m',
        streamUrl: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/%282024%29/Inside%20Out%202%20%282024%29%201080p%20WEB-DL/Inside.Out.2.2024.1080p.WEBDL.DDP5.1.H.264_reencoded.mp4',
      },
      {
        id: 'feat-kungfu-panda-4',
        cleanTitle: 'Kung Fu Panda 4',
        year: 2024,
        imdbRating: '7.6',
        quality: '1080p WEB-DL',
        audioTag: 'Dual Audio',
        genres: ['Animation', 'Action', 'Adventure'],
        plot: 'Po must train a new Dragon Warrior while battling The Chameleon, a shapeshifting sorceress summoning villainous spirits from the spirit realm.',
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 34m',
        streamUrl: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/%282024%29/Inside%20Out%202%20%282024%29%201080p%20WEB-DL/Inside.Out.2.2024.1080p.WEBDL.DDP5.1.H.264_reencoded.mp4',
      },
      {
        id: 'feat-spider-verse',
        cleanTitle: 'Spider-Man: Across the Spider-Verse',
        year: 2023,
        imdbRating: '8.7',
        quality: '4K Ultra HD',
        audioTag: 'Dolby Atmos 7.1',
        genres: ['Animation', 'Action', 'Sci-Fi'],
        plot: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.',
        backdropUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 20m',
        streamUrl: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/%282024%29/Inside%20Out%202%20%282024%29%201080p%20WEB-DL/Inside.Out.2.2024.1080p.WEBDL.DDP5.1.H.264_reencoded.mp4',
      },
      {
        id: 'feat-despicable-me-4',
        cleanTitle: 'Despicable Me 4',
        year: 2024,
        imdbRating: '7.5',
        quality: '1080p BluRay',
        audioTag: 'Dual Audio (5.1)',
        genres: ['Animation', 'Comedy', 'Family'],
        plot: 'Gru welcomes a new family member while going on the run from old nemesis Maxime Le Mal with the assistance of the Mega Minions.',
        backdropUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 35m',
        streamUrl: 'https://server5.ftpbd.net/FTP-5/Animation%20Movies/%282024%29/Inside%20Out%202%20%282024%29%201080p%20WEB-DL/Inside.Out.2.2024.1080p.WEBDL.DDP5.1.H.264_reencoded.mp4',
      },
    ],
  },
  {
    name: 'Critically Acclaimed Masterpieces',
    tag: 'Award Winners & Thrillers',
    movies: [
      {
        id: 'feat-oppenheimer',
        cleanTitle: 'Oppenheimer',
        year: 2024,
        imdbRating: '8.9',
        quality: '4K Ultra HD • 60fps',
        audioTag: 'DTS-HD Master 5.1',
        genres: ['Biography', 'Drama', 'History'],
        plot: 'The story of J. Robert Oppenheimer, the theoretical physicist who led the Manhattan Project and developed the first nuclear weapons that changed human history forever.',
        backdropUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=300&auto=format&fit=crop&q=80',
        runtime: '3h 00m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Substance-2024/The-Substance-2024-1080p-WEBDL-English_reencoded.mp4',
      },
      {
        id: 'feat-alien-romulus',
        cleanTitle: 'Alien: Romulus',
        year: 2024,
        imdbRating: '7.4',
        quality: '1080p BluRay',
        audioTag: 'Dolby Atmos • Dual Audio',
        genres: ['Sci-Fi', 'Horror', 'Thriller'],
        plot: 'Young space colonists scavenging an abandoned space station come face to face with the most terrifying and lethal life form in the universe.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 59m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/Trap-2024/Trap-2024-1080P-WebDl-English-Msubs_reencoded.mp4',
      },
      {
        id: 'feat-civil-war',
        cleanTitle: 'Civil War',
        year: 2024,
        imdbRating: '7.6',
        quality: '1080p WEB-DL',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Drama', 'Thriller'],
        plot: 'A journey across a dystopian future America, following a team of military-embedded journalists as they race against time to reach DC.',
        backdropUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 49m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Ministry-of-Ungentlemanly-Warfare-2024/The-Ministry-of-Ungentlemanly-Warfare-2024-1080p-English-DD-5-1--ESub_reencoded.mp4',
      },
      {
        id: 'feat-twisters',
        cleanTitle: 'Twisters',
        year: 2024,
        imdbRating: '7.5',
        quality: '1080p BluRay',
        audioTag: 'Dolby Atmos',
        genres: ['Action', 'Adventure', 'Thriller'],
        plot: 'Kate Cooper, a former storm chaser haunted by a devastating encounter with a tornado, is lured back to the open plains by her friend Javi to test a groundbreaking new tracking system.',
        backdropUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 02m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/Argylle-2024/Argylle-2024-WebRip-1080p-English_reencoded.mp4',
      },
      {
        id: 'feat-jiaoren',
        cleanTitle: 'Jiaoren of the South China Sea',
        year: 2021,
        imdbRating: '7.6',
        quality: '1080p WEB-DL',
        audioTag: 'Dual Audio (Hindi + Chinese)',
        genres: ['Action', 'Fantasy', 'Adventure'],
        plot: 'Deep in the mysterious oceanic waters of the South China Sea, adventurers brave mythical aquatic creatures and sunken treasures.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 38m',
        streamUrl: 'https://server3.ftpbd.net/FTP-3/Bangla%20Collection/BANGLA/Kolkata-Bangla-Movies/%282024%29/Bohurupi-2024/Bohurupi-2024-Bengali-1080p-WEBDL_reencoded.mp4',
      },
    ],
  },
  {
    name: 'All-Time Fan Classics & Epic Series',
    tag: 'Timeless Cinema',
    movies: [
      {
        id: 'feat-interstellar',
        cleanTitle: 'Interstellar',
        year: 2014,
        imdbRating: '8.7',
        quality: '4K Ultra HD • IMAX',
        audioTag: 'DTS-HD 5.1 • Dual Audio',
        genres: ['Sci-Fi', 'Adventure', 'Drama'],
        plot: 'When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft along with a team of researchers to find a new planet for humans.',
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 49m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Substance-2024/The-Substance-2024-1080p-WEBDL-English_reencoded.mp4',
      },
      {
        id: 'feat-topgun-maverick',
        cleanTitle: 'Top Gun: Maverick',
        year: 2022,
        imdbRating: '8.3',
        quality: '4K Ultra HD • HDR',
        audioTag: 'Dolby Atmos 7.1',
        genres: ['Action', 'Drama'],
        plot: 'After thirty years, Maverick is still pushing the envelope as a top naval aviator, but must confront ghosts of his past when he leads TOP GUN\'s elite graduates on an impossible mission.',
        backdropUrl: 'https://images.unsplash.com/photo-1519074069444-1ba4ea16e872?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1519074069444-1ba4ea16e872?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 10m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/The-Ministry-of-Ungentlemanly-Warfare-2024/The-Ministry-of-Ungentlemanly-Warfare-2024-1080p-English-DD-5-1--ESub_reencoded.mp4',
      },
      {
        id: 'feat-batman',
        cleanTitle: 'The Batman',
        year: 2022,
        imdbRating: '7.8',
        quality: '4K Ultra HD',
        audioTag: 'Dolby Atmos',
        genres: ['Action', 'Crime', 'Drama'],
        plot: 'When a sadistic serial killer begins murdering key political figures in Gotham, the Batman is forced to investigate the city\'s hidden corruption.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 56m',
        streamUrl: 'https://server2.ftpbd.net/FTP-2/English%20Movies/2024/Argylle-2024/Argylle-2024-WebRip-1080p-English_reencoded.mp4',
      },
      {
        id: 'feat-where-stars-land',
        cleanTitle: 'Where Stars Land',
        year: 2018,
        imdbRating: '8.2',
        quality: '1080p HDTV',
        audioTag: 'Dual Audio',
        genres: ['Romance', 'Drama', 'Mystery'],
        plot: 'Heartwarming romantic story centered on the passenger service department of Incheon International Airport.',
        backdropUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=300&auto=format&fit=crop&q=80',
        runtime: '16 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Lovely-Runner-2024/Season-1/Lovely-Runner-S01E01-1080p-Hindi-Korean-WEBDL_reencoded.mp4',
      },
      {
        id: 'feat-yumis-cells',
        cleanTitle: "Yumi's Cells",
        year: 2021,
        imdbRating: '8.4',
        quality: '1080p WEB-DL',
        audioTag: 'Multi Audio',
        genres: ['Comedy', 'Romance', 'Animation'],
        plot: 'A psychological romance story told through the perspective of the protagonist\'s brain cells in her head controlling her thoughts, feelings and actions.',
        backdropUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&auto=format&fit=crop&q=80',
        runtime: '28 Episodes',
        streamUrl: 'https://server4.ftpbd.net/FTP-4/English-Foreign-TV-Series/Bloodhounds-2023/Season-1/Bloodhounds-S01E01-1080p-Hindi-English_reencoded.mp4',
      },
    ],
  },
];

// Helper to calculate the active 2-day rotation index (0 to 5)
export function getTwoDayCycleIndex(offset = 0): number {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const cycle = Math.floor(Date.now() / TWO_DAYS_MS) + offset;
  return Math.abs(cycle) % FEATURED_SPOTLIGHT_SETS.length;
}

export const NetflixHome: React.FC<CinemaHomeProps> = ({
  items,
  isLoading,
  onSelectMedia,
  onPlayDirect,
  onOpenFolder,
  watchlistSet,
  onToggleWatchlist,
  onNavigateSection,
}) => {
  // 1-2 Days rotation state: offset allows manual cycling while maintaining automatic 48h rotation
  const [cycleOffset, setCycleOffset] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [quickInfoItem, setQuickInfoItem] = useState<{ item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null>(null);
  const [seriesModalItem, setSeriesModalItem] = useState<ParsedFtpItem | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentCycleIndex = useMemo(() => getTwoDayCycleIndex(cycleOffset), [cycleOffset]);
  const currentSet = FEATURED_SPOTLIGHT_SETS[currentCycleIndex] || FEATURED_SPOTLIGHT_SETS[0];
  const activeFeaturedMovies = currentSet.movies;

  // Calculate approximate hours remaining until the next automatic 2-day rotation
  const rotationHoursRemaining = useMemo(() => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const msIntoCycle = Date.now() % TWO_DAYS_MS;
    return Math.max(1, Math.round((TWO_DAYS_MS - msIntoCycle) / (60 * 60 * 1000)));
  }, [currentCycleIndex]);

  const handleNextSpotlightCycle = () => {
    setCycleOffset((prev) => prev + 1);
    setFeaturedIndex(0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setFeaturedIndex((prev) => (prev + 1) % activeFeaturedMovies.length);
      } else {
        setFeaturedIndex((prev) => (prev - 1 + activeFeaturedMovies.length) % activeFeaturedMovies.length);
      }
    }
    setTouchStartX(null);
  };

  // Auto-rotate hero spotlight every 10 seconds within the active 2-day collection
  useEffect(() => {
    const timer = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % activeFeaturedMovies.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [activeFeaturedMovies.length]);

  const currentHero = activeFeaturedMovies[featuredIndex] || activeFeaturedMovies[0];

  // Convert currentHero to a playable ParsedFtpItem with real video stream
  const heroFtpItem: ParsedFtpItem = useMemo(() => {
    // If library has a movie matching this title, link to its real FTP item
    const matched = items.find(
      (i) =>
        !i.isDirectory &&
        (i.cleanTitle.toLowerCase().includes(currentHero.cleanTitle.toLowerCase()) ||
          currentHero.cleanTitle.toLowerCase().includes(i.cleanTitle.toLowerCase()))
    );

    if (matched) {
      return {
        ...matched,
        plot: matched.plot || currentHero.plot,
        imdbRating: matched.imdbRating || currentHero.imdbRating,
        year: matched.year || currentHero.year,
        quality: matched.quality || currentHero.quality,
        audioTag: matched.audioTag || currentHero.audioTag,
        backdropUrl: currentHero.backdropUrl,
      };
    }

    return {
      id: currentHero.id,
      cleanTitle: currentHero.cleanTitle,
      rawName: `${currentHero.cleanTitle}.${currentHero.year}.${currentHero.quality}`,
      url: currentHero.streamUrl,
      isDirectory: false,
      mediaKind: 'movie',
      year: currentHero.year,
      imdbRating: currentHero.imdbRating,
      quality: currentHero.quality,
      audioTag: currentHero.audioTag,
      plot: currentHero.plot,
      posterUrl: currentHero.backdropUrl,
      backdropUrl: currentHero.backdropUrl,
      sizeFormatted: '4.2 GB',
      lastModified: '2026-06-01',
    };
  }, [currentHero, items]);

  const isHeroSaved = watchlistSet.has(heroFtpItem.id);

  // -------------------------------------------------------------------
  // CATEGORIZATION: Group items cleanly by each movie & series category
  // -------------------------------------------------------------------

  // 1. New Releases (2024, 2025, 2026)
  const newReleases = useMemo(() => {
    return items
      .filter((i) => i.year && i.year >= 2024 && !i.cleanTitle.toLowerCase().startsWith('season '))
      .slice(0, 24);
  }, [items]);

  // 2. Hollywood (English Movies) - Strictly English Movies Only
  const hollywoodMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode' || i.season !== undefined) {
        return false;
      }
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();

      // Strictly exclude series, Korean, Hindi, Bangla, Animation
      if (
        url.includes('tv-series') ||
        url.includes('tv series') ||
        url.includes('korean') ||
        url.includes('bangla') ||
        url.includes('kolkata') ||
        url.includes('hindi') ||
        url.includes('south indian') ||
        url.includes('animation')
      ) {
        return false;
      }
      if (
        src.includes('series') ||
        src.includes('tv') ||
        src.includes('korean') ||
        src.includes('bangla') ||
        src.includes('hindi') ||
        src.includes('south') ||
        src.includes('animation')
      ) {
        return false;
      }
      if (raw.includes('korean') || raw.includes('bollywood') || raw.includes('south')) {
        return false;
      }

      return (
        url.includes('english%20movies') ||
        url.includes('english movies') ||
        src.includes('english movies') ||
        i.mediaKind === 'movie'
      );
    });

    // Merge with pristine Hollywood seed blockbusters so this row is always rich and authentic
    const merged = [...list];
    for (const h of SEED_HOLLYWOOD_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === h.cleanTitle.toLowerCase())) {
        merged.push(h);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 3. Bollywood (Hindi Movies)
  const bollywoodMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        (url.includes('hindi movies') || src.includes('hindi movies') || raw.includes('bollywood')) &&
        !url.includes('south indian') &&
        !url.includes('hindi dubbed')
      );
    });

    const merged = [...list];
    for (const b of SEED_BOLLYWOOD_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === b.cleanTitle.toLowerCase())) {
        merged.push(b);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 4. South Indian (Hindi Dubbed)
  const southMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('south indian') ||
        url.includes('hindi dubbed') ||
        src.includes('south') ||
        src.includes('dubbed') ||
        raw.includes('south') ||
        raw.includes('tamil') ||
        raw.includes('telugu')
      );
    });

    const merged = [...list];
    for (const s of SEED_SOUTH_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 5. Korean TV & Web Series
  const koreanSeries = useMemo(() => {
    const list = items.filter((i) => {
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        (url.includes('korean') || src.includes('korean') || raw.includes('korean')) &&
        !raw.startsWith('season ')
      );
    });

    const merged = [...list];
    for (const s of SEED_SERIES_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 6. Kolkata & Bangla Movies
  const banglaMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('bangla') ||
        url.includes('kolkata') ||
        src.includes('bangla') ||
        src.includes('kolkata') ||
        raw.includes('bangla')
      );
    });

    const merged = [...list];
    for (const b of SEED_BANGLA_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === b.cleanTitle.toLowerCase())) {
        merged.push(b);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 7. Animation & Anime Movies
  const animationMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('animation') ||
        url.includes('anime') ||
        src.includes('animation') ||
        raw.includes('animation') ||
        raw.includes('animated')
      );
    });

    const merged = [...list];
    for (const a of SEED_ANIMATION_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === a.cleanTitle.toLowerCase())) {
        merged.push(a);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 8. Foreign Language Movies
  const foreignMovies = useMemo(() => {
    return items
      .filter((i) => {
        if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
        const url = (i.url || '').toLowerCase();
        const src = (i.sourceServerName || '').toLowerCase();
        return url.includes('foreign') || src.includes('foreign');
      })
      .slice(0, 24);
  }, [items]);

  // 9. All TV Shows & Complete Series (No Season 1 duplicates)
  const allSeries = useMemo(() => {
    const list = items.filter(
      (i) =>
        (i.mediaKind === 'series' || i.season !== undefined) &&
        !i.cleanTitle.toLowerCase().startsWith('season ')
    );

    const merged = [...list];
    for (const s of SEED_SERIES_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return merged.slice(0, 24);
  }, [items]);

  // 10. Action & High-Octane Thrillers
  const actionMovies = useMemo(() => {
    return items
      .filter((i) => {
        const str = `${i.cleanTitle} ${i.rawName} ${(i.genres || []).join(' ')}`.toLowerCase();
        return /\b(action|war|fight|mission|combat|agent|police|gangster|gun|furious|thriller)\b/i.test(str);
      })
      .slice(0, 24);
  }, [items]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#090A0F] pb-24 text-zinc-100 select-none">
      {/* 1. CINEMATIC HERO SECTION: NEW MOVIE SPOTLIGHT */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full h-[58vh] min-h-[440px] sm:min-h-[480px] max-h-[720px] bg-[#090A0F] overflow-hidden group touch-pan-y"
      >
        {/* Backdrop Image with Cinema Vignette Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={currentHero.backdropUrl}
            alt={currentHero.cleanTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center transform scale-100 transition-all duration-1000 ease-out filter brightness-80"
          />
          {/* Deep dark gradient overlays for sharp typography readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#090A0F] via-[#090A0F]/75 to-transparent w-full md:w-3/4" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/90 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#090A0F]/80 to-transparent" />
        </div>

        {/* Hero Information */}
        <div className="relative z-10 flex flex-col justify-end h-full px-4 sm:px-10 lg:px-14 pb-12 sm:pb-14 max-w-4xl space-y-3">
          {/* 2-Day Automatic Rotation Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-bold text-[10px] sm:text-[11px] tracking-wider uppercase text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full shadow-sm">
              <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>2-DAY SPOTLIGHT • SET {currentCycleIndex + 1}/6</span>
            </span>
            <span className="text-[11px] font-semibold text-amber-400/90 hidden sm:inline bg-black/40 px-2.5 py-0.5 rounded border border-amber-500/20">
              {currentSet.name}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 hidden md:inline">
              • Auto-rotates every 48h (~{rotationHoursRemaining}h left)
            </span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl line-clamp-2 leading-tight">
            {currentHero.cleanTitle}
          </h1>

          {/* Metadata Badges: IMDb, Year, Duration, 4K, Audio */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-300">
            <div className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{currentHero.imdbRating}</span>
            </div>
            <span className="text-zinc-300 font-semibold">{currentHero.year}</span>
            <span className="text-zinc-400 font-mono text-xs">{currentHero.runtime}</span>
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold border border-zinc-600 text-zinc-200 rounded tracking-wider bg-black/40">
              {currentHero.quality}
            </span>
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold bg-white/10 text-zinc-300 rounded">
              {currentHero.audioTag}
            </span>
          </div>

          {/* Plot Synopsis */}
          <p className="text-xs sm:text-sm lg:text-base text-zinc-300 line-clamp-2 sm:line-clamp-3 max-w-xl drop-shadow font-normal leading-relaxed">
            {currentHero.plot}
          </p>

          {/* Action Buttons: Play + Details + Watchlist + Manual Shuffle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 w-full sm:w-auto">
            <button
              onClick={() => onPlayDirect(heroFtpItem)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 sm:px-8 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs sm:text-base rounded-xl shadow-xl shadow-amber-500/20 transition-all cursor-pointer min-h-[44px]"
            >
              <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-black text-black" />
              <span>Watch Now</span>
            </button>

            <button
              onClick={() => setQuickInfoItem({ item: heroFtpItem })}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-zinc-800/80 hover:bg-zinc-700 active:scale-95 text-white font-semibold text-xs sm:text-base rounded-xl backdrop-blur-md transition-all cursor-pointer border border-white/15 min-h-[44px]"
            >
              <Info className="w-4 sm:w-5 h-4 sm:h-5 text-zinc-300" />
              <span>Details</span>
            </button>

            <button
              onClick={() => onToggleWatchlist(heroFtpItem)}
              className={`p-3 rounded-xl border transition-all cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                isHeroSaved
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-black/50 border-white/20 text-white hover:border-white hover:bg-black/70'
              }`}
              title={isHeroSaved ? 'In Watchlist' : 'Add to Watchlist'}
            >
              {isHeroSaved ? <Check className="w-4 sm:w-5 h-4 sm:h-5" /> : <Plus className="w-4 sm:w-5 h-4 sm:h-5" />}
            </button>

            <button
              onClick={handleNextSpotlightCycle}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-amber-300 text-xs font-semibold rounded-xl border border-amber-400/30 flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              title="Shuffle to next 2-day spotlight set"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Shuffle Spotlight (Next Set)</span>
              <span className="sm:hidden">Next Set</span>
            </button>
          </div>

          {/* Mobile Dot Indicators */}
          <div className="flex md:hidden items-center justify-center gap-1.5 pt-2">
            {activeFeaturedMovies.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setFeaturedIndex(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === featuredIndex ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/30'
                }`}
                aria-label={`Go to featured movie ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Right Side: Interactive New Movie Suggestions Switcher */}
        <div className="absolute right-4 sm:right-10 bottom-14 z-20 hidden md:flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>2-Day Spotlight ({currentCycleIndex + 1}/6)</span>
            </span>
            <button
              onClick={handleNextSpotlightCycle}
              className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/25 px-2 py-0.5 rounded border border-amber-500/30 transition-colors cursor-pointer"
              title="Advance to next 2-day featured set"
            >
              Change Set
            </button>
          </div>

          {/* Mini Thumbnail Row */}
          <div className="flex items-center gap-2 p-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/15 shadow-2xl">
            {activeFeaturedMovies.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => setFeaturedIndex(idx)}
                className={`relative w-14 sm:w-16 h-10 sm:h-11 rounded-lg overflow-hidden border-2 transition-all cursor-pointer group/thumb ${
                  idx === featuredIndex
                    ? 'border-amber-400 scale-105 shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
                    : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/40'
                }`}
                title={m.cleanTitle}
              >
                <img
                  src={m.thumbUrl}
                  alt={m.cleanTitle}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {idx === featuredIndex && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-amber-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. CATEGORIZED HORIZONTAL MOVIE ROWS */}
      <div className="relative z-20 -mt-6 sm:-mt-8 space-y-9 sm:space-y-11">
        {/* ROW 1: LATEST RELEASES & BLOCKBUSTERS (2024-2026) */}
        {newReleases.length > 0 && (
          <CinemaCategoryRow
            title="Latest Releases & Blockbusters"
            icon={<Flame className="w-5 h-5 text-amber-400 fill-amber-400/20" />}
            countBadge={`${newReleases.length} New Titles`}
            items={newReleases}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 2: HOLLYWOOD (ENGLISH MOVIES) */}
        {hollywoodMovies.length > 0 && (
          <CinemaCategoryRow
            title="Hollywood (English Movies)"
            icon={<Clapperboard className="w-5 h-5 text-blue-400" />}
            countBadge="English Cinema"
            items={hollywoodMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('movies')}
          />
        )}

        {/* ROW 3: BOLLYWOOD (HINDI MOVIES) */}
        {bollywoodMovies.length > 0 && (
          <CinemaCategoryRow
            title="Bollywood (Hindi Movies)"
            icon={<Film className="w-5 h-5 text-rose-400" />}
            countBadge="Hindi Hits"
            items={bollywoodMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 4: SOUTH INDIAN MOVIES (HINDI DUBBED) */}
        {southMovies.length > 0 && (
          <CinemaCategoryRow
            title="South Indian Cinema (Hindi Dubbed)"
            icon={<Zap className="w-5 h-5 text-amber-400 fill-amber-400/20" />}
            countBadge="Dual Audio & Dubbed"
            items={southMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 5: KOREAN TV & K-DRAMA SERIES */}
        {koreanSeries.length > 0 && (
          <CinemaCategoryRow
            title="Korean TV & K-Drama Series"
            icon={<Tv className="w-5 h-5 text-cyan-400" />}
            countBadge="Asian Drama"
            items={koreanSeries}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('series')}
          />
        )}

        {/* ROW 6: KOLKATA & BANGLA CINEMA */}
        {banglaMovies.length > 0 && (
          <CinemaCategoryRow
            title="Kolkata & Bangla Cinema"
            icon={<Film className="w-5 h-5 text-emerald-400" />}
            countBadge="Bangla Movies"
            items={banglaMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 7: ANIMATION & ANIME MOVIES */}
        {animationMovies.length > 0 && (
          <CinemaCategoryRow
            title="Animation & Anime Movies"
            icon={<Smile className="w-5 h-5 text-purple-400" />}
            countBadge="Animated Features"
            items={animationMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 8: FOREIGN LANGUAGE CINEMA */}
        {foreignMovies.length > 0 && (
          <CinemaCategoryRow
            title="Foreign Language Cinema"
            icon={<Globe className="w-5 h-5 text-indigo-400" />}
            countBadge="World Cinema"
            items={foreignMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 9: ALL TV SHOWS & COMPLETE SERIES */}
        {allSeries.length > 0 && (
          <CinemaCategoryRow
            title="TV Shows & Complete Web Series"
            icon={<Tv className="w-5 h-5 text-cyan-400" />}
            countBadge="Full Seasons"
            items={allSeries}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('series')}
          />
        )}

        {/* ROW 10: ACTION & HIGH-OCTANE THRILLERS */}
        {actionMovies.length > 0 && (
          <CinemaCategoryRow
            title="Action & High-Octane Thrillers"
            icon={<Flame className="w-5 h-5 text-orange-400" />}
            countBadge="Action Movies"
            items={actionMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}
      </div>

      {/* 3. DETAILS & INFO MODAL */}
      {quickInfoItem && (
        <CinemaDetailModal
          item={quickInfoItem.item}
          meta={quickInfoItem.meta}
          isSaved={watchlistSet.has(quickInfoItem.item.id)}
          onClose={() => setQuickInfoItem(null)}
          onPlayDirect={onPlayDirect}
          onToggleWatchlist={onToggleWatchlist}
          onBrowseSeries={(item) => {
            setQuickInfoItem(null);
            setSeriesModalItem(item);
          }}
        />
      )}

      {/* 4. SERIES SEASON & EPISODE BROWSER MODAL */}
      {seriesModalItem && (
        <SeriesSeasonModal
          seriesItem={seriesModalItem}
          onClose={() => setSeriesModalItem(null)}
          onPlayEpisode={(ep) => {
            onPlayDirect(ep);
          }}
          onOpenRawFolder={(url) => {
            if (onOpenFolder) onOpenFolder(url, seriesModalItem.cleanTitle);
          }}
        />
      )}
    </div>
  );
};

// -------------------------------------------------------------
// REUSABLE CATEGORY CAROUSEL ROW COMPONENT
// -------------------------------------------------------------
interface CinemaCategoryRowProps {
  title: string;
  icon: React.ReactNode;
  countBadge?: string;
  items: ParsedFtpItem[];
  watchlistSet: Set<string>;
  onSelectMedia: (item: ParsedFtpItem) => void;
  onPlayDirect: (item: ParsedFtpItem) => void;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onOpenFolder?: (url: string, title: string) => void;
  onExploreAll?: () => void;
}

const CinemaCategoryRow: React.FC<CinemaCategoryRowProps> = ({
  title,
  icon,
  countBadge,
  items,
  watchlistSet,
  onSelectMedia,
  onPlayDirect,
  onToggleWatchlist,
  onOpenFolder,
  onExploreAll,
}) => {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setCanScrollLeft(scrollLeft > 20);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 20);
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const offset = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative group/row px-4 sm:px-10 lg:px-14">
      {/* Category Row Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
            {icon}
          </div>
          <div>
            <h2 className="text-base sm:text-xl font-display font-bold text-white tracking-tight">
              {title}
            </h2>
          </div>
          {countBadge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 hidden sm:inline">
              {countBadge}
            </span>
          )}
        </div>

        {onExploreAll && (
          <button
            onClick={onExploreAll}
            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Left Chevron Button (Desktop only, mobile uses native touch swipe) */}
      {canScrollLeft && (
        <button
          onClick={() => handleScroll('left')}
          className="hidden md:flex absolute left-0 sm:left-4 top-1/2 -translate-y-1/2 z-30 h-4/5 w-10 sm:w-12 bg-black/80 hover:bg-black/95 text-white items-center justify-center rounded-r-xl transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer shadow-2xl border-r border-white/10"
          title="Scroll Left"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Right Chevron Button (Desktop only) */}
      {canScrollRight && (
        <button
          onClick={() => handleScroll('right')}
          className="hidden md:flex absolute right-0 sm:right-4 top-1/2 -translate-y-1/2 z-30 h-4/5 w-10 sm:w-12 bg-black/80 hover:bg-black/95 text-white items-center justify-center rounded-l-xl transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer shadow-2xl border-l border-white/10"
          title="Scroll Right"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Horizontal Carousel */}
      <div
        ref={rowRef}
        onScroll={checkScroll}
        className="flex gap-2.5 sm:gap-4 overflow-x-auto scrollbar-none scroll-smooth py-2 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <div key={item.id} className="flex-shrink-0 w-[130px] sm:w-44 md:w-48 active:scale-95 transition-transform duration-150">
            <MediaPosterCard
              item={item}
              isSaved={watchlistSet.has(item.id)}
              onSelect={onSelectMedia}
              onPlayDirect={onPlayDirect}
              onOpenFolder={onOpenFolder}
              onToggleWatchlist={onToggleWatchlist}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// DETAILS & INFO MODAL
// -------------------------------------------------------------
interface CinemaDetailModalProps {
  item: ParsedFtpItem;
  meta?: EnrichedMetadata | null;
  isSaved: boolean;
  onClose: () => void;
  onPlayDirect: (item: ParsedFtpItem) => void;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onBrowseSeries: (item: ParsedFtpItem) => void;
}

const CinemaDetailModal: React.FC<CinemaDetailModalProps> = ({
  item,
  meta,
  isSaved,
  onClose,
  onPlayDirect,
  onToggleWatchlist,
  onBrowseSeries,
}) => {
  const isSeries =
    item.mediaKind === 'series' ||
    item.mediaKind === 'episode' ||
    item.cleanTitle.toLowerCase().includes('season');

  const bgImage = meta?.backdropUrl || meta?.posterUrl || item.posterUrl || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#141722] rounded-2xl overflow-hidden shadow-2xl border border-white/10 text-white my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20 shadow-lg"
          title="Close"
        >
          <X className="w-4 sm:w-5 h-4 sm:h-5" />
        </button>

        {/* Modal Backdrop Banner */}
        <div className="relative w-full h-56 sm:h-80 bg-[#0C0E14]">
          <img
            src={bgImage}
            alt={item.cleanTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141722] via-[#141722]/50 to-transparent" />

          {/* Modal Header Actions */}
          <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6">
            <h2 className="text-xl sm:text-4xl font-black text-white drop-shadow-xl line-clamp-2">
              {item.cleanTitle}
            </h2>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3">
              <button
                onClick={() => {
                  onClose();
                  onPlayDirect(item);
                }}
                className="flex items-center gap-2 px-5 sm:px-7 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs sm:text-base rounded-lg shadow-xl shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-black text-black" />
                <span>Play Now</span>
              </button>

              <button
                onClick={() => onToggleWatchlist(item)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                  isSaved
                    ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                    : 'bg-[#222738] border-white/20 text-white hover:border-white'
                }`}
                title={isSaved ? 'In Watchlist' : 'Add to Watchlist'}
              >
                {isSaved ? <Check className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400" /> : <Plus className="w-4 sm:w-5 h-4 sm:h-5" />}
              </button>

              {isSeries && (
                <button
                  onClick={() => onBrowseSeries(item)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-[#252E42] hover:bg-[#2F3A54] text-white font-medium text-xs sm:text-sm rounded-lg transition-all cursor-pointer ml-auto border border-white/10"
                >
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Episodes</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {/* Left Details */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-zinc-300">
              {item.imdbRating && (
                <span className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{item.imdbRating} IMDb</span>
                </span>
              )}
              {item.year && <span className="font-semibold text-zinc-200">{item.year}</span>}
              <span className="px-1.5 py-0.5 text-[10px] font-bold border border-zinc-600 rounded bg-white/5">
                {item.quality || '1080p HD'}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white/10 rounded">
                {item.audioTag || 'Stereo / 5.1'}
              </span>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed font-normal">
              {meta?.plot ||
                item.plot ||
                `Stream ${item.cleanTitle} directly with zero buffering from local BDIX cache. High bitrate audio & crystal-clear picture.`}
            </p>

            {/* Direct stream URL info */}
            <div className="p-3 bg-[#0C0E14] border border-white/5 rounded-xl text-xs space-y-1">
              <span className="text-zinc-500 font-mono text-[11px] block">Stream URL:</span>
              <p className="text-zinc-300 font-mono break-all line-clamp-1">{item.url}</p>
            </div>
          </div>

          {/* Right Metadata */}
          <div className="space-y-3.5 text-xs text-zinc-400 border-t md:border-t-0 md:border-l md:border-white/10 md:pl-6 pt-4 md:pt-0">
            <div>
              <span className="text-zinc-500 block mb-0.5">Audio Tracks:</span>
              <span className="text-zinc-200">{item.audioTag || 'Dual Audio (Hindi + English)'}</span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">Genres:</span>
              <span className="text-zinc-200">
                {item.genres?.join(', ') || 'Action, Drama, Thriller'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">Format:</span>
              <span className="text-zinc-200 font-mono">{item.quality || '1080p WEB-DL'}</span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">BDIX Server:</span>
              <span className="text-amber-400 font-medium">
                {item.sourceServerName || 'Fast Local CDN'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
