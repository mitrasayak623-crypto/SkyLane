import React from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';
import type { SkyTheme } from '../../shared/types';

interface WeatherGlyphProps {
  theme: SkyTheme;
  className?: string;
}

export const WeatherGlyph: React.FC<WeatherGlyphProps> = ({ theme, className = 'w-5 h-5' }) => {
  switch (theme) {
    case 'clear-day':
      return <Sun className={className} aria-hidden="true" />;
    case 'clear-night':
      return <Moon className={className} aria-hidden="true" />;
    case 'partly-cloudy':
      return <CloudSun className={className} aria-hidden="true" />;
    case 'cloudy':
      return <Cloud className={className} aria-hidden="true" />;
    case 'fog':
      return <CloudFog className={className} aria-hidden="true" />;
    case 'rain':
      return <CloudRain className={className} aria-hidden="true" />;
    case 'storm':
      return <CloudLightning className={className} aria-hidden="true" />;
    default:
      return <CloudSun className={className} aria-hidden="true" />;
  }
};
