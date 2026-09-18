import { RemoteState } from '../types';

export const CONFIG_URL = 'https://raw.githubusercontent.com/2024LM/-Lm/BOT-SCRFY/remote_config.json';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/2024LM/-Lm/releases/latest';
const LOCAL_CONFIG_URL = '/remote_config.json';

function isTrustedUpdateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function fetchRemoteConfig(): Promise<RemoteState | null> {
  const tryFetch = async (targetUrl: string): Promise<RemoteState | null> => {
    try {
      const response = await fetch(targetUrl, { cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();

      // Support config_version >= 1 (e.g. version 1 or 2 from repository)
      const configVersion = Number(data.config_version);
      if (isNaN(configVersion) || configVersion < 1) {
        console.warn('remote_config.json invalid config_version:', data.config_version);
        return null;
      }

      const latest = Number(data.latest_version_code);
      const minimum = Number(data.min_supported_version_code);
      if (isNaN(latest) || isNaN(minimum) || latest < 1 || minimum < 1 || minimum > latest) {
        console.warn('remote_config.json invalid version codes:', { latest, minimum });
        return null;
      }

      const updateObj = data.update || {};
      const announcementObj = data.announcement || {};
      const ratingObj = data.rating_prompt || {};

      const updateUrl = String(updateObj.url || '').trim();
      const announcementEnabled = Boolean(announcementObj.enabled);
      const announcementId = String(announcementObj.id || '').trim().slice(0, 100);
      const announcementTitle = String(announcementObj.title || '').trim().slice(0, 200);
      const announcementMessage = String(announcementObj.message || '').trim().slice(0, 4000);

      // Parse notifications list if provided in remote JSON (or synthesized from announcements/updates)
      const rawNotifications = Array.isArray(data.notifications) ? data.notifications : [];
      const notifications = rawNotifications
        .filter((n: any) => n && typeof n === 'object' && (n.title || n.message))
        .map((n: any, index: number) => ({
          id: String(n.id || `notif_${index}`),
          title: String(n.title || 'إشعار'),
          message: String(n.message || ''),
          type: (['info', 'update', 'alert', 'general'].includes(n.type) ? n.type : 'info') as any,
          date: n.date ? String(n.date) : undefined,
          url: n.url ? String(n.url) : undefined,
        }));

      return {
        latest,
        minimum,
        updateUrl,
        updateTitle: String(updateObj.title || 'يتوفر تحديث جديد').trim().slice(0, 200),
        updateMessage: String(updateObj.message || 'يرجى تحديث التطبيق.').trim().slice(0, 2000),
        announcementId,
        announcementTitle,
        announcementMessage,
        announcementEnabled: announcementEnabled && Boolean(announcementId) && Boolean(announcementMessage),
        notifications,
        ratingPrompt: {
          enabled: Boolean(ratingObj.enabled),
          storeUrl: String(ratingObj.store_url || '').trim(),
          title: String(ratingObj.title || 'ما رأيك في التطبيق؟').trim().slice(0, 200),
          message: String(ratingObj.message || 'ساعدنا بتقييم التطبيق.').trim().slice(0, 1000),
          minUsageDays: Math.max(1, Math.min(365, Number(ratingObj.min_usage_days) || 3)),
          minLaunches: Math.max(1, Math.min(1000, Number(ratingObj.min_launches) || 5)),
          repeatAfterDays: Math.max(1, Math.min(365, Number(ratingObj.repeat_after_days) || 14)),
        },
        lastCheckedAt: Date.now(),
        source: targetUrl.startsWith('http') ? 'github' : 'local',
      };
    } catch (err) {
      console.warn('Failed to fetch from', targetUrl, err);
      return null;
    }
  };

  // 1. Try remote GitHub repository raw URL first
  const remoteResult = await tryFetch(CONFIG_URL);
  if (remoteResult) {
    return remoteResult;
  }

  // 2. Fallback to local config bundled with app
  const localResult = await tryFetch(LOCAL_CONFIG_URL);
  if (localResult) {
    return localResult;
  }

  return null;
}

export function openUpdate(url: string) {
  if (url && isTrustedUpdateUrl(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
