import {
  DismissRegular,
  SearchRegular,
  StarFilled,
} from '@fluentui/react-icons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SkillpkgCategory, SkillpkgListMeta, SkillpkgSkillSummary } from '../types/models';
import { useAppContext, useToolbar } from '../AppContext';
import { Button } from '@/components/ui/button';

const DISCOVER_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 260;
const DISCOVER_CACHE_TTL_MS = 60 * 60 * 1000;

type DiscoverCategoriesCacheEntry = {
  categories: SkillpkgCategory[];
  expiresAt: number;
};

type DiscoverListCacheEntry = {
  skills: SkillpkgSkillSummary[];
  meta: SkillpkgListMeta | null;
  page: number;
  scrollTop: number;
  expiresAt: number;
};

type DiscoverLocationState = {
  fromDiscoverDetail?: boolean;
} | null;

type DiscoverViewState = {
  selectedCategoryIds: string[];
  searchValue: string;
  debouncedSearchValue: string;
  featuredOnly: boolean;
  scrollTop: number;
};

const categoryCache = new Map<string, DiscoverCategoriesCacheEntry>();
const listCache = new Map<string, DiscoverListCacheEntry>();
let pendingDiscoverReturnState: DiscoverViewState | null = null;

const getCacheExpiry = () => Date.now() + DISCOVER_CACHE_TTL_MS;

const isFreshCacheEntry = (entry?: { expiresAt: number }) =>
  Boolean(entry && entry.expiresAt > Date.now());

const getListCacheKey = (
  apiKey: string,
  categoryKey: string,
  search: string,
  featuredOnly: boolean,
) => JSON.stringify({
  apiKey,
  categories: categoryKey,
  q: search.trim(),
  featuredOnly,
});

const getDiscoverScrollTop = (element: HTMLDivElement | null) =>
  element?.scrollTop || document.scrollingElement?.scrollTop || 0;

const restoreDiscoverScrollTop = (element: HTMLDivElement | null, scrollTop: number) => {
  if (!element || scrollTop <= 0) return;

  let attempts = 0;
  const restore = () => {
    if (!element.isConnected) return;

    element.scrollTop = scrollTop;
    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = scrollTop;
    }

    attempts += 1;
    const restored = Math.abs(element.scrollTop - scrollTop) < 2;
    const canKeepTrying = attempts < 8;
    if (!restored && canKeepTrying) {
      window.requestAnimationFrame(restore);
    }
  };

  window.requestAnimationFrame(restore);
};

const getErrorMessage = (reason?: string, status?: number) => {
  if (reason === 'api-key-required') return '请先在设置页配置 SkillPKG API Key。';
  if (status === 401) return 'API Key 无效或已过期，请在设置页更新。';
  return reason || '读取 SkillPkg 发现列表失败，请稍后重试。';
};

const getPackageTypeMeta = (type?: SkillpkgSkillSummary['type']) => {
  if (type === 'solution') {
    return { label: 'Solution', className: 'solution' };
  }
  return { label: 'Skill', className: 'skill' };
};

const DiscoverSkeletonCard = () => (
  <div className="discover-card discover-skeleton-card" aria-hidden="true">
    <div className="discover-card-head">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-pill" />
    </div>
    <div className="skeleton skeleton-line wide" />
    <div className="skeleton skeleton-line" />
    <div className="discover-card-foot">
      <div className="skeleton skeleton-meta" />
      <div className="skeleton skeleton-meta short" />
    </div>
  </div>
);

type DiscoverSearchInputProps = {
  value: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onClear: () => void;
};

const DiscoverSearchInput = ({
  value,
  disabled,
  onValueChange,
  onClear,
}: DiscoverSearchInputProps) => {
  const [draftValue, setDraftValue] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) {
      setDraftValue(value);
    }
  }, [value]);

  const commitValue = useCallback((nextValue: string) => {
    setDraftValue(nextValue);
    onValueChange(nextValue);
  }, [onValueChange]);

  return (
    <label className="discover-search">
      <SearchRegular className="icon" />
      <input
        type="text"
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setDraftValue(nextValue);
          if (!composingRef.current) {
            onValueChange(nextValue);
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          commitValue(event.currentTarget.value);
        }}
        placeholder="搜索 Skill"
        aria-label="搜索 Skill"
        disabled={disabled}
      />
      {draftValue ? (
        <button
          type="button"
          className="skill-search-clear"
          aria-label="清空搜索"
          onClick={() => {
            composingRef.current = false;
            setDraftValue('');
            onClear();
          }}
        >
          <DismissRegular className="icon" />
        </button>
      ) : null}
    </label>
  );
};

const DiscoverPage = () => {
  const { apiKey } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as DiscoverLocationState;
  const fromDiscoverDetail = locationState?.fromDiscoverDetail === true;
  const initialReturnStateRef = useRef(
    fromDiscoverDetail || Boolean(pendingDiscoverReturnState) ? pendingDiscoverReturnState : null,
  );
  const [categories, setCategories] = useState<SkillpkgCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(initialReturnStateRef.current?.selectedCategoryIds || []),
  );
  const [searchValue, setSearchValue] = useState(initialReturnStateRef.current?.searchValue || '');
  const [debouncedSearchValue, setDebouncedSearchValue] = useState(
    initialReturnStateRef.current?.debouncedSearchValue || '',
  );
  const [featuredOnly, setFeaturedOnly] = useState(initialReturnStateRef.current?.featuredOnly || false);
  const [skills, setSkills] = useState<SkillpkgSkillSummary[]>([]);
  const [meta, setMeta] = useState<SkillpkgListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const preferCachedReturnRef = useRef(fromDiscoverDetail || Boolean(initialReturnStateRef.current));
  const pendingScrollTopRef = useRef(initialReturnStateRef.current?.scrollTop || 0);

  const normalizedApiKey = apiKey.trim();
  const selectedCategoryKey = useMemo(
    () => [...selectedCategoryIds].sort().join(','),
    [selectedCategoryIds],
  );
  const selectedCategoryArray = useMemo(
    () => selectedCategoryKey ? selectedCategoryKey.split(',') : [],
    [selectedCategoryKey],
  );
  const listCacheKey = useMemo(
    () => getListCacheKey(
      normalizedApiKey,
      selectedCategoryKey,
      debouncedSearchValue,
      featuredOnly,
    ),
    [debouncedSearchValue, featuredOnly, normalizedApiKey, selectedCategoryKey],
  );
  const canLoadMore = Boolean(meta && page < meta.totalPages);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchValue(searchValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    let active = true;
    if (!normalizedApiKey) {
      setCategories([]);
      setSelectedCategoryIds(new Set());
      setCategoriesLoading(false);
      return;
    }

    const cached = categoryCache.get(normalizedApiKey);
    if (isFreshCacheEntry(cached)) {
      setCategories(cached?.categories || []);
      setCategoriesLoading(false);
      return;
    }

    if (!window?.skillpkg?.listSkillpkgCategories) {
      setError('当前环境不支持访问 SkillPkg API。');
      return;
    }

    setCategoriesLoading(true);
    void window.skillpkg.listSkillpkgCategories({ apiKey: normalizedApiKey })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(getErrorMessage(result.reason, result.status));
          setCategories([]);
          return;
        }
        const nextCategories = result.categories || [];
        categoryCache.set(normalizedApiKey, {
          categories: nextCategories,
          expiresAt: getCacheExpiry(),
        });
        setCategories(nextCategories);
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError?.message));
          setCategories([]);
        }
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [normalizedApiKey]);

  useEffect(() => {
    if (!normalizedApiKey) {
      setSkills([]);
      setMeta(null);
      setPage(1);
      setInitialLoading(false);
      setLoadingMore(false);
      setError(getErrorMessage('api-key-required'));
      return;
    }

    const cached = listCache.get(listCacheKey);
    const canReuseCachedList =
      isFreshCacheEntry(cached) || (preferCachedReturnRef.current && Boolean(cached));
    preferCachedReturnRef.current = false;
    if (canReuseCachedList && cached) {
      requestIdRef.current += 1;
      setSkills(cached.skills);
      setMeta(cached.meta);
      setPage(cached.page);
      setInitialLoading(false);
      setLoadingMore(false);
      setError('');
      pendingScrollTopRef.current = initialReturnStateRef.current?.scrollTop || cached.scrollTop;
      return;
    }

    if (!window?.skillpkg?.listSkillpkgSkills) {
      setError('当前环境不支持访问 SkillPkg API。');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setInitialLoading(true);
    setLoadingMore(false);
    setError('');
    setSkills([]);
    setMeta(null);
    setPage(1);

    void window.skillpkg.listSkillpkgSkills({
      apiKey: normalizedApiKey,
      categoryPublicIds: selectedCategoryArray,
      q: debouncedSearchValue.trim(),
      isFeatured: featuredOnly,
      page: 1,
      pageSize: DISCOVER_PAGE_SIZE,
    }).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (!result.ok) {
        setError(getErrorMessage(result.reason, result.status));
        setSkills([]);
        setMeta(null);
        return;
      }
      const nextSkills = result.docs || [];
      const nextMeta = result.meta || null;
      setSkills(nextSkills);
      setMeta(nextMeta);
      listCache.set(listCacheKey, {
        skills: nextSkills,
        meta: nextMeta,
        page: 1,
        scrollTop: 0,
        expiresAt: getCacheExpiry(),
      });
    }).catch((requestError) => {
      if (requestIdRef.current !== requestId) return;
      setError(getErrorMessage(requestError?.message));
      setSkills([]);
      setMeta(null);
    }).finally(() => {
      if (requestIdRef.current === requestId) {
        setInitialLoading(false);
      }
    });
  }, [
    debouncedSearchValue,
    featuredOnly,
    listCacheKey,
    normalizedApiKey,
    selectedCategoryArray,
  ]);

  const loadMore = useCallback(() => {
    if (
      !normalizedApiKey ||
      !canLoadMore ||
      initialLoading ||
      loadingMore ||
      !window?.skillpkg?.listSkillpkgSkills
    ) {
      return;
    }

    const nextPage = page + 1;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingMore(true);
    setError('');

    void window.skillpkg.listSkillpkgSkills({
      apiKey: normalizedApiKey,
      categoryPublicIds: selectedCategoryArray,
      q: debouncedSearchValue.trim(),
      isFeatured: featuredOnly,
      page: nextPage,
      pageSize: DISCOVER_PAGE_SIZE,
    }).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (!result.ok) {
        setError(getErrorMessage(result.reason, result.status));
        return;
      }
      const nextMeta = result.meta || null;
      setSkills((current) => {
        const existingIds = new Set(current.map((skill) => skill.publicId));
        const nextDocs = (result.docs || []).filter((skill) => !existingIds.has(skill.publicId));
        const nextSkills = [...current, ...nextDocs];
        listCache.set(listCacheKey, {
          skills: nextSkills,
          meta: nextMeta,
          page: nextPage,
          scrollTop: getDiscoverScrollTop(listRef.current),
          expiresAt: getCacheExpiry(),
        });
        return nextSkills;
      });
      setMeta(nextMeta);
      setPage(nextPage);
    }).catch((requestError) => {
      if (requestIdRef.current !== requestId) return;
      setError(getErrorMessage(requestError?.message));
    }).finally(() => {
      if (requestIdRef.current === requestId) {
        setLoadingMore(false);
      }
    });
  }, [
    canLoadMore,
    debouncedSearchValue,
    featuredOnly,
    initialLoading,
    listCacheKey,
    loadingMore,
    normalizedApiKey,
    page,
    selectedCategoryArray,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore || initialLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      {
        root: listRef.current,
        rootMargin: '240px 0px',
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, initialLoading, loadMore]);

  useLayoutEffect(() => {
    const scrollTop = pendingScrollTopRef.current;
    if (!scrollTop || initialLoading || !skills.length) return;

    restoreDiscoverScrollTop(listRef.current, scrollTop);
    pendingScrollTopRef.current = 0;
  }, [initialLoading, skills.length]);

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  const persistCurrentListCache = useCallback(() => {
    if (!normalizedApiKey || !meta) return;
    listCache.set(listCacheKey, {
      skills,
      meta,
      page,
      scrollTop: getDiscoverScrollTop(listRef.current),
      expiresAt: getCacheExpiry(),
    });
  }, [listCacheKey, meta, normalizedApiKey, page, skills]);

  const openSkillDetail = useCallback((skill: SkillpkgSkillSummary) => {
    const scrollTop = getDiscoverScrollTop(listRef.current);
    pendingDiscoverReturnState = {
      selectedCategoryIds: [...selectedCategoryIds],
      searchValue,
      debouncedSearchValue,
      featuredOnly,
      scrollTop,
    };
    persistCurrentListCache();
    navigate(`/discover/${encodeURIComponent(skill.publicId)}`, {
      state: { skill },
    });
  }, [
    debouncedSearchValue,
    featuredOnly,
    navigate,
    persistCurrentListCache,
    searchValue,
    selectedCategoryIds,
  ]);

  const handleCardKeyDown = useCallback((
    event: KeyboardEvent<HTMLElement>,
    skill: SkillpkgSkillSummary,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openSkillDetail(skill);
  }, [openSkillDetail]);

  const handleSearchClear = useCallback(() => {
    setSearchValue('');
    setDebouncedSearchValue('');
  }, []);

  const openSkillpkgSite = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!window?.skillpkg?.openExternalUrl) return;
    void window.skillpkg.openExternalUrl('https://skillpkg.com');
  }, []);

  const toolbar = useMemo(() => (
    <div className="discover-toolbar">
      <div className="discover-category-strip" aria-label="分类筛选">
        {categoriesLoading ? (
          <>
            <span className="skeleton discover-category-skeleton" />
            <span className="skeleton discover-category-skeleton" />
          </>
        ) : categories.map((category) => (
          <button
            type="button"
            key={category.publicId}
            className={`discover-category-chip ${selectedCategoryIds.has(category.publicId) ? 'selected' : ''}`}
            onClick={() => toggleCategory(category.publicId)}
            aria-pressed={selectedCategoryIds.has(category.publicId)}
            disabled={!normalizedApiKey}
          >
            {category.name}
          </button>
        ))}
      </div>
      <DiscoverSearchInput
        value={searchValue}
        disabled={!normalizedApiKey}
        onValueChange={setSearchValue}
        onClear={handleSearchClear}
      />
      <div className="discover-segment" role="group" aria-label="推荐筛选">
        <button
          type="button"
          className={!featuredOnly ? 'selected' : ''}
          onClick={() => setFeaturedOnly(false)}
          disabled={!normalizedApiKey}
        >
          所有
        </button>
        <button
          type="button"
          className={featuredOnly ? 'selected' : ''}
          onClick={() => setFeaturedOnly(true)}
          disabled={!normalizedApiKey}
        >
          <StarFilled className="icon" />
          推荐
        </button>
      </div>
    </div>
  ), [
    categories,
    categoriesLoading,
    featuredOnly,
    handleSearchClear,
    normalizedApiKey,
    searchValue,
    selectedCategoryIds,
    toggleCategory,
  ]);
  useToolbar(toolbar);

  const showInitialSkeleton = initialLoading && skills.length === 0;

  return (
    <section className="discover-page fade-in">
      <div className="discover-list" ref={listRef}>
        {showInitialSkeleton ? (
          <div className="discover-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <DiscoverSkeletonCard key={index} />
            ))}
          </div>
        ) : skills.length ? (
          <div className="discover-grid">
            {skills.map((skill) => {
              const typeMeta = getPackageTypeMeta(skill.type);
              return (
                <article
                  className="discover-card"
                  key={skill.publicId}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSkillDetail(skill)}
                  onKeyDown={(event) => handleCardKeyDown(event, skill)}
                >
                  <div className="discover-card-head">
                    <h2>{skill.name}</h2>
                    <span className={`discover-type-pill ${typeMeta.className}`}>
                      {typeMeta.label}
                    </span>
                  </div>
                  <p className='grow'>{skill.description || '暂无描述。'}</p>
                  <div className="discover-divider" />
                  <div className="flex justify-between items-center">
                    <div className="discover-category">
                      {skill.category?.name || '未分类'}
                    </div>
                    {skill.publisher?.name ? (
                      <div className="discover-publisher">
                        <span>{skill.publisher.name}</span>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state discover-empty flex flex-col h-full">
            <div>
              <img src="/robot.webp" alt="" className="w-32 h-32" />
            </div>
            <p>{error || '未找到匹配的 Skill。'}</p>
            {!normalizedApiKey && (
              <div>
               
              <p className="mt-2 text-xs text-muted-foreground">
                 没有 API Key? 请先前往
                 <a
                   href="https://skillpkg.com"
                   onClick={openSkillpkgSite}
                   className="mx-1 underline"
                 >
                   技能包
                 </a>
                 注册或登录，然后在个人中心创建 API Key。
              </p>
               <Button
                variant="default"
                className="mt-6"
                onClick={() => navigate('/settings')}
              >
                去设置 API Key
              </Button>
              </div>
            )}
          </div>
        )}

        {error && skills.length > 0 ? (
          <div className="notice discover-inline-error">
            <p>{error}</p>
          </div>
        ) : null}

        {loadingMore ? (
          <div className="discover-bottom-skeleton">
            <DiscoverSkeletonCard />
            <DiscoverSkeletonCard />
          </div>
        ) : null}

        <div ref={sentinelRef} className="discover-sentinel" aria-hidden="true" />
      </div>
    </section>
  );
};

export default DiscoverPage;
