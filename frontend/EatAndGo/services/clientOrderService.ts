import { apiClient } from './api';
import type { CartItem } from '../types/cart';
import type {
  OrderList,
  OrderDetail,
  CreateOrderRequest,
  CreateOrderItemInput,
} from '../types/order';
import type { OrderSearchFilters, ListResponse } from '../types/common';
import { extractErrorMessage, logAPIError } from '../types/apiErrors';

// Type flexible pour accepter différentes structures d'items
type CartItemInput = {
  menuItemId?: number | string;
  menu_item?: number | string;
  id?: number | string;
  quantity: number;
  customizations?: Record<string, unknown>;
  specialInstructions?: string;
};

/**
 * Helper pour normaliser et valider les items du panier en CreateOrderItemInput[]
 */
function toOrderItems(items: CartItemInput[]): CreateOrderItemInput[] {
  return items.map<CreateOrderItemInput>((item, idx) => {
    const rawId = item.menuItemId ?? item.menu_item ?? item.id;
    if (rawId == null) {
      throw new Error(`items[${idx}]: missing menu item id`);
    }
    
    const menu_item = typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;
    if (!Number.isFinite(menu_item) || menu_item <= 0) {
      throw new Error(`items[${idx}]: invalid menu item id "${String(rawId)}"`);
    }
    
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`items[${idx}]: invalid quantity "${String(item.quantity)}"`);
    }
    
    const out: CreateOrderItemInput = { menu_item, quantity };
    
    if (item.customizations && typeof item.customizations === "object") {
      out.customizations = item.customizations;
    }
    
    if (item.specialInstructions && typeof item.specialInstructions === "string") {
      out.special_instructions = item.specialInstructions;
    }
    
    return out;
  });
}

export class ClientOrderService {
  /**
   * Test endpoint to validate order structure
   */
  async testOrderValidation(payload: any) {
    try {
      console.log('Testing order payload:', JSON.stringify(payload, null, 2));
      
      // Try to get order schema/validation rules if available
      const response = await apiClient.options('/api/v1/orders/');
      console.log('Order endpoint schema:', response);
      
      return response;
    } catch (error: unknown) {
      logAPIError(error, 'Order validation test');
      throw error;
    }
  }

  /**
   * Enhanced createFromCart with better error handling
   * Compatible avec votre structure Cart et CartItem existante
   */
  async createFromCart(args: {
    restaurant: number;
    order_type: 'dine_in' | 'takeaway';
    table: number;
    customer_name: string;
    notes?: string | null;
    items: CartItem[]; // Utilise directement votre type CartItem
  }): Promise<OrderDetail> {
    
    // Validate input arguments
    if (!args.restaurant || typeof args.restaurant !== 'number') {
      throw new Error('Valid restaurant ID is required');
    }
    
    if (!args.items || args.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    if (args.order_type === 'dine_in' && (!args.table || typeof args.table !== 'number')) {
      throw new Error('Valid table number is required for dine-in orders');
    }

    if (!args.customer_name || args.customer_name.trim().length === 0) {
      throw new Error('Customer name is required');
    }

    try {
      // Utiliser la fonction helper pour normaliser et valider les items
      const validatedItems = toOrderItems(args.items);
      
      const payload: CreateOrderRequest & any = {
        restaurant: Number(args.restaurant),
        order_type: args.order_type,       // ex: 'dine_in'
        table_number: String(args.table),  // alias très souvent attendu côté backend
        customer_name: args.customer_name.trim(),
        notes: args.notes?.trim() || null,
        items: validatedItems,             // { menu_item, quantity, ... }
      };

      console.log('📤 Sending order payload:', JSON.stringify(payload, null, 2));

      const response = await apiClient.post('/api/v1/orders/', payload);
      console.log('✅ Order created successfully:', response.data);
      return response.data;
      
      } catch (err: any) {
        const resp = err?.response;
        if (resp?.data) {
          // 🔎 log brut pour voir la structure exacte
          console.log('🧪 Raw server error:', JSON.stringify(resp.data, null, 2));
          // 🔙 si DRF renvoie { error: [...] } ou { error: "..." }
          const e = resp.data;
          const arr =
            e?.error ??
            e?.errors ??
            e?.non_field_errors ??
            e?.detail ??
            e; // dernier recours
          const msg = Array.isArray(arr) ? arr.join('\n') :
                      typeof arr === 'object' ? JSON.stringify(arr) :
                      String(arr);
          throw new Error(msg);
        }
        throw err;
      }
    }

  /**
   * Test different payload formats to understand backend expectations
   */
  async debugOrderCreation(basePayload: any) {
    const testCases = [
      {
        name: 'Original payload',
        payload: basePayload
      },
      {
        name: 'With empty strings instead of null',
        payload: {
          ...basePayload,
          customer_name: basePayload.customer_name || '',
          notes: basePayload.notes || '',
          table: basePayload.table || ''
        }
      },
      {
        name: 'With required customer_name',
        payload: {
          ...basePayload,
          customer_name: basePayload.customer_name || 'Client'
        }
      },
      {
        name: 'With table as string',
        payload: {
          ...basePayload,
          table: basePayload.table ? String(basePayload.table) : null
        }
      },
      {
        name: 'Minimal payload',
        payload: {
          restaurant: basePayload.restaurant,
          order_type: basePayload.order_type,
          items: basePayload.items
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`\n🧪 Testing: ${testCase.name}`);
        console.log('Payload:', JSON.stringify(testCase.payload, null, 2));
        
        const response = await apiClient.post('/api/v1/orders/', testCase.payload);
        console.log(`✅ ${testCase.name} succeeded:`, response.data);
        return { success: true, testCase: testCase.name, data: response.data };
        
      } catch (error: unknown) {
        logAPIError(error, `Debug test: ${testCase.name}`);
      }
    }
    
    throw new Error('All test cases failed');
  }

  /**
   * Liste des commandes du client connecté
   */
  async getOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderSearchFilters['status'];
    restaurant?: OrderSearchFilters['restaurant'];
    order_type?: OrderSearchFilters['order_type'];
    search?: string;
  }): Promise<ListResponse<OrderList>> {
    const { page, limit, ...rest } = params ?? {};
    const response = await apiClient.get('/api/v1/orders/', {
      params: {
        page,
        page_size: limit, // DRF par défaut
        ...rest,
      },
    });
    return response.data;
  }

  /**
   * Recherche (propage ?search= vers DRF SearchFilter)
   */
  async searchOrders(query: string, filters?: Partial<OrderSearchFilters>): Promise<ListResponse<OrderList>> {
    const response = await apiClient.get('/api/v1/orders/', {
      params: {
        search: query,
        ...(filters ?? {}),
      },
    });
    return response.data;
  }

  /**
   * Détail d'une commande
   */
  async getOrderById(id: number): Promise<OrderDetail> {
    const response = await apiClient.get(`/api/v1/orders/${id}/`);
    return response.data;
  }

  /**
   * Création directe (si tu construis déjà CreateOrderRequest côté appelant)
   */
  async createOrder(payload: CreateOrderRequest): Promise<OrderDetail> {
    const response = await apiClient.post('/api/v1/orders/', payload);
    return response.data;
  }

  /**
   * Annuler une commande (action dédiée côté backend)
   */
  async cancelOrder(orderId: number) {
    return apiClient.post(`/api/v1/orders/${orderId}/cancel/`);
  }

  /**
   * Évaluer une commande terminée
   */
  async rateOrder(orderId: number, rating: number, comment?: string) {
    return apiClient.post(`/api/v1/orders/${orderId}/rate/`, { rating, comment });
  }
}

export const clientOrderService = new ClientOrderService();