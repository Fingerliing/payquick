// app/menu/[restaurantId].tsx - Menu client responsive
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

// ✅ TYPES POUR LE MENU
interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  allergens?: string[];
  isVegetarian?: boolean;
  isVegan?: boolean;
  spicyLevel?: number;
  preparationTime?: number;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  customizations?: Record<string, any>;
  specialInstructions?: string;
}

interface Restaurant {
  id: string;
  name: string;
  description?: string;
  cuisine: string;
  image?: string;
}

export default function MenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const { isMobile, isTablet, getSpacing, getFontSize } = useResponsive();

  // ✅ DONNÉES MOCK POUR DÉMONSTRATION
  useEffect(() => {
    const loadMenuData = async () => {
      try {
        setLoading(true);
        
        // Mock restaurant data
        const mockRestaurant: Restaurant = {
          id: restaurantId || '1',
          name: 'Restaurant Le Gourmet',
          description: 'Cuisine française traditionnelle',
          cuisine: 'Française',
        };

        const mockCategories: MenuCategory[] = [
          {
            id: 'entrees',
            name: 'Entrées',
            items: [
              {
                id: '1',
                name: 'Salade César',
                description: 'Salade verte, croûtons, parmesan, sauce César maison',
                price: 12.50,
                category: 'entrees',
                isVegetarian: true,
                preparationTime: 10,
                allergens: ['milk', 'eggs'],
              },
              {
                id: '2',
                name: 'Soupe du jour',
                description: 'Velouté de légumes de saison',
                price: 8.50,
                category: 'entrees',
                isVegan: true,
                preparationTime: 5,
              },
              {
                id: '3',
                name: 'Foie gras mi-cuit',
                description: 'Foie gras maison, chutney de figues, pain toasté',
                price: 22.00,
                category: 'entrees',
                preparationTime: 8,
              },
            ],
          },
          {
            id: 'plats',
            name: 'Plats principaux',
            items: [
              {
                id: '4',
                name: 'Burger du Chef',
                description: 'Steak 180g, cheddar, bacon, tomates, salade, frites maison',
                price: 18.90,
                category: 'plats',
                preparationTime: 15,
                allergens: ['gluten', 'milk'],
              },
              {
                id: '5',
                name: 'Saumon grillé',
                description: 'Filet de saumon, légumes de saison, sauce hollandaise',
                price: 22.50,
                category: 'plats',
                preparationTime: 20,
                allergens: ['fish', 'eggs'],
              },
              {
                id: '6',
                name: 'Risotto aux champignons',
                description: 'Risotto crémeux, champignons de saison, truffe',
                price: 19.50,
                category: 'plats',
                isVegetarian: true,
                preparationTime: 25,
                allergens: ['milk'],
              },
            ],
          },
          {
            id: 'desserts',
            name: 'Desserts',
            items: [
              {
                id: '7',
                name: 'Tarte tatin',
                description: 'Tarte aux pommes caramélisées, crème chantilly',
                price: 8.50,
                category: 'desserts',
                preparationTime: 5,
                allergens: ['gluten', 'milk', 'eggs'],
              },
              {
                id: '8',
                name: 'Mousse au chocolat',
                description: 'Mousse au chocolat noir 70%, chantilly vanille',
                price: 7.50,
                category: 'desserts',
                isVegetarian: true,
                preparationTime: 3,
                allergens: ['milk', 'eggs'],
              },
            ],
          },
        ];
        
        setRestaurant(mockRestaurant);
        setCategories(mockCategories);
        setActiveCategory(mockCategories[0]?.id || '');
      } catch (error) {
        console.error('Erreur lors du chargement du menu:', error);
        Alert.alert('Erreur', 'Impossible de charger le menu');
      } finally {
        setLoading(false);
      }
    };

    loadMenuData();
  }, [restaurantId]);

  // ✅ FONCTIONS CART AMÉLIORÉES
  const addToCart = useCallback((item: MenuItem, quantity: number = 1, instructions?: string) => {
    const existingItem = cart.find(cartItem => 
      cartItem.menuItem.id === item.id && 
      cartItem.specialInstructions === instructions
    );
    
    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem === existingItem
          ? { ...cartItem, quantity: cartItem.quantity + quantity }
          : cartItem
      ));
    } else {
      setCart([...cart, { 
        menuItem: item, 
        quantity,
        specialInstructions: instructions 
      }]);
    }

    // Feedback visuel
    Alert.alert(
      'Ajouté au panier',
      `${item.name} (x${quantity}) ajouté avec succès`,
      [{ text: 'OK' }],
      { cancelable: true }
    );
  }, [cart]);

  const removeFromCart = useCallback((itemId: string, instructions?: string) => {
    setCart(cart.filter(cartItem => 
      !(cartItem.menuItem.id === itemId && cartItem.specialInstructions === instructions)
    ));
  }, [cart]);

  const updateQuantity = useCallback((itemId: string, quantity: number, instructions?: string) => {
    if (quantity <= 0) {
      removeFromCart(itemId, instructions);
      return;
    }
    
    setCart(cart.map(cartItem =>
      cartItem.menuItem.id === itemId && cartItem.specialInstructions === instructions
        ? { ...cartItem, quantity }
        : cartItem
    ));
  }, [cart, removeFromCart]);

  const clearCart = useCallback(() => {
    Alert.alert(
      'Vider le panier',
      'Êtes-vous sûr de vouloir vider votre panier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: () => setCart([]) }
      ]
    );
  }, []);

  const getTotalPrice = useCallback(() => {
    return cart.reduce((total, item) => total + (item.menuItem.price * item.quantity), 0);
  }, [cart]);

  const getTotalItems = useCallback(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  // ✅ FILTRAGE ET RECHERCHE
  const filteredItems = useCallback(() => {
    const activeItems = categories.find(cat => cat.id === activeCategory)?.items || [];
    
    if (!searchQuery.trim()) return activeItems;
    
    const query = searchQuery.toLowerCase().trim();
    return activeItems.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  }, [categories, activeCategory, searchQuery]);

  // ✅ STYLES RESPONSIVES OPTIMISÉS
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background.secondary,
    },
    
    header: {
      paddingTop: getSpacing(50, 60, 70),
      paddingBottom: getSpacing(SPACING.md, SPACING.lg),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      backgroundColor: COLORS.surface.primary,
      ...SHADOWS.sm,
    },
    
    headerTop: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.neutral[100],
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    headerTitle: {
      fontSize: getFontSize(18, 22, 26),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      flex: 1,
      textAlign: 'center' as const,
      marginHorizontal: SPACING.md,
    },
    
    headerSubtitle: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginTop: SPACING.xs,
    },
    
    cartButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      position: 'relative' as const,
    },
    
    cartBadge: {
      position: 'absolute' as const,
      top: -6,
      right: -6,
    },
    
    // Search bar
    searchContainer: {
      marginTop: getSpacing(SPACING.sm, SPACING.md),
    },
    
    // Categories
    categoriesContainer: {
      paddingVertical: getSpacing(SPACING.md, SPACING.lg),
      backgroundColor: COLORS.surface.primary,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    
    categoriesScroll: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    categoryItem: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingVertical: getSpacing(SPACING.sm, SPACING.md),
      marginRight: getSpacing(SPACING.sm, SPACING.md),
      borderRadius: RADIUS.lg,
      backgroundColor: COLORS.neutral[100],
    },
    
    categoryItemActive: {
      backgroundColor: COLORS.primary,
    },
    
    categoryText: {
      fontSize: getFontSize(14, 16, 18),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.secondary,
    },
    
    categoryTextActive: {
      color: COLORS.text.white,
    },
    
    // Menu items
    menuContent: {
      flex: 1,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingTop: getSpacing(SPACING.md, SPACING.lg),
    },
    
    menuGrid: {
      paddingBottom: 120, // Space for cart button
    },
    
    menuItem: {
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
      width: isTablet ? '48%' as const : '100%' as const,
    },
    
    menuItemContent: {
      flexDirection: isMobile ? 'column' as const : 'row' as const,
    },
    
    menuItemImage: {
      width: isMobile ? '100%' as const : 120,
      height: isMobile ? 160 : 120,
      borderRadius: RADIUS.md,
      backgroundColor: COLORS.neutral[200],
      marginBottom: isMobile ? SPACING.md : 0,
      marginRight: isMobile ? 0 : SPACING.md,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    menuItemInfo: {
      flex: 1,
    },
    
    menuItemHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: SPACING.sm,
    },
    
    menuItemName: {
      fontSize: getFontSize(16, 18, 20),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      flex: 1,
      marginRight: SPACING.sm,
    },
    
    menuItemPrice: {
      fontSize: getFontSize(16, 18, 20),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    
    menuItemDescription: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      lineHeight: 20,
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
    },
    
    menuItemFooter: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    
    menuItemTags: {
      flexDirection: 'row' as const,
      flex: 1,
      flexWrap: 'wrap' as const,
    },
    
    addButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    // Floating cart
    floatingCart: {
      position: 'absolute' as const,
      bottom: getSpacing(SPACING.xl, SPACING.xxl),
      left: getSpacing(SPACING.lg, SPACING.xl),
      right: getSpacing(SPACING.lg, SPACING.xl),
      backgroundColor: COLORS.primary,
      borderRadius: RADIUS.lg,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingVertical: getSpacing(SPACING.md, SPACING.lg),
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      ...SHADOWS.lg,
    },
    
    cartInfo: {
      flex: 1,
    },
    
    cartItems: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.white,
      opacity: 0.9,
    },
    
    cartTotal: {
      fontSize: getFontSize(18, 20, 22),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.white,
    },
    
    viewCartButton: {
      backgroundColor: COLORS.text.white,
      borderRadius: RADIUS.md,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingVertical: getSpacing(SPACING.sm, SPACING.md),
    },
    
    viewCartText: {
      fontSize: getFontSize(14, 16, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.primary,
    },
    
    emptyState: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: getSpacing(SPACING.xxl, SPACING.xxl * 2),
    },
    
    emptyIcon: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    emptyTitle: {
      fontSize: getFontSize(18, 20, 22),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: SPACING.sm,
    },
    
    emptyText: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      paddingHorizontal: getSpacing(SPACING.xl, SPACING.xxl),
    },

    loadingContainer: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    loadingText: {
      fontSize: getFontSize(16, 17, 18),
      color: COLORS.text.secondary,
      marginTop: getSpacing(SPACING.md, SPACING.lg),
    },
  };

  // ✅ COMPOSANT MENU ITEM AMÉLIORÉ
  const MenuItemCard = ({ item }: { item: MenuItem }) => (
    <Card 
      style={styles.menuItem}
      variant="elevated"
      pressable
      onPress={() => setSelectedItem(item)}
    >
      <View style={styles.menuItemContent}>
        {/* Image placeholder */}
        <View style={styles.menuItemImage}>
          <Ionicons 
            name="restaurant-outline" 
            size={32} 
            color={COLORS.neutral[400]} 
          />
        </View>
        
        <View style={styles.menuItemInfo}>
          <View style={styles.menuItemHeader}>
            <Text style={styles.menuItemName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.menuItemPrice}>{item.price.toFixed(2)}€</Text>
          </View>
          
          <Text style={styles.menuItemDescription} numberOfLines={3}>
            {item.description}
          </Text>
          
          <View style={styles.menuItemFooter}>
            <View style={styles.menuItemTags}>
              {item.isVegan && (
                <Badge text="🌿 Vegan" variant="success" size="sm" style={{ marginRight: SPACING.xs, marginBottom: SPACING.xs }} />
              )}
              {item.isVegetarian && !item.isVegan && (
                <Badge text="🌱 Végé" variant="success" size="sm" style={{ marginRight: SPACING.xs, marginBottom: SPACING.xs }} />
              )}
              {item.preparationTime && (
                <Badge 
                  text={`⏱️ ${item.preparationTime}min`} 
                  variant="default" 
                  size="sm" 
                  style={{ marginRight: SPACING.xs, marginBottom: SPACING.xs }}
                />
              )}
            </View>
            
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => addToCart(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={COLORS.text.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Card>
  );

  // ✅ ÉTAT DE CHARGEMENT
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Ionicons name="restaurant-outline" size={48} color={COLORS.neutral[400]} />
        <Text style={styles.loadingText}>Chargement du menu...</Text>
      </View>
    );
  }

  // ✅ RENDER MAIN
  return (
    <View style={styles.container}>
      {/* ✅ HEADER MODERNE */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {restaurant?.name || 'Menu'}
            </Text>
            {restaurant?.description && (
              <Text style={styles.headerSubtitle}>
                {restaurant.description}
              </Text>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.cartButton}
            onPress={() => setShowCart(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="bag-outline" size={24} color={COLORS.text.white} />
            {getTotalItems() > 0 && (
              <View style={styles.cartBadge}>
                <Badge 
                  text={getTotalItems().toString()} 
                  variant="error" 
                  size="sm" 
                />
              </View>
            )}
          </TouchableOpacity>
        </View>
        
        {/* ✅ SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Input
            placeholder="Rechercher un plat..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search-outline"
            rightIcon={searchQuery ? "close-outline" : undefined}
            onRightIconPress={searchQuery ? () => setSearchQuery('') : undefined}
            fullWidth
          />
        </View>
      </View>

      {/* ✅ CATEGORIES HORIZONTALES */}
      <View style={styles.categoriesContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryItem,
                activeCategory === category.id && styles.categoryItemActive,
              ]}
              onPress={() => setActiveCategory(category.id)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.categoryText,
                activeCategory === category.id && styles.categoryTextActive,
              ]}>
                {category.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ✅ MENU ITEMS AVEC FLATLIST POUR PERFORMANCE */}
      <FlatList
        data={filteredItems()}
        renderItem={({ item }) => <MenuItemCard item={item} />}
        keyExtractor={(item) => item.id}
        numColumns={isTablet ? 2 : 1}
        key={isTablet ? 'tablet' : 'mobile'} // Force re-render on orientation change
        contentContainerStyle={styles.menuGrid}
        style={styles.menuContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={48} color={COLORS.neutral[400]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun plat trouvé</Text>
            <Text style={styles.emptyText}>
              {searchQuery 
                ? `Aucun résultat pour "${searchQuery}". Essayez un autre terme.`
                : 'Cette catégorie ne contient aucun plat pour le moment.'
              }
            </Text>
          </View>
        }
      />

      {/* ✅ FLOATING CART */}
      {cart.length > 0 && (
        <TouchableOpacity 
          style={styles.floatingCart}
          onPress={() => setShowCart(true)}
          activeOpacity={0.9}
        >
          <View style={styles.cartInfo}>
            <Text style={styles.cartItems}>
              {getTotalItems()} article{getTotalItems() > 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartTotal}>
              {getTotalPrice().toFixed(2)}€
            </Text>
          </View>
          
          <View style={styles.viewCartButton}>
            <Text style={styles.viewCartText}>Voir le panier</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ✅ MODALS */}
      <CartModal 
        visible={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onClearCart={clearCart}
        totalPrice={getTotalPrice()}
        restaurant={restaurant}
      />

      <ProductDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAddToCart={addToCart}
      />
    </View>
  );
}

// ✅ MODAL PANIER RESPONSIVE AMÉLIORÉ
const CartModal = ({ 
  visible, 
  onClose, 
  cart, 
  onUpdateQuantity, 
  onRemoveItem,
  onClearCart,
  totalPrice,
  restaurant
}: {
  visible: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQuantity: (id: string, quantity: number, instructions?: string) => void;
  onRemoveItem: (id: string, instructions?: string) => void;
  onClearCart: () => void;
  totalPrice: number;
  restaurant: Restaurant | null;
}) => {
  const { isMobile, getSpacing, getFontSize } = useResponsive();

  const styles = {
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end' as const,
    },
    
    modalContent: {
      backgroundColor: COLORS.surface.primary,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      maxHeight: '85%' as const,
      paddingTop: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    modalHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingBottom: getSpacing(SPACING.md, SPACING.lg),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    
    modalTitle: {
      fontSize: getFontSize(20, 22, 24),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    
    headerActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    
    clearButton: {
      marginRight: getSpacing(SPACING.md, SPACING.lg),
    },
    
    clearButtonText: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.error,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: COLORS.neutral[100],
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    cartList: {
      flex: 1,
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    cartItem: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      paddingVertical: getSpacing(SPACING.md, SPACING.lg),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    
    cartItemInfo: {
      flex: 1,
      marginRight: getSpacing(SPACING.md, SPACING.lg),
    },
    
    cartItemName: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: SPACING.xs,
    },
    
    cartItemPrice: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      marginBottom: SPACING.xs,
    },
    
    cartItemInstructions: {
      fontSize: getFontSize(12, 13, 14),
      color: COLORS.text.tertiary,
      fontStyle: 'italic' as const,
    },
    
    cartItemControls: {
      alignItems: 'flex-end' as const,
    },
    
    quantityControls: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.neutral[100],
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
    },
    
    quantityButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    quantityText: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginHorizontal: getSpacing(SPACING.md, SPACING.lg),
      minWidth: 24,
      textAlign: 'center' as const,
    },
    
    removeButton: {
      padding: SPACING.xs,
    },
    
    footer: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
      backgroundColor: COLORS.surface.secondary,
    },
    
    totalContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    totalLabel: {
      fontSize: getFontSize(18, 20, 22),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    
    totalPrice: {
      fontSize: getFontSize(20, 22, 24),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },

    emptyCart: {
      alignItems: 'center' as const,
      paddingVertical: getSpacing(SPACING.xxl, SPACING.xxl * 2),
    },

    emptyCartIcon: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },

    emptyCartTitle: {
      fontSize: getFontSize(18, 20, 22),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: SPACING.sm,
    },

    emptyCartText: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
    },
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* ✅ HEADER */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Mon panier</Text>
            <View style={styles.headerActions}>
              {cart.length > 0 && (
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={onClearCart}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearButtonText}>Vider</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ✅ LISTE DES ARTICLES OU ÉTAT VIDE */}
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <View style={styles.emptyCartIcon}>
                <Ionicons name="bag-outline" size={48} color={COLORS.neutral[400]} />
              </View>
              <Text style={styles.emptyCartTitle}>Votre panier est vide</Text>
              <Text style={styles.emptyCartText}>
                Ajoutez des plats depuis le menu pour commencer votre commande
              </Text>
            </View>
          ) : (
            <FlatList
              data={cart}
              keyExtractor={(item, index) => `${item.menuItem.id}-${index}`}
              renderItem={({ item }) => (
                <View style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.menuItem.name}</Text>
                    <Text style={styles.cartItemPrice}>
                      {item.menuItem.price.toFixed(2)}€ × {item.quantity} = {(item.menuItem.price * item.quantity).toFixed(2)}€
                    </Text>
                    {item.specialInstructions && (
                      <Text style={styles.cartItemInstructions}>
                        Note: {item.specialInstructions}
                      </Text>
                    )}
                  </View>

                  <View style={styles.cartItemControls}>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => onUpdateQuantity(item.menuItem.id, item.quantity - 1, item.specialInstructions)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="remove" size={14} color={COLORS.text.white} />
                      </TouchableOpacity>

                      <Text style={styles.quantityText}>{item.quantity}</Text>

                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() => onUpdateQuantity(item.menuItem.id, item.quantity + 1, item.specialInstructions)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="add" size={14} color={COLORS.text.white} />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => onRemoveItem(item.menuItem.id, item.specialInstructions)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              style={styles.cartList}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* ✅ FOOTER TOTAL */}
          {cart.length > 0 && (
            <View style={styles.footer}>
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalPrice}>{totalPrice.toFixed(2)}€</Text>
              </View>

              <Button
                title={`Commander • ${restaurant?.name || ''}`}
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => {
                  onClose();
                  // Navigation vers checkout
                  router.push({
                    pathname: '/order/checkout',
                    params: { restaurantId: restaurant?.id || '' }
                  } as any);
                }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ✅ MODAL DÉTAIL PRODUIT AMÉLIORÉ
const ProductDetailModal = ({ 
  visible, 
  item, 
  onClose, 
  onAddToCart 
}: {
  visible: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, instructions?: string) => void;
}) => {
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const { isMobile, getSpacing, getFontSize } = useResponsive();

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setQuantity(1);
      setSpecialInstructions('');
    }
  }, [visible]);

  if (!item) return null;

  const handleAddToCart = () => {
    onAddToCart(item, quantity, specialInstructions.trim() || undefined);
    onClose();
  };

  const getAllergenName = (allergen: string): string => {
    const allergenMap: Record<string, string> = {
      'gluten': 'Gluten',
      'crustaceans': 'Crustacés',
      'eggs': 'Œufs',
      'fish': 'Poissons',
      'peanuts': 'Arachides',
      'soybeans': 'Soja',
      'milk': 'Lait',
      'nuts': 'Fruits à coque',
      'celery': 'Céleri',
      'mustard': 'Moutarde',
      'sesame': 'Sésame',
      'sulphites': 'Sulfites',
      'lupin': 'Lupin',
      'molluscs': 'Mollusques',
    };
    return allergenMap[allergen] || allergen;
  };

  const styles = {
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    modalContent: {
      backgroundColor: COLORS.surface.primary,
      borderRadius: RADIUS.xl,
      width: '100%' as const,
      maxWidth: isMobile ? undefined : 480,
      maxHeight: '90%' as const,
    },
    
    imageContainer: {
      height: 200,
      backgroundColor: COLORS.neutral[200],
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      position: 'relative' as const,
    },
    
    closeButton: {
      position: 'absolute' as const,
      top: getSpacing(SPACING.md, SPACING.lg),
      right: getSpacing(SPACING.md, SPACING.lg),
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    content: {
      padding: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    itemName: {
      fontSize: getFontSize(22, 24, 28),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: SPACING.sm,
    },
    
    itemPrice: {
      fontSize: getFontSize(20, 22, 24),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    itemDescription: {
      fontSize: getFontSize(16, 17, 18),
      color: COLORS.text.secondary,
      lineHeight: 24,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    tagsContainer: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    allergensSection: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    sectionTitle: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
    },
    
    allergensList: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
    },
    
    quantitySection: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    quantityControls: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: COLORS.neutral[100],
      borderRadius: RADIUS.lg,
      paddingVertical: getSpacing(SPACING.sm, SPACING.md),
    },
    
    quantityButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    quantityButtonDisabled: {
      backgroundColor: COLORS.neutral[300],
    },
    
    quantityText: {
      fontSize: getFontSize(20, 22, 24),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginHorizontal: getSpacing(SPACING.xl, SPACING.xxl),
      minWidth: 32,
      textAlign: 'center' as const,
    },
    
    instructionsSection: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    footer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    
    totalPrice: {
      fontSize: getFontSize(20, 22, 24),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    
    addButton: {
      flex: 1,
      marginLeft: getSpacing(SPACING.md, SPACING.lg),
    },
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* ✅ IMAGE PLACEHOLDER */}
          <View style={styles.imageContainer}>
            <Ionicons name="restaurant-outline" size={48} color={COLORS.neutral[400]} />
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={COLORS.text.white} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* ✅ INFO PRODUIT */}
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemPrice}>{item.price.toFixed(2)}€</Text>
            <Text style={styles.itemDescription}>{item.description}</Text>

            {/* ✅ TAGS ALIMENTAIRES */}
            <View style={styles.tagsContainer}>
              {item.isVegan && (
                <Badge text="🌿 Vegan" variant="success" size="sm" style={{ marginRight: SPACING.sm, marginBottom: SPACING.xs }} />
              )}
              {item.isVegetarian && !item.isVegan && (
                <Badge text="🌱 Végétarien" variant="success" size="sm" style={{ marginRight: SPACING.sm, marginBottom: SPACING.xs }} />
              )}
              {item.preparationTime && (
                <Badge 
                  text={`⏱️ ${item.preparationTime} min`} 
                  variant="default" 
                  size="sm"
                  style={{ marginRight: SPACING.sm, marginBottom: SPACING.xs }}
                />
              )}
            </View>

            {/* ✅ ALLERGÈNES */}
            {item.allergens && item.allergens.length > 0 && (
              <View style={styles.allergensSection}>
                <Text style={styles.sectionTitle}>Allergènes</Text>
                <View style={styles.allergensList}>
                  {item.allergens.map((allergen, index) => (
                    <Badge
                      key={allergen}
                      text={getAllergenName(allergen)}
                      variant="warning"
                      size="sm"
                      style={{ 
                        marginRight: SPACING.sm, 
                        marginBottom: SPACING.xs 
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ✅ QUANTITÉ */}
            <View style={styles.quantitySection}>
              <Text style={styles.sectionTitle}>Quantité</Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={[
                    styles.quantityButton,
                    quantity <= 1 && styles.quantityButtonDisabled
                  ]}
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="remove" 
                    size={24} 
                    color={quantity <= 1 ? COLORS.neutral[500] : COLORS.text.white} 
                  />
                </TouchableOpacity>

                <Text style={styles.quantityText}>{quantity}</Text>

                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => setQuantity(quantity + 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={24} color={COLORS.text.white} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ✅ INSTRUCTIONS SPÉCIALES */}
            <View style={styles.instructionsSection}>
              <Text style={styles.sectionTitle}>Instructions spéciales</Text>
              <Input
                placeholder="Ex: Sans oignons, bien cuit, sauce à part..."
                value={specialInstructions}
                onChangeText={setSpecialInstructions}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            {/* ✅ FOOTER */}
            <View style={styles.footer}>
              <Text style={styles.totalPrice}>
                {(item.price * quantity).toFixed(2)}€
              </Text>
              
              <Button
                title={`Ajouter${quantity > 1 ? ` (${quantity})` : ''}`}
                variant="primary"
                size="lg"
                onPress={handleAddToCart}
                style={styles.addButton}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};