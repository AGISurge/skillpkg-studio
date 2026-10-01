import {
  Box20Regular,
  People20Regular,
  Search20Regular,
  Settings20Regular,
  Star20Regular,
  ScanObject20Regular,
  ShieldTask20Regular,
  Folder20Regular
} from '@fluentui/react-icons';

/**
 * 路由配置结构。
 */
export type RouteConfig = {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string, strokeWidth?: number }>;
  showInMenu: boolean;
  isAgentsRoot?: boolean;
};

/**
 * 路由路径常量。
 */
export const routePaths = {
  discover: '/discover',
  discoverDetail: '/discover/:publicId',
  local: '/local',
  security: '/security',
  skillCheck: '/skill-check',
  skillGroups: '/skill-groups',
  localOrganize: '/local/organize',
  favorites: '/favorites',
  agents: '/agents/:agentId?',
  settings: '/settings',
};

/**
 * 侧边栏菜单配置。
 */
export const menuRoutes: RouteConfig[] = [
  {
    id: 'discover',
    path: routePaths.discover,
    label: '发现',
    icon: Search20Regular,
    showInMenu: true,
  },
  {
    id: 'local',
    path: routePaths.local,
    label: '本机',
    icon: Box20Regular,
    showInMenu: true,
  },
  {
    id: 'security',
    path: routePaths.security,
    label: '全量安全扫描',
    icon: ShieldTask20Regular,
    showInMenu: true,
  },
  {
    id: 'skill-check',
    path: routePaths.skillCheck,
    label: '检查此技能',
    icon: ScanObject20Regular,
    showInMenu: true,
  },
  {
    id: 'skill-groups',
    path: routePaths.skillGroups,
    label: '技能组',
    icon: Folder20Regular,
    showInMenu: true,
  },
  {
    id: 'favorites',
    path: routePaths.favorites,
    label: '收藏',
    icon: Star20Regular,
    showInMenu: true,
  },
  {
    id: 'agents',
    path: routePaths.agents,
    label: 'Agents',
    icon: People20Regular,
    showInMenu: true,
    isAgentsRoot: true,
  },
  {
    id: 'settings',
    path: routePaths.settings,
    label: '设置',
    icon: Settings20Regular,
    showInMenu: false,
  },
];
