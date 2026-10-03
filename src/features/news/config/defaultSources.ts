import { NewsSource } from '../types';

export const DEFAULT_NEWS_SOURCES: NewsSource[] = [
  { id: 'emploi-public', name: 'التشغيل العمومي', url: 'https://www.emploi-public.ma/ar/قائمة-المباريات', kind: 'web', builtIn: true, enabled: true },
  { id: 'men', name: 'وزارة التربية الوطنية', url: 'https://www.men.gov.ma/مستجدات', kind: 'web', builtIn: true, enabled: true },
  { id: 'finances', name: 'وزارة الاقتصاد والمالية', url: 'https://www.finances.gov.ma/ar/Pages/مستجدات.aspx', kind: 'web', builtIn: true, enabled: true },
  { id: 'hcp', name: 'المندوبية السامية للتخطيط', url: 'https://www.hcp.ma/', feedUrl: 'https://www.hcp.ma/xml/syndication.rss', kind: 'rss', builtIn: true, enabled: true },
];
