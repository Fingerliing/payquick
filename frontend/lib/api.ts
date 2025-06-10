export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const api = {
  login: `${API_BASE}/api/token/`,
  me: `${API_BASE}/api/me/`,
  register: `${API_BASE}/api/register/`,
  restaurateurs: `${API_BASE}/api/restaurateurs/`,
  restaurants: `${API_BASE}/api/restaurants/`,
  menu: `${API_BASE}/api/menus/`,
  menuDetails: (menuId: number) => `${API_BASE}/api/menus/${menuId}/`,
  menuItems: `${API_BASE}/api/menu-items/`,
  menuItemsDetails: (menuId: number) => `${API_BASE}/api/menu-items/${menuId}/`,
  qrCodes: `${API_BASE}/api/qr-codes/`,
  menuByRestaurant: (restaurantId: number) => `${API_BASE}/api/menus/by_restaurant/${restaurantId}/`,
  orders: `${API_BASE}/api/orders`,
  ordersByRestaurant: (restaurantId: string | number) => `${API_BASE}/api/orders/by_restaurant/${restaurantId}/`,
  orderById: (orderId: string) => `${API_BASE}/api/orders/${orderId}`,
  orderByTable: (tableId: string) => `${API_BASE}/api/orders/menu/table/${tableId}/`,
  ordersCreate: `${API_BASE}/api/orders/submit_order/`,
};
