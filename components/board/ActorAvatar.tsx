'use client';

import Image, { type StaticImageData } from 'next/image';
import {
  Bot,
  Crosshair,
  Eye,
  Orbit,
  Rocket,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';
import ctateImg from '@/src/assets/images/avatar_ctate_bw_1795140190103.jpg';
import raillyImg from '@/src/assets/images/avatar_railly_bw_1795140190398.jpg';
import lahfirImg from '@/src/assets/images/avatar_lahfir_bw_1795140190818.jpg';
import type { Actor } from '@/lib/board-types';

const HUMAN_AVATARS: Record<string, StaticImageData> = {
  ctate: ctateImg,
  railly: raillyImg,
  lahfir: lahfirImg,
};

interface ActorAvatarProps {
  actor?: Actor | null;
  name?: string;
  kind?: 'person' | 'agent';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  inverted?: boolean;
}

export function ActorAvatar({
  actor,
  name,
  kind,
  size = 'sm',
  inverted = false,
}: ActorAvatarProps) {
  const resolvedName = (actor?.name || name || 'agent').toLowerCase();
  const resolvedKind = actor?.kind || kind || (HUMAN_AVATARS[resolvedName] ? 'person' : 'agent');
  const photo = HUMAN_AVATARS[resolvedName];

  const dims =
    size === 'xs'
      ? { box: 'w-4 h-4', px: 16, icon: 13 }
      : size === 'sm'
        ? { box: 'w-5 h-5', px: 20, icon: 15 }
        : size === 'md'
          ? { box: 'w-9 h-9', px: 36, icon: 22 }
          : { box: 'w-14 h-14', px: 56, icon: 32 };

  if (resolvedKind === 'person' && photo) {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden bg-black ${dims.box} ${
          size === 'lg' ? 'border border-[#404040]' : 'border border-[#808080]'
        }`}
      >
        <Image
          src={photo}
          alt={resolvedName}
          width={dims.px}
          height={dims.px}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover grayscale contrast-125"
        />
      </span>
    );
  }

  const flavor = actor?.cliFlavor || resolvedName;
  const Icon =
    flavor.includes('claude')
      ? Terminal
      : flavor.includes('grok')
        ? Zap
        : flavor.includes('antigravity') || flavor.includes('gemini')
          ? Orbit
          : flavor.includes('fix')
            ? Wrench
            : flavor.includes('scout')
              ? Crosshair
              : flavor.includes('deploy')
                ? Rocket
                : flavor.includes('review')
                  ? Eye
                  : Bot;

  const isFramed = size === 'lg' || size === 'md';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${dims.box} ${
        isFramed
          ? 'bg-white border-2 border-[#0a0a0a] text-[#0a0a0a]'
          : inverted
            ? 'text-white'
            : 'text-[#0a0a0a]'
      }`}
      aria-hidden="true"
    >
      <Icon size={dims.icon} strokeWidth={size === 'lg' ? 2.2 : 2.1} />
    </span>
  );
}
