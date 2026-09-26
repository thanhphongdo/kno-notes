/**
 * Task A15 replaced the bridge that lived here. The real container — hybrid
 * ranking, note suggestions and the lazily warmed embedder — is owned by the
 * search feature; the shell keeps this module path so `shell-client.tsx` does
 * not need to know where it moved.
 */
export {
  SearchContainer, QUERY_DEBOUNCE_MS, type SearchContainerProps,
} from '@/components/features/search/search-container';
