import { useQuery, QueryKey } from "@tanstack/react-query";

/**
 * Hook de polling a 1s que aborta bien y evita renders grandes.
 * - key: clave única de cache
 * - fetcher: (signal) => Promise<T>
 * - select: proyección opcional para reducir re-renders
 */
export function useLiveQuery<T, S = T>(
  key: QueryKey,
  fetcher: (signal?: AbortSignal) => Promise<T>,
  select?: (data: T) => S
) {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    // el intervalo por defecto viene del QueryClient (1s)
    keepPreviousData: true,
    select,
  });
}
