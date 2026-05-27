const DEFAULT_SKILLPKG_API_BASE_URL = 'https://skillpkg.com';

const normalizeBaseUrl = (baseUrl) =>
  String(baseUrl || DEFAULT_SKILLPKG_API_BASE_URL).replace(/\/+$/, '');

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

const buildSkillpkgSkillsPath = ({
  categoryPublicIds,
  q,
  isFeatured,
  page,
  pageSize,
} = {}) => {
  const params = new URLSearchParams();
  const normalizedCategoryPublicIds = Array.isArray(categoryPublicIds)
    ? categoryPublicIds
        .map((categoryPublicId) => String(categoryPublicId || '').trim())
        .filter(Boolean)
    : [];

  if (normalizedCategoryPublicIds.length) {
    params.set('categoryPublicIds', normalizedCategoryPublicIds.join(','));
  }
  if (String(q || '').trim()) {
    params.set('q', String(q).trim());
  }
  if (isFeatured) {
    params.set('isFeatured', 'true');
  }

  params.set('page', String(normalizePositiveInteger(page, 1)));
  params.set('pageSize', String(normalizePositiveInteger(pageSize, 20)));

  return `/api/v1/skills?${params.toString()}`;
};

const buildSkillpkgSkillDetailPath = (publicId) =>
  `/api/v1/skills/${encodeURIComponent(String(publicId || '').trim())}`;

const buildSkillpkgSkillDownloadPath = (publicId) =>
  `${buildSkillpkgSkillDetailPath(publicId)}/download`;

const requestSkillpkg = async ({
  apiKey,
  path,
  baseUrl = process.env.SKILLPKG_API_BASE_URL,
  fetchImpl = fetch,
}) => {
  const token = String(apiKey || '').trim();
  if (!token) return { ok: false, reason: 'api-key-required' };

  let response;
  try {
    response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || 'Network request failed',
    };
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: body?.error || `Request failed: ${response.status}`,
    };
  }

  return { ok: true, data: body?.data || {} };
};

const listSkillpkgCategories = async (options = {}) => {
  const result = await requestSkillpkg({
    ...options,
    path: '/api/v1/skills/categories',
  });
  if (!result.ok) return result;

  return {
    ok: true,
    categories: Array.isArray(result.data.docs) ? result.data.docs : [],
  };
};

const listSkillpkgSkills = async (options = {}) => {
  const result = await requestSkillpkg({
    ...options,
    path: buildSkillpkgSkillsPath(options),
  });
  if (!result.ok) return result;

  const docs = Array.isArray(result.data.docs)
    ? result.data.docs
    : [];

  return {
    ok: true,
    docs,
    meta: result.data.meta || {
      totalDocs: docs.length,
      totalPages: docs.length ? 1 : 0,
      page: normalizePositiveInteger(options.page, 1),
      limit: normalizePositiveInteger(options.pageSize, 20),
    },
  };
};

const getSkillpkgSkillDetail = async (options = {}) => {
  const publicId = String(options.publicId || '').trim();
  if (!publicId) return { ok: false, reason: 'invalid-public-id' };

  const result = await requestSkillpkg({
    ...options,
    path: buildSkillpkgSkillDetailPath(publicId),
  });
  if (!result.ok) return result;

  return {
    ok: true,
    detail: result.data || null,
  };
};

const getSkillpkgSkillDownloadUrl = async (options = {}) => {
  const publicId = String(options.publicId || '').trim();
  if (!publicId) return { ok: false, reason: 'invalid-public-id' };

  const result = await requestSkillpkg({
    ...options,
    path: buildSkillpkgSkillDownloadPath(publicId),
  });
  if (!result.ok) return result;

  return {
    ok: true,
    url: typeof result.data.url === 'string' ? result.data.url : '',
  };
};

module.exports = {
  DEFAULT_SKILLPKG_API_BASE_URL,
  buildSkillpkgSkillDetailPath,
  buildSkillpkgSkillDownloadPath,
  buildSkillpkgSkillsPath,
  getSkillpkgSkillDetail,
  getSkillpkgSkillDownloadUrl,
  listSkillpkgCategories,
  listSkillpkgSkills,
};
