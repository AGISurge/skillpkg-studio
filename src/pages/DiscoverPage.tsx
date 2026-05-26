import {
  DismissRegular,
  SearchRegular,
  StarFilled,
} from '@fluentui/react-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SkillpkgCategory, SkillpkgListMeta, SkillpkgSkillSummary } from '../types/models';
import { useAppContext, useToolbar } from '../AppContext';

const DISCOVER_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 260;

const getErrorMessage = (reason?: string, status?: number) => {
  if (reason === 'api-key-required') return '请先在设置页配置 SkillPKG API Key。';
  if (status === 401) return 'API Key 无效或已过期，请在设置页更新。';
  return reason || '读取 SkillPkg 发现列表失败，请稍后重试。';
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

const DiscoverPage = () => {
  const { apiKey } = useAppContext();
  const [categories, setCategories] = useState<SkillpkgCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearchValue, setDebouncedSearchValue] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
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

  const normalizedApiKey = apiKey.trim();
  const selectedCategoryKey = useMemo(
    () => [...selectedCategoryIds].sort().join(','),
    [selectedCategoryIds],
  );
  const selectedCategoryArray = useMemo(
    () => selectedCategoryKey ? selectedCategoryKey.split(',') : [],
    [selectedCategoryKey],
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
        setCategories(result.categories || []);
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
      setSkills(result.docs || []);
      setMeta(result.meta || null);
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
      setSkills((current) => {
        const existingIds = new Set(current.map((skill) => skill.publicId));
        const nextDocs = (result.docs || []).filter((skill) => !existingIds.has(skill.publicId));
        return [...current, ...nextDocs];
      });
      setMeta(result.meta || null);
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

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
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
      <label className="discover-search">
        <SearchRegular className="icon" />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="搜索 Skill"
          aria-label="搜索 Skill"
          disabled={!normalizedApiKey}
        />
        {searchValue ? (
          <button
            type="button"
            className="skill-search-clear"
            aria-label="清空搜索"
            onClick={() => setSearchValue('')}
          >
            <DismissRegular className="icon" />
          </button>
        ) : null}
      </label>
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
            {skills.map((skill) => (
              <article className="discover-card" key={skill.publicId}>
                <div className="discover-card-head">
                  <h2>{skill.name}</h2>
                  <span className="discover-type-pill">Skill</span>
                </div>
                <p>{skill.description || '暂无描述。'}</p>
                <div className="discover-author">
                  <span>{skill.author?.displayName || skill.author?.slug || 'Unknown'}</span>
                </div>
                <div className="discover-divider" />
                <div className="discover-category">
                  {skill.category?.name || '未分类'}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state discover-empty">
            {error || '未找到匹配的 Skill。'}
          </div>
        )}

        {error && skills.length > 0 ? (
          <div className="notice discover-inline-error">{error}</div>
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
