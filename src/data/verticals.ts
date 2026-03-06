import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Cog,
  Eye,
  Factory,
  Globe,
  Grid3x3,
  Package,
  Shield,
  Target,
  Wrench,
  Zap,
} from 'lucide-react';

export type Vertical = {
  id: string;
  name: string;
  enabled: boolean;
  region: string;
  focusTag?: string;
  Icon: LucideIcon;
};

export const VERTICALS: Vertical[] = [
  {
    id: 'machine-vision-inspection',
    name: 'Machine Vision & Inspection',
    enabled: true,
    region: 'Global',
    Icon: Eye,
  },
  {
    id: 'robotics',
    name: 'Robotics',
    enabled: true,
    region: 'Global',
    focusTag: 'Focus on Europe',
    Icon: Bot,
  },
  {
    id: 'automation',
    name: 'Automation',
    enabled: true,
    region: 'Global',
    focusTag: 'Focus on Europe',
    Icon: Cog,
  },
  {
    id: 'engineering-services',
    name: 'Engineering Services',
    enabled: true,
    region: 'Global',
    focusTag: 'Focus on Europe',
    Icon: Wrench,
  },
  {
    id: 'energy-installations',
    name: 'Energy Installations',
    enabled: true,
    region: 'Spain',
    Icon: Zap,
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    enabled: true,
    region: 'Global',
    Icon: Shield,
  },
  {
    id: 'surface-treatments',
    name: 'Surface Treatments',
    enabled: true,
    region: 'Global',
    Icon: Grid3x3,
  },
  {
    id: 'additive-manufacturing',
    name: 'Additive Manufacturing',
    enabled: true,
    region: 'Global',
    Icon: Factory,
  },
  {
    id: 'injection-tooling',
    name: 'Injection & Tooling',
    enabled: true,
    region: 'Global',
    Icon: Package,
  },
  {
    id: 'defense',
    name: 'Defense',
    enabled: true,
    region: 'Global',
    Icon: Target,
  },
  {
    id: 'space-telecommunications',
    name: 'space & Telecom.',
    enabled: true,
    region: 'Global',
    Icon: Globe,
  },
];


