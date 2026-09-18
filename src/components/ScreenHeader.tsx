import React from 'react';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  action,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-bold text-[#2C2145] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#77717F]">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};
