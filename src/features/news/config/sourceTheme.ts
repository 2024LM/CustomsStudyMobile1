import { BriefcaseBusiness, GraduationCap, Landmark, ChartNoAxesCombined, Newspaper } from 'lucide-react';

export function sourceTheme(id: string) {
  if (id === 'emploi-public') return { icon: BriefcaseBusiness, color: '#2F5AA8', end: '#173B72', light: '#93c5fd', chip: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (id === 'men') return { icon: GraduationCap, color: '#8B5CF6', end: '#5B21B6', light: '#c4b5fd', chip: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (id === 'finances') return { icon: Landmark, color: '#0F766E', end: '#115E59', light: '#5eead4', chip: 'bg-teal-50 text-teal-700 border-teal-100' };
  if (id === 'hcp') return { icon: ChartNoAxesCombined, color: '#B45309', end: '#92400E', light: '#fcd34d', chip: 'bg-amber-50 text-amber-700 border-amber-100' };
  return { icon: Newspaper, color: '#5B3FD6', end: '#392080', light: '#c4b5fd', chip: 'bg-[#F5F3FF] text-[#5B3FD6] border-[#E7E1FF]' };
}
