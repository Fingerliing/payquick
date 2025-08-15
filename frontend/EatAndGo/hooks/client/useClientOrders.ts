import { useCallback, useEffect, useState } from "react";
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

  const fetchOrders = useCallback(async (opts?: { page?: number; limit?: number; filters?: Partial<OrderSearchFilters> }) => {
    setLoading(true);
    setError(null);
    try {
      const page = opts?.page ?? pagination.page;
      const limit = opts?.limit ?? pagination.limit;
      const mergedFilters = { ...filters, ...(opts?.filters ?? {}) };
      const resp: ListResponse<OrderList> = await clientOrderService.getOrders({ page, limit, ...mergedFilters });
      const { data, pagination: p } = normalizeListResponse<OrderList>(resp, { page, limit });
      setOrders(data);
      setPagination(p);
      setFilters(mergedFilters);
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors du chargement des commandes");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp: ListResponse<OrderList> = await clientOrderService.searchOrders(q, filters as OrderSearchFilters);
      const { data, pagination: p } = normalizeListResponse<OrderList>(resp, { page: 1, limit: pagination.limit });
      setOrders(data);
      setPagination(p);
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchOrders();
  }, []); // eslint-disable-line

  return { orders, isLoading, error, pagination, filters, setFilters, fetchOrders, search };
}
