import type { SemanticProgress } from './types';

export const semanticProgressLabel = (progress: SemanticProgress | null | undefined): string => {
  if (!progress) return '';
  switch (progress.stage) {
    case 'queued': return '等待智能扫描';
    case 'loading': return `正在加载模型 ${progress.percent}%`;
    case 'generating':
      return `智能判断 ${progress.chunkIndex} / ${progress.chunkCount} · 已分析 ${progress.completedDimensions} / ${progress.totalDimensions} 项`;
    case 'validating': return `正在校验智能结果 ${progress.chunkIndex} / ${progress.chunkCount}`;
    default: {
      const exhaustive: never = progress;
      return exhaustive;
    }
  }
};
