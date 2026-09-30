export type SocialLinkKey = 'facebook' | 'instagram' | 'youtube' | 'discord' | 'website';

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  discord?: string;
  website?: string;
}

const REMOTE_SOCIAL_URL = 'https://raw.githubusercontent.com/2024LM/CustomsStudyMobile1/main/public/social_links.json';
const LOCAL_SOCIAL_URL = `${import.meta.env.BASE_URL}social_links.json`;

function normalizeUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function allowedFor(key: SocialLinkKey, value: string): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (key === 'facebook') return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com';
    if (key === 'instagram') return host === 'instagram.com' || host.endsWith('.instagram.com');
    if (key === 'youtube') return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    if (key === 'discord') return host === 'discord.gg' || host === 'discord.com' || host.endsWith('.discord.com');
    return true;
  } catch {
    return false;
  }
}

function parseSocialLinks(data: any): SocialLinks {
  const result: SocialLinks = {};
  (['facebook', 'instagram', 'youtube', 'discord', 'website'] as SocialLinkKey[]).forEach((key) => {
    const url = normalizeUrl(data?.[key]);
    if (allowedFor(key, url)) result[key] = url;
  });
  return result;
}

async function tryFetch(url: string): Promise<SocialLinks | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return parseSocialLinks(await response.json());
  } catch {
    return null;
  }
}

export async function fetchSocialLinks(): Promise<SocialLinks> {
  const remote = await tryFetch(`${REMOTE_SOCIAL_URL}?t=${Date.now()}`);
  if (remote) return remote;
  return (await tryFetch(LOCAL_SOCIAL_URL)) || {};
}
