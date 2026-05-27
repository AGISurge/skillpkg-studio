import {
  BoxRegular,
  PeopleRegular,
  SearchRegular,
  SettingsRegular,
  StarRegular,
} from '@fluentui/react-icons';

/**
 * 路由配置结构。
 */
export type RouteConfig = {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
    icon: SearchRegular,
    showInMenu: true,
  },
  {
    id: 'local',
    path: routePaths.local,
    label: '本机',
    icon: BoxRegular,
    showInMenu: true,
  },
  {
    id: 'favorites',
    path: routePaths.favorites,
    label: '收藏',
    icon: StarRegular,
    showInMenu: true,
  },
  {
    id: 'agents',
    path: routePaths.agents,
    label: 'Agents',
    icon: PeopleRegular,
    showInMenu: true,
    isAgentsRoot: true,
  },
  {
    id: 'settings',
    path: routePaths.settings,
    label: '设置',
    icon: SettingsRegular,
    showInMenu: false,
  },
];
