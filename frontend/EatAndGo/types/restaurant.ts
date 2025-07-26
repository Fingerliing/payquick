export interface Restaurant {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  image?: string;
  coverImage?: string;
  cuisine: string;
  priceRange: 1 | 2 | 3 | 4;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isManuallyOverridden?: boolean;
  manualOverrideUntil?: string | null;
  manualOverrideReason?: string;
  can_receive_orders: boolean;
  openingHours: OpeningHours[];
  location: {
    latitude: number;
    longitude: number;
  };
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningHours {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface RestaurantStats {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  popularItems: PopularItem[];
  revenueByMonth: MonthlyRevenue[];
}

export interface PopularItem {
  id: string;
  name: string;
  orderCount: number;
  revenue: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  orders: number;
}

// types/menu.ts
export interface Menu {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  isActive: boolean;
  categories: MenuCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  products: Product[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image?: string;
  isAvailable: boolean;
  isVegetarian: boolean;
  isVegan: boolean;
  isGlutenFree: boolean;
  allergens: string[];
  preparationTime: number; // en minutes
  calories?: number;
  ingredients: string[];
  nutritionalInfo?: NutritionalInfo;
  variants?: ProductVariant[];
  addons?: ProductAddon[];
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  priceModifier: number;
  isDefault: boolean;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
  isRequired: boolean;
  maxQuantity: number;
}