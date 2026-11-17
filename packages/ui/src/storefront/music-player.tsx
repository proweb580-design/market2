'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatDuration } from '../lib/format';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { PanelView } from './media';
import { useStore } from './store-context';
import type { Track } from './types';

function Disc({ track, spinning, className }: { track: Pick<Track, 'cover'>; spinning: boolean; className?: string }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-full', className)}>
      <PanelView panel={track.cover} className={cn('animate-vinyl', !spinning && '[animation-play-state:paused]')} />
      <span className="absolute inset-[38%] rounded-full border border-white/20 bg-black/60" />
    </span>
  );
}

/** Reference §2.8: mini player docked bottom-left, expands into a modal with a playlist. */
export function MusicPlayer() {
  const { store, overlay, setOverlay } = useStore();
  const tracks = store.playlist;
  const audio = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const track = tracks[index];
  const playable = Boolean(track?.src);

  useEffect(() => {
    const el = audio.current;
    if (!el || !playable) return;
    el.volume = volume;
    if (playing) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, index, volume, playable]);

  if (!track) return null;

  const go = (d: number) => {
    setIndex((index + d + tracks.length) % tracks.length);
    setTime(0);
  };
  const controls = (size: 'sm' | 'lg') => {
    const btn = cn('inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-60 disabled:opacity-30', size === 'lg' ? 'size-10' : 'size-7');
    const icon = size === 'lg' ? 'size-4' : 'size-3';
    return (
      <div className="flex items-center gap-1">
        <button type="button" className={btn} aria-label="Previous track" onClick={() => go(-1)}>
          <SkipBack className={icon} />
        </button>
        <button
          type="button"
          className={cn(btn, size === 'lg' && 'border border-border')}
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!playable}
          title={playable ? undefined : 'No audio uploaded for this track yet'}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause className={icon} /> : <Play className={icon} />}
        </button>
        <button type="button" className={btn} aria-label="Next track" onClick={() => go(1)}>
          <SkipForward className={icon} />
        </button>
      </div>
    );
  };

  return (
    <>
      {playable && (
        <audio
          ref={audio}
          src={track.src}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onEnded={() => go(1)}
          preload="none"
        />
      )}

      <div className="fixed bottom-4 left-4 z-30 flex items-center gap-2 rounded-full border border-border bg-background/80 py-1.5 pl-1.5 pr-2 shadow-sm backdrop-blur-md max-md:bottom-[calc(env(safe-area-inset-bottom)+5rem)] max-sm:left-3">
        <button type="button" onClick={() => setOverlay('player')} className="flex items-center gap-2 text-left" aria-label="Open music player">
          <Disc track={track} spinning={playing} className="size-8" />
          <span className="max-sm:hidden">
            <span className="label-xs block font-bold">{track.title}</span>
            <span className="label-xs block text-muted-foreground">{track.artist}</span>
          </span>
        </button>
        <span className="max-sm:hidden">{controls('sm')}</span>
      </div>

      <Dialog open={overlay === 'player'} onOpenChange={(open) => setOverlay(open ? 'player' : null)}>
        <DialogContent className="max-w-md gap-0 rounded-lg p-6">
          <div className="flex items-center gap-5">
            <Disc track={track} spinning={playing} className="size-28" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="label-xs font-bold">{track.title}</DialogTitle>
              <DialogDescription className="label-xs text-muted-foreground">{track.artist}</DialogDescription>
              <div className="mt-4 h-px w-full bg-border">
                <div className="h-px bg-foreground" style={{ width: `${Math.min(100, (time / track.durationSec) * 100)}%` }} />
              </div>
              <div className="label-xs mt-1 flex justify-between tabular-nums text-muted-foreground">
                <span>{formatDuration(time)}</span>
                <span>{formatDuration(track.durationSec)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {controls('lg')}
                <label className="flex items-center gap-1.5" title="Volume">
                  <Volume2 className="size-3.5" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    aria-label="Volume"
                    className="w-16 accent-current"
                  />
                </label>
              </div>
            </div>
          </div>
          {!playable && <p className="mt-4 text-[11px] text-muted-foreground">Demo playlist — the brand uploads audio in its dashboard.</p>}
          <p className="label-xs mt-6 text-muted-foreground">Playlist</p>
          <ul className="mt-2 divide-y divide-border">
            {tracks.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setTime(0);
                  }}
                  aria-current={i === index}
                  className={cn('flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left transition-colors hover:bg-accent', i === index && 'bg-accent')}
                >
                  <Disc track={t} spinning={false} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="label-xs block font-bold">{t.title}</span>
                    <span className="label-xs block text-muted-foreground">{t.artist}</span>
                  </span>
                  <span className="label-xs tabular-nums text-muted-foreground">{formatDuration(t.durationSec)}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
