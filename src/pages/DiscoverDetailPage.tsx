import {
  ArrowDownloadRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DocumentRegular,
  FolderRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLocation, useParams } from 'react-router-dom';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useAppContext, useToolbar } from '../AppContext';
import type {
  SkillpkgFileNode,
  SkillpkgSkillDetail,
  SkillpkgSkillSummary,
} from '../types/models';
import { formatBytes, stripMarkdownFrontmatter } from '../utils/skillUtils';

const detailCache = new Map<string, SkillpkgSkillDetail>();
const detailRequests = new Map<string, Promise<SkillpkgSkillDetail>>();
const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeHighlight];

const getErrorMessage = (reason?: string, status?: number) => {
  if (reason === 'api-key-required') return '请先在设置页配置 SkillPKG API Key。';
  if (status === 401) return 'API Key 无效或已过期，请在设置页更新。';
  if (status === 404) return '未找到该 Skill。';
  return reason || '读取 Skill 详情失败，请稍后重试。';
};

const getPackageTypeMeta = (type?: SkillpkgSkillDetail['type']) => {
  if (type === 'solution') {
    return { label: 'Solution', className: 'solution' };
  }
  return { label: 'Skill', className: 'skill' };
};

const getRiskMeta = (riskLevel?: SkillpkgSkillDetail['riskLevel']) => {
  if (riskLevel === 'benign') {
    return { label: '安全', className: 'safe', icon: ShieldCheckmarkRegular };
  }
  if (riskLevel === 'suspicious') {
    return { label: '需留意', className: 'warning', icon: WarningRegular };
  }
  if (riskLevel === 'malicious') {
    return { label: '高风险', className: 'danger', icon: WarningRegular };
  }
  return { label: '未知', className: 'unknown', icon: WarningRegular };
};

const getDisplaySource = (detail?: SkillpkgSkillDetail | null) => {
  const source = detail?.homepage || detail?.publisher?.website || '';
  if (!source) return '未知来源';
  const sourceUrl = getExternalUrl(source);
  if (sourceUrl) return getExternalLabel(sourceUrl);
  return source;
};

const getExternalUrl = (value?: string | null) => {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';
  const candidates = [rawUrl, `https://${rawUrl}`];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString();
      }
    } catch (_error) {}
  }
  return '';
};

const getExternalLabel = (value: string) => {
  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch (_error) {
    return value;
  }
};

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
};

const getInitialExpandedFolders = (nodes: SkillpkgFileNode[], rootPath: string) => {
  const next = new Set<string>([rootPath]);
  nodes.forEach((node) => {
    if (node.type === 'dir') next.add(node.path);
  });
  return next;
};

const DiscoverDetailSkeleton = () => (
  <div className="discover-detail-grid" aria-hidden="true">
    <div className="discover-detail-main">
      <div className="skeleton discover-detail-label-skeleton" />
      <div className="skeleton discover-detail-code-skeleton" />
      <div className="skeleton discover-detail-heading-skeleton" />
      <div className="skeleton skeleton-line wide" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton discover-detail-heading-skeleton short" />
      <div className="skeleton skeleton-line wide" />
      <div className="skeleton skeleton-line wide" />
    </div>
    <aside className="discover-detail-sidebar">
      <div className="discover-detail-card">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line wide" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton discover-detail-button-skeleton" />
      </div>
      <div className="discover-detail-card">
        <div className="skeleton skeleton-meta" />
        <div className="skeleton skeleton-line wide" />
        <div className="skeleton skeleton-line" />
      </div>
    </aside>
  </div>
);

type FileTreeProps = {
  rootName: string;
  nodes: SkillpkgFileNode[];
};

const FileTree = ({ rootName, nodes }: FileTreeProps) => {
  const rootPath = '__root__';
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => getInitialExpandedFolders(nodes, rootPath),
  );

  useEffect(() => {
    setExpandedFolders(getInitialExpandedFolders(nodes, rootPath));
  }, [nodes]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const renderNodes = (items: SkillpkgFileNode[], depth = 0) => {
    const sortedItems = [...items].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });

    return sortedItems.map((node) => {
      const isDir = node.type === 'dir';
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div className="tree-node" key={node.path || node.name} style={{ paddingLeft: depth * 12 }}>
          <button
            type="button"
            className={`tree-item ${isDir ? '' : 'readonly'}`}
            onClick={() => {
              if (isDir) toggleFolder(node.path);
            }}
            title={node.bytes !== undefined ? formatBytes(node.bytes) : node.path}
          >
            {isDir ? (
              isExpanded ? (
                <ChevronDownRegular className="icon" />
              ) : (
                <ChevronRightRegular className="icon" />
              )
            ) : (
              <DocumentRegular className="icon" />
            )}
            {isDir ? <FolderRegular className="icon" /> : null}
            <span>{node.name}</span>
          </button>
          {isDir && isExpanded && node.children?.length ? renderNodes(node.children, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="discover-file-tree">
      <div className="tree-node">
        <button
          type="button"
          className="tree-item"
          onClick={() => toggleFolder(rootPath)}
        >
          {expandedFolders.has(rootPath) ? (
            <ChevronDownRegular className="icon" />
          ) : (
            <ChevronRightRegular className="icon" />
          )}
          <FolderRegular className="icon" />
          <span>{rootName}</span>
        </button>
      </div>
      {expandedFolders.has(rootPath) ? renderNodes(nodes, 1) : null}
    </div>
  );
};

const DiscoverDetailPage = () => {
  const { apiKey, importSkillpkgSkill, importStatus } = useAppContext();
  const { publicId = '' } = useParams();
  const location = useLocation();
  const summary = (location.state as { skill?: SkillpkgSkillSummary } | null)?.skill;
  const normalizedApiKey = apiKey.trim();
  const cachedDetail = publicId ? detailCache.get(publicId) : undefined;
  const [detail, setDetail] = useState<SkillpkgSkillDetail | null>(cachedDetail || null);
  const [loading, setLoading] = useState(Boolean(publicId && !cachedDetail));
  const [error, setError] = useState('');
  const importing = importStatus === 'downloading' ||
    importStatus === 'scanning' ||
    importStatus === 'resolving' ||
    importStatus === 'installing';

  useToolbar(null);

  useEffect(() => {
    let active = true;
    if (!publicId) {
      setDetail(null);
      setLoading(false);
      setError('缺少 Skill ID。');
      return () => {
        active = false;
      };
    }

    const cached = detailCache.get(publicId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError('');
      return () => {
        active = false;
      };
    }

    if (!normalizedApiKey) {
      setDetail(null);
      setLoading(false);
      setError(getErrorMessage('api-key-required'));
      return () => {
        active = false;
      };
    }
    if (!window?.skillpkg?.getSkillpkgSkillDetail) {
      setDetail(null);
      setLoading(false);
      setError('当前环境不支持访问 SkillPkg API。');
      return () => {
        active = false;
      };
    }

    setDetail(null);
    setLoading(true);
    setError('');

    const request = detailRequests.get(publicId) || window.skillpkg.getSkillpkgSkillDetail({
      apiKey: normalizedApiKey,
      publicId,
    }).then((result) => {
      if (!result.ok || !result.detail) {
        throw new Error(getErrorMessage(result.reason, result.status));
      }
      detailCache.set(publicId, result.detail);
      return result.detail;
    }).finally(() => {
      detailRequests.delete(publicId);
    });

    detailRequests.set(publicId, request);
    void request
      .then((nextDetail) => {
        if (!active) return;
        setDetail(nextDetail);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError?.message || getErrorMessage());
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [normalizedApiKey, publicId]);

  const displayDetail = detail || (summary ? {
    ...summary,
    skillMd: '',
    fileStructure: [],
    version: null,
    downloadCount: 0,
    publisher: summary.publisher ?? null,
  } as SkillpkgSkillDetail : null);

  const markdownContent = useMemo(() => {
    if (!detail?.skillMd) return '';
    return stripMarkdownFrontmatter(detail.skillMd);
  }, [detail?.skillMd]);

  const riskMeta = getRiskMeta(displayDetail?.riskLevel);
  const RiskIcon = riskMeta.icon;
  const packageTypeMeta = getPackageTypeMeta(displayDetail?.type);
  const publisherUrl = getExternalUrl(displayDetail?.publisher?.website);
  const sourceUrl = getExternalUrl(displayDetail?.homepage || displayDetail?.publisher?.website);

  const openExternalUrl = useCallback((url: string) => {
    if (!url || !window?.skillpkg?.openExternalUrl) return;
    void window.skillpkg.openExternalUrl(url);
  }, []);

  const renderExternalLink = useCallback(({
    node: _node,
    children,
    href,
    onClick,
    ...props
  }: MarkdownLinkProps) => {
    const externalUrl = getExternalUrl(href);
    if (!externalUrl) {
      return <a href={href} onClick={onClick} {...props}>{children}</a>;
    }
    return (
      <a
        {...props}
        href={externalUrl}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          openExternalUrl(externalUrl);
        }}
      >
        {children}
      </a>
    );
  }, [openExternalUrl]);
  const markdownComponents = useMemo(() => ({
    a: renderExternalLink,
  }), [renderExternalLink]);

  const handleDownload = async () => {
    if (!publicId || importing) return;
    if (!normalizedApiKey) {
      setError(getErrorMessage('api-key-required'));
      return;
    }
    setError('');
    try {
      await importSkillpkgSkill(publicId);
    } catch (downloadError: any) {
      setError(getErrorMessage(downloadError?.message));
    }
  };

  return (
    <section className="discover-detail-page fade-in">
      {loading && !detail ? (
        <DiscoverDetailSkeleton />
      ) : displayDetail ? (
        <div className="discover-detail-grid">
          <main className="discover-detail-main">
            <div className="discover-detail-md-label">SKILL.md</div>
            {markdownContent ? (
              <ReactMarkdown
                remarkPlugins={markdownRemarkPlugins}
                rehypePlugins={markdownRehypePlugins}
                components={markdownComponents}
                className="discover-markdown"
              >
                {markdownContent}
              </ReactMarkdown>
            ) : (
              <div className="empty-state discover-detail-empty">
                {error || '暂无 SKILL.md 预览。'}
              </div>
            )}
          </main>

          <aside className="discover-detail-sidebar">
            <div className="discover-detail-card discover-summary-card">
              <div className="discover-summary-accent" aria-hidden="true" />
              <div className="discover-summary-head">
                <h1>{displayDetail.name}</h1>
                <span className={`discover-type-pill ${packageTypeMeta.className}`}>
                  {packageTypeMeta.label}
                </span>
              </div>
              <p>{displayDetail.description || '暂无描述。'}</p>
              <dl className="discover-detail-meta-list">
                {displayDetail.publisher?.name ? (
                  <div>
                    <dt>发布者</dt>
                    <dd>
                      {publisherUrl ? (
                        <a
                          href={publisherUrl}
                          className="external-text-link"
                          onClick={(event) => {
                            event.preventDefault();
                            openExternalUrl(publisherUrl);
                          }}
                        >
                          {displayDetail.publisher.name}
                        </a>
                      ) : (
                        displayDetail.publisher.name
                      )}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>提交人</dt>
                  <dd>{displayDetail.author?.displayName || displayDetail.author?.slug || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        className="external-text-link"
                        onClick={(event) => {
                          event.preventDefault();
                          openExternalUrl(sourceUrl);
                        }}
                      >
                        {getDisplaySource(displayDetail)}
                      </a>
                    ) : (
                      getDisplaySource(displayDetail)
                    )}
                  </dd>
                </div>
                <div>
                  <dt>风险等级</dt>
                  <dd>
                    <span className={`risk-badge ${riskMeta.className}`}>
                      <RiskIcon className="icon" />
                      {riskMeta.label}
                    </span>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className={`btn primary discover-download-button ${importing ? 'loading' : ''}`}
                onClick={handleDownload}
                disabled={importing}
              >
                {importing ? (
                  <span className="mini-spinner" aria-hidden="true" />
                ) : (
                  <ArrowDownloadRegular className="icon" />
                )}
                {importing ? '下载导入中' : '导入并安装'}
              </button>
            </div>

            <div className="discover-detail-card discover-file-card">
              <div className="discover-file-card-title">技能包文件清单</div>
              {detail?.fileStructure?.length ? (
                <FileTree rootName={detail.slug || detail.name} nodes={detail.fileStructure} />
              ) : (
                <div className="empty-state discover-file-empty">暂无文件结构。</div>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="empty-state discover-detail-empty">{error || '未找到该 Skill。'}</div>
      )}

      {error && displayDetail ? (
        <div className="notice discover-detail-notice">{error}</div>
      ) : null}
    </section>
  );
};

export default DiscoverDetailPage;
