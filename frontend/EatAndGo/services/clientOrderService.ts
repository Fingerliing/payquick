import { apiClient } from './api';
import type { CartItem } from '../types/cart';
import type {
  OrderList,
  OrderDetail,
  CreateOrderRequest,
  CreateOrderItemInput,
} from '../types/order';
import { isValidCreateOrderRequest } from '../types/order';
import type { OrderSearchFilters, ListResponse } from '../types/common';
import { logAPIError } from '../types/apiErrors';

export class ClientOrderService {
  /**
   * Création de commande depuis le panier
   */
  async createFromCart(args: {
    restaurant: number | string;  // Accepter les deux types
    order_type: 'dine_in' | 'takeaway';
    table_number?: string;
    table?: number; // pour compatibilité avec l'ancien code
    customer_name: string;
    phone?: string;
    payment_method?: string;
    notes?: string | null;
    items: CartItem[];
  }): Promise<OrderDetail> {
    
    console.log('🚀 Starting order creation with args:', args);
    
    // Convertir restaurant ID en number
    const restaurantId = typeof args.restaurant === 'string' 
      ? parseInt(args.restaurant, 10) 
      : args.restaurant;
    
    // Validate input arguments
    if (!restaurantId || isNaN(restaurantId) || restaurantId <= 0) {
      throw new Error(`Valid restaurant ID is required (got: ${args.restaurant})`);
    }
    
    if (!args.items || args.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    // Gérer table vs table_number
    const tableNumber = args.table_number || String(args.table || '');
    
    if (args.order_type === 'dine_in' && (!tableNumber || tableNumber.trim() === '')) {
      throw new Error('Valid table number is required for dine-in orders');
    }

    if (!args.customer_name || args.customer_name.trim().length === 0) {
      throw new Error('Customer name is required');
    }

    try {
      // Convertir les items du panier au format attendu par le backend
      const validatedItems: CreateOrderItemInput[] = args.items.map((item, index) => {
        // Extraire l'ID du menu item
        let menuItemId: number;
        
        if (typeof item.id === 'string' || typeof item.id === 'number') {
          menuItemId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
        } else if (typeof item.menuItemId === 'string' || typeof item.menuItemId === 'number') {
          menuItemId = typeof item.menuItemId === 'string' ? parseInt(item.menuItemId, 10) : item.menuItemId;
        } else {
          throw new Error(`Item at index ${index}: missing valid menu item ID`);
        }
        
        if (isNaN(menuItemId) || menuItemId <= 0) {
          throw new Error(`Item at index ${index}: invalid menu item ID "${menuItemId}"`);
        }
        
        const quantity = Number(item.quantity);
        if (isNaN(quantity) || quantity <= 0) {
          throw new Error(`Item at index ${index}: invalid quantity "${item.quantity}"`);
        }

        // Construire l'objet sans unit_price
        // Le backend récupérera le prix depuis la base de données
        return {
          menu_item: menuItemId,
          quantity: quantity,
          customizations: item.customizations || {},
          special_instructions: item.specialInstructions || "",
        };
      });
      
      // Construire le payload final
      const payload: CreateOrderRequest = {
        restaurant: restaurantId,
        order_type: args.order_type,
        table_number: tableNumber.trim(),
        customer_name: args.customer_name.trim(),
        phone: args.phone || "",
        payment_method: args.payment_method || "cash",
        notes: args.notes || "",
        items: validatedItems,
      };

      // Validation avec type guard
      if (!isValidCreateOrderRequest(payload)) {
        throw new Error('Payload does not match CreateOrderRequest interface');
      }

      console.log('📤 Sending order payload:', JSON.stringify(payload, null, 2));

      const response = await apiClient.post('/api/v1/orders/', payload);
      console.log('✅ Order created successfully:', response);
      return response;
      
    } catch (err: any) {
      console.error('❌ Order creation failed:', err);
      
      const resp = err?.response;
      if (resp?.data) {
        console.log('Server error response:', {
          status: resp.status,
          statusText: resp.statusText,
          data: resp.data
        });
        
        // Extraction d'erreur détaillée pour DRF
        const errorData = resp.data;
        let errorMessage = 'Erreur inconnue';
        
        if (errorData.error) {
          errorMessage = Array.isArray(errorData.error) 
            ? errorData.error.join('\n') 
            : String(errorData.error);
        } else if (errorData.errors) {
          errorMessage = Array.isArray(errorData.errors) 
            ? errorData.errors.join('\n') 
            : String(errorData.errors);
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) 
            ? errorData.non_field_errors.join('\n') 
            : String(errorData.non_field_errors);
        } else if (errorData.detail) {
          errorMessage = String(errorData.detail);
        } else if (typeof errorData === 'object') {
          // Gestion des erreurs de validation par champ
          const fieldErrors = [];
          for (const [field, messages] of Object.entries(errorData)) {
            if (Array.isArray(messages)) {
              fieldErrors.push(`${field}: ${messages.join(', ')}`);
            } else if (typeof messages === 'string') {
              fieldErrors.push(`${field}: ${messages}`);
            } else if (typeof messages === 'object') {
              fieldErrors.push(`${field}: ${JSON.stringify(messages)}`);
            }
          }
          errorMessage = fieldErrors.length > 0 ? fieldErrors.join('\n') : JSON.stringify(errorData);
        }
        
        console.log('Formatted error message:', errorMessage);
        throw new Error(errorMessage);
      }
      
      throw new Error(err?.message || 'Erreur de connexion au serveur');
    }
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
    
    const apiParams = {
      page,
      page_size: limit,
      ...rest,
    };
    
    try {
      const data = await apiClient.get('/api/v1/orders/', { params: apiParams });
      return data;
    } catch (error: any) {
      logAPIError(error, 'getOrders');
      throw error;
    }
  }

  /**
   * Recherche de commandes
   */
  async searchOrders(query: string, filters?: Partial<OrderSearchFilters>): Promise<ListResponse<OrderList>> {
    try {
      const data = await apiClient.get('/api/v1/orders/', {
        params: { search: query, ...(filters ?? {}) },
      });
      return data;
    } catch (error: any) {
      logAPIError(error, 'searchOrders');
      throw error;
    }
  }

  /**
   * Détail d'une commande
   */
  async getOrderById(id: number): Promise<OrderDetail> {
    try {
      const data = await apiClient.get(`/api/v1/orders/${id}/`);
      return data;
    } catch (error: any) {
      logAPIError(error, `getOrderById(${id})`);
      throw error;
    }
  }

  /**
   * Création directe de commande
   */
  async createOrder(payload: CreateOrderRequest): Promise<OrderDetail> {
    // Validation avec type guard
    if (!isValidCreateOrderRequest(payload)) {
      throw new Error('Invalid order payload');
    }
    
    try {
      const data = await apiClient.post('/api/v1/orders/', payload);
      console.log('✅ Order created successfully:', data);
      return data;
    } catch (error: any) {
      logAPIError(error, 'createOrder');
      throw error;
    }
  }

  /**
   * Annuler une commande
   */
  async cancelOrder(orderId: number) {
    try {
      return await apiClient.post(`/api/v1/orders/${orderId}/cancel/`);
    } catch (error: any) {
      logAPIError(error, `cancelOrder(${orderId})`);
      throw error;
    }
  }

  /**
   * Évaluer une commande terminée
   */
  async rateOrder(orderId: number, rating: number, comment?: string) {
    try {
      return await apiClient.post(`/api/v1/orders/${orderId}/rate/`, { rating, comment });
    } catch (error: any) {
      logAPIError(error, `rateOrder(${orderId})`);
      throw error;
    }
  }
}

export const clientOrderService = new ClientOrderService();