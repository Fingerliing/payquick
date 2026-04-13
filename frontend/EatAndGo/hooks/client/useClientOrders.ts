import { useCallback, useEffect, useRef, useState } from "react";
import { clientOrderService } from "@/services/clientOrderService";
import type { OrderList } from "@/types/order";
import type { OrderSearchFilters, ListResponse } from "@/types/common";
import { normalizeListResponse } from "@/types/common";

type Pagination = { page: number; limit: number; total: number; pages: number };

export function useClientOrders(initialFilters?: Partial<OrderSearchFilters>) {
  const [orders, setOrders] = useState<OrderList[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, pages: 1 });
  const [filters, setFilters] = useState<Partial<OrderSearchFilters>>(initialFilters ?? {});

  // ── Refs pour lire les valeurs courantes sans les mettre en deps ─────────
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // ── fetchOrders stable (aucune dep state → jamais recréé) ───────────────
  const fetchOrders = useCallback(async (opts?: { page?: number; limit?: number; filters?: Partial<OrderSearchFilters> }) => {
    setLoading(true);
    setError(null);
    try {
      const page = opts?.page ?? paginationRef.current.page;
      const limit = opts?.limit ?? paginationRef.current.limit;
      const mergedFilters = { ...filtersRef.current, ...(opts?.filters ?? {}) };
      const resp: ListResponse<OrderList> = await clientOrderService.getOrders({ page, limit, ...mergedFilters });
      const { data, pagination: p } = normalizeListResponse<OrderList>(resp, { page, limit });
      setOrders(data);
      setPagination(p);
      if (opts?.filters) {
        setFilters(mergedFilters);
      }
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors du chargement des commandes");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── search stable ───────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp: ListResponse<OrderList> = await clientOrderService.searchOrders(q, filtersRef.current as OrderSearchFilters);
      const { data, pagination: p } = normalizeListResponse<OrderList>(resp, { page: 1, limit: paginationRef.current.limit });
      setOrders(data);
      setPagination(p);
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, []); // eslint-disable-line

  return { orders, isLoading, error, pagination, filters, setFilters, fetchOrders, search };
}