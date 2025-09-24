import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ViewStyle,
  TextStyle,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Contexts & Hooks
import { useOrder } from '@/contexts/OrderContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { menuService } from '@/services/menuService';

// Components
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

// Types
import { MenuItem, Menu } from '@/types/menu';
import { CreateOrderRequest } from '@/types/order';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  customizations: Record<string, any>;
  special_instructions: string;
  total: number;
}

interface OrderFormData {
  restaurant_id: number;
  order_type: 'dine_in' | 'takeaway';
  table_number: string;
  customer_name: string;
  phone: string;
  payment_method: 'cash' | 'card' | 'online';
  notes: string;
}

const ORDER_TYPE_LABELS = {
  'dine_in': '🪑 Sur place',
  'takeaway': '📦 À emporter',
};

// =============================================================================
// CONSTANTS
// =============================================================================

const CUSTOMIZATION_OPTIONS = {
  sauce: ['Mayo', 'Ketchup', 'Moutarde', 'Sans sauce'],
  cuisson: ['Saignant', 'À point', 'Bien cuit'],
  accompagnement: ['Frites', 'Salade', 'Légumes'],
} as const;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AddOrderScreen() {
  // ==========================================================================
  // HOOKS & STATE
  // ==========================================================================
  const { restaurantId, tableCode } = useLocalSearchParams<{ 
    restaurantId?: string; 
    tableCode?: string; 
  }>();
  const { createOrder } = useOrder();
  const { loadRestaurant, currentRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(false);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [formData, setFormData] = useState<OrderFormData>({
    restaurant_id: Number(restaurantId) || 0,
    order_type: tableCode ? 'dine_in' : 'takeaway',
    table_number: tableCode || '',
    customer_name: '',
    phone: '',
    payment_method: 'cash',
    notes: '',
  });

  // ==========================================================================
  // EFFECTS
  // ==========================================================================
  useEffect(() => {
    if (restaurantId) {
      loadRestaurant(restaurantId);
      loadMenus();
    }
  }, [restaurantId]);

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================
  const loadMenus = async () => {
    if (!restaurantId) return;
    
    setIsLoading(true);
    try {
      // ✅ Utiliser getMyMenus() au lieu de données mockées
      const allMenus = await menuService.getMyMenus();
      
      // Filtrer par restaurant et disponibilité
      const restaurantMenus = allMenus.filter(menu => 
        menu.restaurant === Number(restaurantId) && 
        menu.is_available !== false  // Inclure ceux sans champ disponible
      );
      
      setMenus(restaurantMenus);
      if (restaurantMenus.length > 0) {
        setSelectedMenu(restaurantMenus[0]);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les menus');
      console.error('Erreur lors du chargement des menus:', error);
    } finally {
      setIsLoading(false);
    }
  };
  // ==========================================================================
  // CART MANAGEMENT
  // ==========================================================================
  const addToCart = (menuItem: MenuItem, customizations: Record<string, any> = {}, special_instructions: string = '') => {
    const cartItemId = `${menuItem.id}-${JSON.stringify(customizations)}`;
    const price = parseFloat(menuItem.price);
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === cartItemId);
      
      if (existingItem) {
        return prevCart.map(item =>
          item.id === cartItemId
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * price }
            : item
        );
      } else {
        return [...prevCart, {
          id: cartItemId,
          menuItem,
          quantity: 1,
          customizations,
          special_instructions,
          total: price,
        }];
      }
    });
    
    setShowCart(true);
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    if (quantity === 0) {
      removeFromCart(itemId);
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === itemId
          ? { ...item, quantity, total: quantity * parseFloat(item.menuItem.price) }
          : item
      )
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setShowCart(false);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.total, 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  };

  // ==========================================================================
  // FORM HANDLERS
  // ==========================================================================
  const updateFormField = <T extends keyof OrderFormData>(
    field: T, 
    value: OrderFormData[T]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ==========================================================================
  // ORDER SUBMISSION
  // ==========================================================================
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles à votre commande');
      return;
    }

    if (!formData.customer_name.trim()) {
      Alert.alert('Information manquante', 'Veuillez renseigner votre nom');
      return;
    }

    if (formData.order_type === 'dine_in' && !formData.table_number.trim()) {
      Alert.alert('Information manquante', 'Numéro de table requis pour une commande sur place');
      return;
    }

    setIsLoading(true);
    try {
      const orderData: CreateOrderRequest = {
        restaurant: formData.restaurant_id,
        order_type: formData.order_type,
        table_number: formData.table_number,
        customer_name: formData.customer_name,
        phone: formData.phone,
        payment_method: formData.payment_method,
        notes: formData.notes,
        items: cart.map(item => ({
          menu_item: item.menuItem.id,
          quantity: item.quantity,
          customizations: item.customizations,
          special_instructions: item.special_instructions,
        })),
      };

      const order = await createOrder(orderData);
      
      Alert.alert(
        'Commande confirmée !', 
        `Votre commande ${order.order_number} a été enregistrée.\n\nTotal: ${getCartTotal().toFixed(2)} €\nEstimation: ${order.estimated_ready_time || '15-20 min'}`,
        [
          { 
            text: 'Voir ma commande', 
            onPress: () => {
              clearCart();
              router.replace(`/order/${order.id}`);
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('❌ Erreur création commande:', error);
      Alert.alert('Erreur', error.message || 'Impossible de créer la commande');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 }}>
            {item.name}
          </Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, lineHeight: 16 }}>
            {item.description}
          </Text>
          
          {/* Tags diététiques */}
          {item.dietary_tags && item.dietary_tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {item.dietary_tags.map((tag, index) => (
                <View key={index} style={{
                  backgroundColor: '#D1FAE5',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  marginRight: 4,
                  marginBottom: 2,
                }}>
                  <Text style={{ fontSize: 10, color: '#065F46', fontWeight: '500' }}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#3B82F6' }}>
              {item.price} €
            </Text>
            <Button
              title="Ajouter"
              onPress={() => addToCart(item)}
              variant="primary"
              size="sm"
              leftIcon="add-outline"
              disabled={!item.is_available}
            />
          </View>
        </View>
      </View>
    </Card>
  );

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
          {item.menuItem.name}
        </Text>
        {item.special_instructions && (
          <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 2 }}>
            Note: {item.special_instructions}
          </Text>
        )}
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          {item.menuItem.price} € × {item.quantity}
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => updateCartItem(item.id, item.quantity - 1)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#F3F4F6',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="remove" size={16} color="#6B7280" />
        </TouchableOpacity>
        
        <Text style={{ fontSize: 14, fontWeight: '500', marginHorizontal: 12, color: '#111827' }}>
          {item.quantity}
        </Text>
        
        <TouchableOpacity
          onPress={() => updateCartItem(item.id, item.quantity + 1)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#3B82F6',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCategories = () => {
    if (!selectedMenu?.items) return null;

    const categories = ['all', ...new Set(selectedMenu.items.map(item => item.category))];
    
    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={{ paddingHorizontal: 16, marginBottom: 16 }}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            onPress={() => setSelectedCategory(category)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: selectedCategory === category ? '#3B82F6' : '#F3F4F6',
              marginRight: 8,
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '500',
              color: selectedCategory === category ? '#FFFFFF' : '#6B7280',
            }}>
              {category === 'all' ? 'Tout' : category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================
  if (isLoading && !currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commander" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du menu..." />
      </View>
    );
  }

  if (!currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commander" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="restaurant-outline" size={64} color="#D1D5DB" />
          <Text style={{ fontSize: 18, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
            Restaurant non trouvé
          </Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  const filteredItems = selectedMenu?.items?.filter(item => 
    selectedCategory === 'all' || item.category === selectedCategory
  ) || [];

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title={currentRestaurant.name}
          leftIcon="arrow-back"
          rightIcon={cart.length > 0 ? "bag" : undefined}
          rightBadge={cart.length > 0 ? getCartItemsCount().toString() : undefined}
          onLeftPress={() => router.back()}
          onRightPress={() => setShowCart(true)}
        />

        {!showCart ? (
          <>
            {/* Restaurant Info */}
            <Card style={{ margin: 16, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
                    {ORDER_TYPE_LABELS[formData.order_type]}
                  </Text>
                  {formData.table_number && (
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      Table {formData.table_number}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setFormData(prev => ({
                    ...prev,
                    order_type: prev.order_type === 'dine_in' ? 'takeaway' : 'dine_in'
                  }))}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F3F4F6',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                  }}
                >
                  <Ionicons name="swap-horizontal" size={14} color="#6B7280" />
                  <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                    Changer
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>

            {/* Categories */}
            {renderCategories()}

            {/* Menu Items */}
            <FlatList
              data={filteredItems}
              renderItem={renderMenuItem}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
            />
          </>
        ) : (
          /* Cart View */
          <ScrollView style={{ flex: 1 }}>
            <Card style={{ margin: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                  Votre commande ({getCartItemsCount()} articles)
                </Text>
                <TouchableOpacity onPress={() => setShowCart(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {cart.length > 0 ? (
                <FlatList
                  data={cart}
                  renderItem={renderCartItem}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              ) : (
                <Text style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 24 }}>
                  Votre panier est vide
                </Text>
              )}

              {cart.length > 0 && (
                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Total:</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#3B82F6' }}>
                      {getCartTotal().toFixed(2)} €
                    </Text>
                  </View>
                  <Button
                    title="Vider le panier"
                    onPress={clearCart}
                    variant="outline"
                    size="sm"
                    leftIcon="trash-outline"
                  />
                </View>
              )}
            </Card>

            {/* Order Form */}
            {cart.length > 0 && (
              <Card style={{ margin: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
                  Informations de commande
                </Text>

                <Input
                  label="Votre nom *"
                  placeholder="Nom et prénom"
                  value={formData.customer_name}
                  onChangeText={(value) => updateFormField('customer_name', value)}
                  leftIcon="person-outline"
                />

                {formData.order_type === 'dine_in' && (
                  <Input
                    label="Numéro de table *"
                    placeholder="Ex: 12"
                    value={formData.table_number}
                    onChangeText={(value) => updateFormField('table_number', value)}
                    leftIcon="location-outline"
                    keyboardType="numeric"
                  />
                )}

                <Input
                  label="Téléphone (optionnel)"
                  placeholder="+33 6 12 34 56 78"
                  value={formData.phone}
                  onChangeText={(value) => updateFormField('phone', value)}
                  leftIcon="call-outline"
                  keyboardType="phone-pad"
                />

                <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8, marginTop: 16 }}>
                  Mode de paiement
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {(['cash', 'card', 'online'] as const).map((method) => (
                    <TouchableOpacity
                      key={method}
                      onPress={() => updateFormField('payment_method', method)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: formData.payment_method === method ? '#3B82F6' : '#E5E7EB',
                        backgroundColor: formData.payment_method === method ? '#EBF8FF' : '#FFFFFF',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{
                        fontSize: 20,
                        marginBottom: 4,
                      }}>
                        {method === 'cash' ? '💵' : method === 'card' ? '💳' : '🌐'}
                      </Text>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: formData.payment_method === method ? '#1D4ED8' : '#6B7280',
                      }}>
                        {method === 'cash' ? 'Espèces' : method === 'card' ? 'Carte' : 'En ligne'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Input
                  label="Notes (optionnel)"
                  placeholder="Demandes spéciales, allergies..."
                  value={formData.notes}
                  onChangeText={(value) => updateFormField('notes', value)}
                  multiline
                  numberOfLines={3}
                />

                <Button
                  title={`Commander • ${getCartTotal().toFixed(2)} €`}
                  onPress={handleSubmitOrder}
                  loading={isLoading}
                  fullWidth
                  style={{ marginTop: 16 }}
                />
              </Card>
            )}
          </ScrollView>
        )}

        {/* Floating Cart Button */}
        {!showCart && cart.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowCart(true)}
            style={{
              position: 'absolute',
              bottom: insets.bottom + 20,
              left: 16,
              right: 16,
              backgroundColor: '#3B82F6',
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 20,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                width: 24,
                height: 24,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#3B82F6' }}>
                  {getCartItemsCount()}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>
                Voir le panier
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>
              {getCartTotal().toFixed(2)} €
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}