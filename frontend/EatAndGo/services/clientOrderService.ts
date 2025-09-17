import { apiClient } from './api';
import type { CartItem } from '../types/cart';
import type {
  OrderList,
  OrderDetail,
  CreateOrderRequest,
  CreateOrderRequestLegacy,
  CreateOrderItemInput,
} from '../types/order';
import { normalizeCreateOrderRequest, isValidCreateOrderRequest } from '../types/order';
import type { OrderSearchFilters, ListResponse } from '../types/common';
import { extractErrorMessage, logAPIError } from '../types/apiErrors';

/**
 * Debug helper pour diagnostiquer les erreurs de commande
 */
const debugOrderPayload = (payload: any) => {
  console.log('🔍 DEBUG ORDER PAYLOAD:');
  console.log('Raw payload:', JSON.stringify(payload, null, 2));
  
  // Vérifications des champs requis selon le schéma backend
  const checks = {
    hasRestaurant: !!payload.restaurant && typeof payload.restaurant === 'number',
    hasOrderType: !!payload.order_type && ['dine_in', 'takeaway'].includes(payload.order_type),
    hasTableNumber: payload.order_type === 'dine_in' ? !!payload.table_number : true,
    hasCustomerName: !!payload.customer_name && payload.customer_name.trim().length > 0,
    hasItems: !!payload.items && Array.isArray(payload.items) && payload.items.length > 0,
    hasPhone: typeof payload.phone === 'string', // Peut être vide mais doit exister
    hasPaymentMethod: typeof payload.payment_method === 'string',
    hasNotes: typeof payload.notes === 'string', // Peut être vide mais doit exister
    itemsFormat: payload.items?.every((item: any) => 
      item.hasOwnProperty('menu_item') && 
      typeof item.menu_item === 'number' &&
      typeof item.quantity === 'number' && 
      item.quantity > 0 &&
      typeof item.unit_price === 'string' && // ✅ unit_price requis
      item.hasOwnProperty('customizations') &&
      typeof item.special_instructions === 'string'
    )
  };
  
  console.log('✅ Validation checks:', checks);
  
  if (payload.items) {
    console.log('🔍 Items details:');
    payload.items.forEach((item: any, index: number) => {
      console.log(`  Item ${index}:`, {
        menu_item: item.menu_item,
        quantity: item.quantity,
        unit_price: item.unit_price,
        hasValidMenuItemId: typeof item.menu_item === 'number',
        hasValidQuantity: typeof item.quantity === 'number' && item.quantity > 0,
        hasValidUnitPrice: typeof item.unit_price === 'string',
        hasCustomizations: item.hasOwnProperty('customizations'),
        hasSpecialInstructions: typeof item.special_instructions === 'string'
      });
    });
  }
  
  const errors = Object.entries(checks)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
    
  if (errors.length > 0) {
    console.log('❌ Validation errors:', errors);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    checks
  };
};

export class ClientOrderService {
  /**
   * Helper pour récupérer le prix d'un menu item
   */
  private async getMenuItemPrice(menuItemId: number): Promise<string> {
    try {
      const data = await apiClient.get(`/api/v1/menu-items/${menuItemId}/`);
      return data.price || "0.00";
    } catch (error) {
      console.warn(`⚠️ Could not fetch price for menu item ${menuItemId}:`, error);
      return "0.00";
    }
  }

  /**
   * Méthode de debug pour diagnostiquer les problèmes de création de commande
   */
  async debugOrderCreation(payload: any) {
    console.log('🔍 DEBUGGING ORDER CREATION STEP BY STEP');
    
    try {
      // 1. Vérifier si le restaurant existe
      console.log('1️⃣ Checking restaurant existence...');
      try {
        const restaurantCheck = await apiClient.get(`/api/v1/restaurants/${payload.restaurant}/`);
        console.log('✅ Restaurant exists:', { id: restaurantCheck.id, name: restaurantCheck.name });
      } catch (error: any) {
        console.log('❌ Restaurant check failed:', error.response?.data);
        throw new Error(`Restaurant ${payload.restaurant} does not exist or is not accessible`);
      }

      // 2. Vérifier si les menu items existent et appartiennent au restaurant
      console.log('2️⃣ Checking menu items...');
      for (const item of payload.items) {
        try {
          const menuItemCheck = await apiClient.get(`/api/v1/menu-items/${item.menu_item}/`);
          console.log(`✅ Menu item ${item.menu_item} exists:`, {
            id: menuItemCheck.id,
            name: menuItemCheck.name,
            price: menuItemCheck.price,
            restaurant: menuItemCheck.restaurant
          });
          
          // Vérifier que le menu item appartient au bon restaurant
          if (menuItemCheck.restaurant !== payload.restaurant) {
            throw new Error(`Menu item ${item.menu_item} belongs to restaurant ${menuItemCheck.data.restaurant}, not ${payload.restaurant}`);
          }
        } catch (error: any) {
          console.log(`❌ Menu item ${item.menu_item} check failed:`, error.response?.data);
          throw new Error(`Menu item ${item.menu_item} does not exist or is not accessible`);
        }
      }

      console.log('3️⃣ All checks passed, attempting order creation...');
      return payload;

    } catch (error: any) {
      console.error('🚨 Debug process failed:', error);
      throw error;
    }
  }

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
   * ✅ VERSION FINALE: createFromCart parfaitement aligné avec le schéma backend
   */
  async createFromCart(args: {
    restaurant: number;
    order_type: 'dine_in' | 'takeaway';
    table_number?: string;
    table?: number; // pour compatibilité avec l'ancien code
    customer_name: string;
    phone?: string;
    payment_method?: string;
    notes?: string | null;
    items: CartItem[]; // ✅ Type spécifique CartItem[] au lieu de any[]
  }): Promise<OrderDetail> {
    
    console.log('🚀 Starting order creation with args:', args);
    
    // Validate input arguments
    if (!args.restaurant || typeof args.restaurant !== 'number') {
      throw new Error('Valid restaurant ID is required');
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
      // ✅ CONVERSION COMPLÈTE: Convertir vers le format exact attendu par le backend
      console.log('🔍 Converting items with full backend compliance...');
      
      const validatedItems: CreateOrderItemInput[] = await Promise.all(
        args.items.map(async (item, index) => {
          // Extraire l'ID du menu item (essayer plusieurs propriétés possibles)
          let menuItemId: number;
          
          if (typeof item.id === 'string' || typeof item.id === 'number') {
            menuItemId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
          } else if (typeof item.menuItemId === 'string' || typeof item.menuItemId === 'number') {
            menuItemId = typeof item.menuItemId === 'string' ? parseInt(item.menuItemId, 10) : item.menuItemId;
          } else {
            throw new Error(`Item at index ${index}: missing valid menu item ID (checked: id, menuItemId, menu_item)`);
          }
          
          if (isNaN(menuItemId) || menuItemId <= 0) {
            throw new Error(`Item at index ${index}: invalid menu item ID "${menuItemId}"`);
          }
          
          const quantity = Number(item.quantity);
          if (isNaN(quantity) || quantity <= 0) {
            throw new Error(`Item at index ${index}: invalid quantity "${item.quantity}"`);
          }

          // ✅ RÉCUPÉRER LE PRIX : Soit depuis l'item, soit depuis l'API
          let unitPrice = "0.00";
          if (item.price) {
            unitPrice = String(item.price);
          } else {
            // Récupérer le prix depuis l'API menu-items
            try {
              unitPrice = await this.getMenuItemPrice(menuItemId);
              console.log(`💰 Prix récupéré pour item ${menuItemId}: ${unitPrice}`);
            } catch (priceError) {
              console.warn(`⚠️ Could not fetch price for menu item ${menuItemId}, using 0.00`);
            }
          }
          
          // ✅ CONSTRUIRE L'OBJET COMPLET selon le schéma exact du backend
          const orderItem: CreateOrderItemInput = {
            menu_item: menuItemId,
            quantity: quantity,
            unit_price: unitPrice, // ✅ REQUIS par le backend
            customizations: item.customizations || {}, // ✅ Objet vide par défaut
            special_instructions: item.specialInstructions || "", // ✅ String vide par défaut
          };
          
          return orderItem;
        })
      );
      
      console.log('✅ Validated items with full backend compliance:', validatedItems);
      
      // ✅ CONSTRUIRE LE PAYLOAD COMPLET selon le schéma exact du backend
      const payload: CreateOrderRequest = {
        restaurant: args.restaurant,
        order_type: args.order_type,
        table_number: tableNumber.trim(),
        customer_name: args.customer_name.trim(),
        phone: args.phone || "", // ✅ String vide par défaut (requis par le schéma)
        payment_method: args.payment_method || "cash", // ✅ Valeur par défaut
        notes: args.notes || "", // ✅ String vide par défaut (requis par le schéma)
        items: validatedItems,
      };

      // Debug du payload avant envoi
      const debugResult = debugOrderPayload(payload);
      if (!debugResult.isValid) {
        console.log('❌ Payload validation failed, running debug...');
        await this.debugOrderCreation(payload);
        throw new Error(`Payload validation failed: ${debugResult.errors.join(', ')}`);
      }

      // Validation avec type guard
      if (!isValidCreateOrderRequest(payload)) {
        throw new Error('Payload does not match CreateOrderRequest interface');
      }

      console.log('📤 Final payload being sent (backend aligned):', JSON.stringify(payload, null, 2));

      const response = await apiClient.post('/api/v1/orders/', payload);
      console.log('✅ Order created successfully:', response);
      return response;
      
    } catch (err: any) {
      console.error('❌ Order creation failed:', err);
      
      const resp = err?.response;
      if (resp?.data) {
        console.log('🧪 Raw server error response:', {
          status: resp.status,
          statusText: resp.statusText,
          data: resp.data
        });
        
        // Extraction d'erreur détaillée pour DRF
        const errorData = resp.data;
        let errorMessage = 'Erreur inconnue';
        
        // Gestion spécifique des erreurs DRF
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
        
        // Log l'erreur formatée
        console.log('📋 Formatted error message:', errorMessage);
        
        throw new Error(errorMessage);
      }
      
      // Si pas de response, c'est probablement une erreur réseau
      throw new Error(err?.message || 'Erreur de connexion au serveur');
    }
  }

  /**
   * Test different payload formats to understand backend expectations
   */
  async debugOrderCreationFormats(basePayload: any) {
    const testCases = [
      {
        name: 'Backend-aligned payload',
        payload: {
          restaurant: basePayload.restaurant,
          order_type: basePayload.order_type,
          table_number: String(basePayload.table_number || basePayload.table || '1'),
          customer_name: basePayload.customer_name || 'Client Test',
          phone: basePayload.phone || "",
          payment_method: basePayload.payment_method || "cash",
          notes: basePayload.notes || "",
          items: (basePayload.items || []).map((item: any) => ({
            menu_item: Number(item.menu_item || item.id || item.menuItemId),
            quantity: Number(item.quantity),
            unit_price: String(item.unit_price || item.price || "0.00"),
            customizations: item.customizations || {},
            special_instructions: item.special_instructions || item.specialInstructions || ""
          }))
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`\n🧪 Testing: ${testCase.name}`);
        console.log('Payload:', JSON.stringify(testCase.payload, null, 2));
        
        // Validate avec notre type guard
        if (!isValidCreateOrderRequest(testCase.payload)) {
          console.log(`❌ ${testCase.name} failed type validation`);
          continue;
        }
        
        const response = await apiClient.post('/api/v1/orders/', testCase.payload);
        console.log(`✅ ${testCase.name} succeeded:`, response);
        return { success: true, testCase: testCase.name, data: response};
        
      } catch (error: unknown) {
        logAPIError(error, `Debug test: ${testCase.name}`);
      }
    }
    
    throw new Error('All test cases failed');
  }

  /**
   * Liste des commandes du client connecté
   */
  /**
   * getOrders avec logs détaillés
   */
  async getOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderSearchFilters['status'];
    restaurant?: OrderSearchFilters['restaurant'];
    order_type?: OrderSearchFilters['order_type'];
    search?: string;
  }): Promise<ListResponse<OrderList>> {
    
    console.log('📡 === getOrders CALL ===');
    console.log('📝 Params envoyés:', params);
    
    const { page, limit, ...rest } = params ?? {};
    
    const apiParams = {
      page,
      page_size: limit,
      ...rest,
    };
    
    console.log('📡 Params API finaux:', apiParams);
    
    try {
      const data = await apiClient.get('/api/v1/orders/', { params: apiParams });
      console.log('✅ Réponse getOrders:', {
        keys: Object.keys(data || {}),
        count: data?.count,
        resultsLength: data?.results?.length,
      });
      return data;
      
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Recherche (propage ?search= vers DRF SearchFilter)
   */
  async searchOrders(query: string, filters?: Partial<OrderSearchFilters>): Promise<ListResponse<OrderList>> {
    const data = await apiClient.get('/api/v1/orders/', {
        params: { search: query, ...(filters ?? {}) },
      });
      return data;
  }

  /**
   * Détail d'une commande
   */
  async getOrderById(id: number): Promise<OrderDetail> {
    const data = await apiClient.get(`/api/v1/orders/${id}/`);
    return data;
  }

  /**
   * Création directe (si tu construis déjà CreateOrderRequest côté appelant)
   */
  async createOrder(payload: CreateOrderRequest): Promise<OrderDetail> {
    // Validation avec type guard
    if (!isValidCreateOrderRequest(payload)) {
      throw new Error('Invalid order payload');
    }
    
    const data = await apiClient.post('/api/v1/orders/', payload);
    console.log('✅ Order created successfully:', data);
    return data;
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