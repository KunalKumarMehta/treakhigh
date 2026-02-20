/**
 * QuizService.js
 * Handles fetching quiz bundles from the backend API.
 *
 * ARCHITECTURE CHANGE: Removed MOCK_BUNDLES. All data now comes from
 * /api/bundles/ (proxied by Nginx to n8n). Includes localStorage caching
 * for offline resilience — bundles are served from cache when offline and
 * refreshed when connectivity is available.
 */

// ── Cache Keys ──────────────────────────────────────────────────────────────
const CACHE_KEY_BUNDLE_PREFIX = "treakhigh_bundle_";
const CACHE_KEY_BUNDLE_LIST = "treakhigh_bundle_list";

// ── API Endpoints ───────────────────────────────────────────────────────────
const BUNDLES_API = "/api/bundles";

export class QuizService {
  /**
   * Fetch a quiz bundle by ID from the backend API.
   *
   * OFFLINE RESILIENCE:
   *   1. Try fetching from /api/bundles/${bundleId}
   *   2. On success → cache the bundle in localStorage, return it
   *   3. On network error → check localStorage cache
   *   4. If no cache available → throw error
   *
   * @param {string} bundleId — Identifier for the question bundle
   * @returns {Promise<Object>} The quiz bundle data
   * @throws {Error} If bundle cannot be fetched or found in cache
   */
  static async fetchBundle(bundleId) {
    const cacheKey = `${CACHE_KEY_BUNDLE_PREFIX}${bundleId}`;

    try {
      const response = await fetch(`${BUNDLES_API}/${bundleId}`);

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status} for bundle: ${bundleId}`,
        );
      }

      const bundle = await response.json();

      // Cache the fresh bundle in localStorage for offline access
      try {
        localStorage.setItem(cacheKey, JSON.stringify(bundle));
      } catch (storageErr) {
        // localStorage may be full or disabled — non-fatal
        console.warn(
          "[QuizService] Failed to cache bundle:",
          storageErr.message,
        );
      }

      return bundle;
    } catch (networkError) {
      // Network error or fetch failure — attempt offline fallback
      console.warn(
        `[QuizService] Fetch failed for "${bundleId}", checking cache:`,
        networkError.message,
      );

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log(`[QuizService] Serving bundle "${bundleId}" from cache.`);
        return JSON.parse(cached);
      }

      // No cache available — cannot recover
      throw new Error(
        `Bundle "${bundleId}" is unavailable offline and not cached. ` +
          `Please connect to the internet and try again.`,
      );
    }
  }

  /**
   * Fetch the list of available quiz bundles.
   *
   * ARCHITECTURE CHANGE: Now async — fetches from /api/bundles.
   * Falls back to cached bundle list when offline.
   *
   * @returns {Promise<Array<{ id: string, title: string, description: string }>>}
   */
  static async getAvailableBundles() {
    try {
      const response = await fetch(BUNDLES_API);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const bundles = await response.json();

      // Normalize to a consistent shape for the UI
      const bundleList = Array.isArray(bundles)
        ? bundles.map((b) => ({
            id: b.bundleId || b.id,
            title: b.title,
            description: b.description || "",
          }))
        : [];

      // Cache the bundle list for offline access
      try {
        localStorage.setItem(CACHE_KEY_BUNDLE_LIST, JSON.stringify(bundleList));
      } catch (storageErr) {
        console.warn(
          "[QuizService] Failed to cache bundle list:",
          storageErr.message,
        );
      }

      return bundleList;
    } catch (networkError) {
      console.warn(
        "[QuizService] Failed to fetch bundle list, checking cache:",
        networkError.message,
      );

      const cached = localStorage.getItem(CACHE_KEY_BUNDLE_LIST);
      if (cached) {
        console.log("[QuizService] Serving bundle list from cache.");
        return JSON.parse(cached);
      }

      // No cache — return empty array so the UI can show a graceful message
      return [];
    }
  }
}
