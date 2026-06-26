import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

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
import { Alert as InlineAlert } from '@/components/ui/Alert';

// Theme
import { useAppTheme } from '@/utils/designSystem';

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

// =============================================================================
// CONSTANTS
// =============================================================================
// NB : données mock de personnalisation — non traduites (placeholder métier).
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
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { createOrder } = useOrder();
  const { loadRestaurant, currentRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(false);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 🔔 Toast / Alert custom
  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  const showToast = (
    variant: 'success' | 'error' | 'warning' | 'info',
    message: string,
    title?: string
  ) => setToast({ visible: true, variant, message, title });

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const [formData, setFormData] = useState<OrderFormData>({
    restaurant_id: Number(restaurantId) || 0,
    order_type: tableCode ? 'dine_in' : 'takeaway',
    table_number: tableCode || '',
    customer_name: '',
    phone: '',
    payment_method: 'cash',
    notes: '',
  });

  // Libellé du type de commande (emoji + i18n)
  const orderTypeLabel = (type: 'dine_in' | 'takeaway') =>
    type === 'dine_in' ? `🪑 ${t('order.dineIn')}` : `📦 ${t('order.takeaway')}`;

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
      const allMenus = await menuService.getMyMenus();

      // Filtrer par restaurant et disponibilité
      const restaurantMenus = allMenus.filter(
        (menu) =>
          menu.restaurant === Number(restaurantId) &&
          menu.is_available !== false // Inclure ceux sans champ dispo
      );

      setMenus(restaurantMenus);
      if (restaurantMenus.length > 0) {
        setSelectedMenu(restaurantMenus[0]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des menus:', error);
      showToast('error', t('addOrder.toast.loadMenusFailed'), t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // CART MANAGEMENT
  // ==========================================================================
  const addToCart = (
    menuItem: MenuItem,
    customizations: Record<string, any> = {},
    special_instructions: string = ''
  ) => {
    const cartItemId = `${menuItem.id}-${JSON.stringify(customizations)}`;
    const price = parseFloat(menuItem.price);

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === cartItemId);

      if (existingItem) {
        return prevCart.map((item) =>
          item.id === cartItemId
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * price,
              }
            : item
        );
      } else {
        return [
          ...prevCart,
          {
            id: cartItemId,
            menuItem,
            quantity: 1,
            customizations,
            special_instructions,
            total: price,
          },
        ];
      }
    });

    setShowCart(true);
    showToast('success', t('addOrder.toast.addedToCart', { name: menuItem.name }), t('addOrder.toast.addedTitle'));
  };

  const updateCartItem = (itemId: string, quantity: number) => {
    if (quantity === 0) {
      removeFromCart(itemId);
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity,
              total: quantity * parseFloat(item.menuItem.price),
            }
          : item
      )
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
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
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ==========================================================================
  // ORDER SUBMISSION
  // ==========================================================================
  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      showToast('warning', t('addOrder.toast.emptyCart'), t('addOrder.toast.emptyCartTitle'));
      return;
    }

    if (!formData.customer_name.trim()) {
      showToast('error', t('addOrder.toast.nameRequired'), t('addOrder.toast.missingInfoTitle'));
      return;
    }

    if (formData.order_type === 'dine_in' && !formData.table_number.trim()) {
      showToast(
        'error',
        t('addOrder.toast.tableRequired'),
        t('addOrder.toast.missingInfoTitle')
      );
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
        items: cart.map((item) => ({
          menu_item: item.menuItem.id,
          quantity: item.quantity,
          customizations: item.customizations,
          special_instructions: item.special_instructions,
        })),
      };

      const order = await createOrder(orderData);

      showToast(
        'success',
        t('addOrder.toast.orderConfirmed', {
          number: order.order_number,
          total: getCartTotal().toFixed(2),
        }),
        t('addOrder.toast.orderConfirmedTitle')
      );

      clearCart();
      router.replace(`/order/${order.id}`);
    } catch (error: any) {
      console.error('❌ Erreur création commande:', error);
      showToast('error', error?.message || t('addOrder.toast.createFailed'), t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================
  // Tag diététique : pastel vert en clair, vert translucide en dark.
  const dietaryBg = isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5';
  const dietaryText = isDark ? colors.success : '#065F46';

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: colors.text.primary,
              marginBottom: 4,
            }}
          >
            {item.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.text.secondary,
              marginBottom: 8,
              lineHeight: 16,
            }}
          >
            {item.description}
          </Text>

          {item.dietary_tags && item.dietary_tags.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              {item.dietary_tags.map((tag, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: dietaryBg,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginRight: 4,
                    marginBottom: 2,
                  }}
                >
                  <Text
                    style={{ fontSize: 10, color: dietaryText, fontWeight: '500' }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>
              {item.price} €
            </Text>
            <Button
              title={t('addOrder.add')}
              onPress={() => addToCart(item)}
              variant="primary"
              size="sm"
              leftIcon="add-outline"
              disabled={item.is_available === false}
            />
          </View>
        </View>
      </View>
    </Card>
  );

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text.primary }}>
          {item.menuItem.name}
        </Text>
        {item.special_instructions && (
          <Text style={{ fontSize: 12, color: colors.warning, marginTop: 2 }}>
            {t('addOrder.note', { text: item.special_instructions })}
          </Text>
        )}
        <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
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
            backgroundColor: colors.border.light,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="remove" size={16} color={colors.text.secondary} />
        </TouchableOpacity>

        <Text
          style={{
            fontSize: 14,
            fontWeight: '500',
            marginHorizontal: 12,
            color: colors.text.primary,
          }}
        >
          {item.quantity}
        </Text>

        <TouchableOpacity
          onPress={() => updateCartItem(item.id, item.quantity + 1)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="add" size={16} color={colors.text.inverse} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCategories = () => {
    if (!selectedMenu?.items) return null;

    const categories = ['all', ...new Set(selectedMenu.items.map((item) => item.category))];

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
              backgroundColor: selectedCategory === category ? colors.primary : colors.border.light,
              marginRight: 8,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: selectedCategory === category ? colors.text.inverse : colors.text.secondary,
              }}
            >
              {category === 'all' ? t('addOrder.categoryAll') : category}
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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title={t('addOrder.headerFallback')} leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text={t('addOrder.loadingMenu')} />
      </View>
    );
  }

  if (!currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title={t('addOrder.headerFallback')} leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="restaurant-outline" size={64} color={colors.border.dark} />
          <Text style={{ fontSize: 18, color: colors.text.secondary, marginTop: 16, textAlign: 'center' }}>
            {t('addOrder.restaurantNotFound')}
          </Text>
          <Button title={t('common.back')} onPress={() => router.back()} variant="outline" style={{ marginTop: 16 }} />
        </View>
      </View>
    );
  }

  const filteredItems =
    selectedMenu?.items?.filter(
      (item) => selectedCategory === 'all' || item.category === selectedCategory
    ) || [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 64 : 0}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header
          title={currentRestaurant.name}
          leftIcon="arrow-back"
          rightIcon={cart.length > 0 ? 'bag' : undefined}
          rightBadge={cart.length > 0 ? getCartItemsCount().toString() : undefined}
          onLeftPress={() => router.back()}
          onRightPress={() => setShowCart(true)}
        />

        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert
              variant={toast.variant}
              title={toast.title}
              message={toast.message}
              onDismiss={hideToast}
              autoDismiss
            />
          )}
        </View>

        {!showCart ? (
          <>
            <Card style={{ margin: 16, paddingVertical: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                    {orderTypeLabel(formData.order_type)}
                  </Text>
                  {formData.table_number ? (
                    <Text style={{ fontSize: 12, color: colors.text.secondary }}>
                      {t('addOrder.table', { number: formData.table_number })}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      order_type: prev.order_type === 'dine_in' ? 'takeaway' : 'dine_in',
                      table_number: prev.order_type === 'dine_in' ? '' : prev.table_number,
                    }))
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.border.light,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                  }}
                >
                  <Ionicons name="swap-horizontal" size={14} color={colors.text.secondary} />
                  <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 4 }}>{t('addOrder.switch')}</Text>
                </TouchableOpacity>
              </View>
            </Card>

            {renderCategories()}

            <FlatList
              data={filteredItems}
              renderItem={renderMenuItem}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: colors.text.secondary, marginTop: 24 }}>
                  {t('addOrder.noItems')}
                </Text>
              }
            />
          </>
        ) : (
          <ScrollView style={{ flex: 1 }}>
            <Card style={{ margin: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text.primary }}>
                  {t('addOrder.cartTitle', { count: getCartItemsCount() })}
                </Text>
                <TouchableOpacity onPress={() => setShowCart(false)}>
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
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
                <Text style={{ textAlign: 'center', color: colors.text.secondary, paddingVertical: 24 }}>
                  {t('cart.empty')}
                </Text>
              )}

              {cart.length > 0 && (
                <View
                  style={{
                    marginTop: 16,
                    paddingTop: 16,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.default,
                  }}
                >
                  <View
                    style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                      {t('addOrder.total')}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>
                      {getCartTotal().toFixed(2)} €
                    </Text>
                  </View>
                  <Button
                    title={t('addOrder.clearCart')}
                    onPress={clearCart}
                    variant="outline"
                    size="sm"
                    leftIcon="trash-outline"
                  />
                </View>
              )}
            </Card>

            {cart.length > 0 && (
              <Card style={{ margin: 16 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: colors.text.primary,
                    marginBottom: 16,
                  }}
                >
                  {t('addOrder.orderInfo')}
                </Text>

                <Input
                  label={t('addOrder.form.nameLabel')}
                  placeholder={t('addOrder.form.namePlaceholder')}
                  value={formData.customer_name}
                  onChangeText={(value) => updateFormField('customer_name', value)}
                  leftIcon="person-outline"
                />

                <Input
                  label={t('addOrder.form.phoneLabel')}
                  placeholder={t('addOrder.form.phonePlaceholder')}
                  value={formData.phone}
                  onChangeText={(value) => updateFormField('phone', value)}
                  keyboardType="phone-pad"
                  leftIcon="call-outline"
                />

                {formData.order_type === 'dine_in' && (
                  <Input
                    label={t('addOrder.form.tableLabel')}
                    placeholder={t('addOrder.form.tablePlaceholder')}
                    value={formData.table_number}
                    onChangeText={(value) => updateFormField('table_number', value)}
                    leftIcon="restaurant-outline"
                  />
                )}

                <Input
                  label={t('addOrder.form.notesLabel')}
                  placeholder={t('addOrder.form.notesPlaceholder')}
                  value={formData.notes}
                  onChangeText={(value) => updateFormField('notes', value)}
                  leftIcon="chatbubble-ellipses-outline"
                  multiline
                />

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 12,
                  }}
                >
                  <Text style={{ color: colors.text.secondary }}>{t('addOrder.form.paymentMethod')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      title={t('addOrder.payment.cash')}
                      size="sm"
                      variant={formData.payment_method === 'cash' ? 'primary' : 'outline'}
                      onPress={() => updateFormField('payment_method', 'cash')}
                    />
                    <Button
                      title={t('addOrder.payment.card')}
                      size="sm"
                      variant={formData.payment_method === 'card' ? 'primary' : 'outline'}
                      onPress={() => updateFormField('payment_method', 'card')}
                    />
                    <Button
                      title={t('addOrder.payment.online')}
                      size="sm"
                      variant={formData.payment_method === 'online' ? 'primary' : 'outline'}
                      onPress={() => updateFormField('payment_method', 'online')}
                    />
                  </View>
                </View>

                <Button
                  title={isLoading ? t('addOrder.submitting') : t('checkout.submit.validateOrder')}
                  onPress={handleSubmitOrder}
                  variant="primary"
                  leftIcon="checkmark"
                  style={{ marginTop: 16 }}
                  disabled={isLoading}
                />
              </Card>
            )}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}