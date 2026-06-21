import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { useTranslation } from 'react-i18next';
import { useAppTheme, makeShadows } from '@/utils/designSystem';

// TYPES
interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  pendingOrders: number;
  averageOrderValue: number;
  restaurantStatus: 'open' | 'closed';
  weekComparison: {
    orders: number; // pourcentage
    revenue: number;
    avgOrder: number;
  };
}

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  badge?: number;
  isNew?: boolean;
}

interface RecentOrder {
  id: string;
  tableNumber: string;
  items: number;
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served';
  time: string;
  customerName?: string;
}

interface Restaurant {
  id: string;
  name: string;
  description?: string;
  isOpen: boolean;
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 24,
    todayRevenue: 1450.75,
    pendingOrders: 3,
    averageOrderValue: 28.50,
    restaurantStatus: 'open',
    weekComparison: {
      orders: 12,
      revenue: 8,
      avgOrder: 5,
    },
  });
  
  const [restaurant, setRestaurant] = useState<Restaurant>({
    id: '1',
    name: 'Le Bistrot du Port',
    description: 'Cuisine française moderne',
    isOpen: true,
  });
  
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([
    { 
      id: '1', 
      tableNumber: '5', 
      items: 3, 
      total: 45.50, 
      status: 'pending', 
      time: '14:23',
      customerName: 'Martin L.'
    },
    { 
      id: '2', 
      tableNumber: '12', 
      items: 2, 
      total: 32.00, 
      status: 'preparing', 
      time: '14:15',
      customerName: 'Sophie D.'
    },
    { 
      id: '3', 
      tableNumber: '8', 
      items: 4, 
      total: 67.80, 
      status: 'ready', 
      time: '14:08',
      customerName: 'Jean-Pierre M.'
    },
    { 
      id: '4', 
      tableNumber: '15', 
      items: 1, 
      total: 18.50, 
      status: 'served', 
      time: '13:55',
      customerName: 'Emma B.'
    },
  ]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Toast (auto-dismiss) via Alert
  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  // Confirmation (avec boutons) via AlertWithAction
  const [confirm, setConfirm] = useState<{
    visible: boolean;
    nextStatus: 'open' | 'closed' | null;
    title: string;
    message: string;
  }>({ visible: false, nextStatus: null, title: '', message: '' });

  const { isMobile, isTablet, getSpacing, getFontSize } = useResponsive();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const shadows = React.useMemo(() => makeShadows(colors), [colors]);
  // Dégradé header : navy de marque en clair, bleu nuit en dark.
  const headerGradient = (isDark ? ['#070B18', '#0F1528'] : ['#1E2A78', '#3B4695']) as [string, string];
  const statusBarBg = isDark ? '#070B18' : '#1E2A78';
  const FAB_ICON = '#1E2A78'; // icône foncée stable sur le FAB doré

  // QUICK ACTIONS ADAPTATIVES
  const quickActions: QuickAction[] = [
    {
      id: '1',
      title: t('dashboard.actions.orders.title'),
      subtitle: t('dashboard.actions.orders.subtitle'),
      icon: 'receipt-outline',
      color: colors.primary,
      route: '/orders',
      badge: stats.pendingOrders,
    },
    {
      id: '2',
      title: t('dashboard.actions.menu.title'),
      subtitle: t('dashboard.actions.menu.subtitle'),
      icon: 'restaurant-outline',
      color: colors.variants.secondary[700],
      route: '/menu',
    },
    {
      id: '3',
      title: t('dashboard.actions.tables.title'),
      subtitle: t('dashboard.actions.tables.subtitle'),
      icon: 'qr-code-outline',
      color: colors.success,
      route: '/tables',
    },
    {
      id: '4',
      title: t('dashboard.actions.statistics.title'),
      subtitle: t('dashboard.actions.statistics.subtitle'),
      icon: 'stats-chart-outline',
      color: colors.info,
      route: '/analytics',
      isNew: true,
    },
    {
      id: '5',
      title: t('dashboard.actions.profile.title'),
      subtitle: t('dashboard.actions.profile.subtitle'),
      icon: 'settings-outline',
      color: colors.text.secondary,
      route: '/profile',
    },
    {
      id: '6',
      title: t('dashboard.actions.support.title'),
      subtitle: t('dashboard.actions.support.subtitle'),
      icon: 'help-circle-outline',
      color: colors.warning,
      route: '/support',
    },
  ];

  // FONCTIONS DE GESTION
  const showToast = useCallback((
    variant: 'success' | 'error' | 'warning' | 'info',
    message: string,
    title?: string
  ) => {
    setToast({ visible: true, variant, message, title });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const askToggleRestaurantStatus = useCallback(() => {
    const next = stats.restaurantStatus === 'open' ? 'closed' : 'open';
    setConfirm({
      visible: true,
      nextStatus: next,
      title: t('dashboard.toggle.title'),
      message: next === 'open' ? t('dashboard.toggle.confirmOpen') : t('dashboard.toggle.confirmClose'),
    });
  }, [stats.restaurantStatus]);

  const performToggleRestaurantStatus = useCallback(async (next: 'open' | 'closed') => {
    setLoading(true);
    try {
      // Simuler appel API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStats(prev => ({
        ...prev,
        restaurantStatus: next,
      }));
      
      setRestaurant(prev => ({
        ...prev,
        isOpen: next === 'open',
      }));

      showToast('success', next === 'open' ? t('dashboard.toggle.nowOpen') : t('dashboard.toggle.nowClosed'));
    } catch (error) {
      showToast('error', t('dashboard.toggle.error'));
    } finally {
      setLoading(false);
      setConfirm({ visible: false, nextStatus: null, title: '', message: '' });
    }
  }, [showToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Simuler appel API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mettre à jour les données (simulation)
      setStats(prev => ({
        ...prev,
        todayOrders: prev.todayOrders + Math.floor(Math.random() * 3),
        pendingOrders: Math.floor(Math.random() * 5),
      }));
      
      showToast('success', t('dashboard.refresh.success'));
    } catch (error) {
      showToast('error', t('dashboard.refresh.error'));
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);

  // RESPONSIVE GRID CALCULATION
  const getGridColumns = useCallback(() => {
    if (isMobile) return 2;
    if (isTablet) return 3;
    return 4;
  }, [isMobile, isTablet]);

  const gridColumns = getGridColumns();
  const cardWidth = `${(100 / gridColumns) - 2}%` as const;

  // EFFET POUR SIMULATION TEMPS RÉEL
  useEffect(() => {
    const interval = setInterval(() => {
      // Simuler mise à jour des commandes en temps réel
      if (Math.random() > 0.7) {
        setRecentOrders(prev => 
          prev.map(order => 
            order.status === 'pending' && Math.random() > 0.5
              ? { ...order, status: 'confirmed' as const }
              : order.status === 'confirmed' && Math.random() > 0.8
              ? { ...order, status: 'preparing' as const }
              : order
          )
        );
      }
    }, 30000); // Toutes les 30 secondes

    return () => clearInterval(interval);
  }, []);

  // STYLES RESPONSIVES OPTIMISÉS
  const styles = {
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    
    // Header moderne avec gradient
    header: {
      paddingTop: getSpacing(50, 60, 70),
      paddingBottom: getSpacing(SPACING.lg, SPACING.xl),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    headerGradient: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    
    headerTop: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    welcomeSection: {
      flex: 1,
    },
    
    welcomeText: {
      fontSize: getFontSize(16, 18, 20),
      color: '#FFFFFF',
      opacity: 0.9,
    },
    
    restaurantName: {
      fontSize: getFontSize(22, 26, 30),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: '#FFFFFF',
      marginTop: SPACING.xs,
    },
    
    restaurantDesc: {
      fontSize: getFontSize(14, 15, 16),
      color: '#FFFFFF',
      opacity: 0.8,
      marginTop: SPACING.xs,
    },
    
    statusContainer: {
      alignItems: 'flex-end' as const,
    },
    
    statusToggle: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      paddingHorizontal: getSpacing(SPACING.md, SPACING.lg),
      paddingVertical: getSpacing(SPACING.sm, SPACING.md),
      borderRadius: RADIUS.lg,
      minWidth: 80,
    },
    
    statusText: {
      color: '#FFFFFF',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginLeft: SPACING.sm,
      fontSize: getFontSize(14, 15, 16),
    },
    
    // Stats cards section
    statsSection: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      marginTop: -getSpacing(SPACING.lg, SPACING.xl), // Overlap with header
    },
    
    statsGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    statCard: {
      width: isMobile ? '48%' as const : '23%' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    statHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getSpacing(SPACING.sm, SPACING.md),
    },
    
    statLabel: {
      fontSize: getFontSize(12, 14, 16),
      color: colors.text.light,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      flex: 1,
    },
    
    statIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    
    statValue: {
      fontSize: getFontSize(20, 24, 28),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: SPACING.xs,
    },
    
    statSubtext: {
      fontSize: getFontSize(12, 13, 14),
      color: colors.text.secondary,
    },
    
    statTrend: {
      fontSize: getFontSize(12, 13, 14),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    // Content sections
    contentSection: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    sectionHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    sectionTitle: {
      fontSize: getFontSize(18, 20, 24),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    
    seeAllButton: {
      fontSize: getFontSize(14, 15, 16),
      color: colors.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    // Quick actions grid
    actionsGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
    },
    
    actionCard: {
      width: cardWidth,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
      position: 'relative' as const,
    },
    
    actionContent: {
      alignItems: 'center' as const,
      paddingVertical: getSpacing(SPACING.lg, SPACING.xl),
    },
    
    actionIcon: {
      width: isMobile ? 48 : 56,
      height: isMobile ? 48 : 56,
      borderRadius: isMobile ? 24 : 28,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getSpacing(SPACING.md, SPACING.lg),
    },
    
    actionTitle: {
      fontSize: getFontSize(14, 16, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      textAlign: 'center' as const,
      marginBottom: SPACING.xs,
    },
    
    actionSubtitle: {
      fontSize: getFontSize(12, 13, 14),
      color: colors.text.secondary,
      textAlign: 'center' as const,
    },
    
    actionBadge: {
      position: 'absolute' as const,
      top: getSpacing(SPACING.md, SPACING.lg),
      right: getSpacing(SPACING.md, SPACING.lg),
    },
    
    newBadge: {
      position: 'absolute' as const,
      top: getSpacing(SPACING.sm, SPACING.md),
      right: getSpacing(SPACING.sm, SPACING.md),
    },
    
    // Recent orders
    ordersCard: {
      padding: 0,
    },
    
    orderItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: getSpacing(SPACING.md, SPACING.lg),
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    
    orderItemLast: {
      borderBottomWidth: 0,
    },
    
    orderInfo: {
      flex: 1,
      marginLeft: getSpacing(SPACING.md, SPACING.lg),
    },
    
    orderHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: SPACING.xs,
    },
    
    orderTable: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    
    orderTime: {
      fontSize: getFontSize(12, 13, 14),
      color: colors.text.light,
    },
    
    orderCustomer: {
      fontSize: getFontSize(13, 14, 15),
      color: colors.text.secondary,
      marginBottom: SPACING.xs,
    },
    
    orderDetails: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    
    orderItems: {
      fontSize: getFontSize(14, 15, 16),
      color: colors.text.secondary,
    },
    
    orderTotal: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    
    // Floating action button
    fab: {
      position: 'absolute' as const,
      bottom: getSpacing(SPACING.xl, SPACING.xxl),
      right: getSpacing(SPACING.lg, SPACING.xl),
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.secondary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      ...shadows.lg,
    },

    emptyOrders: {
      alignItems: 'center' as const,
      paddingVertical: getSpacing(SPACING.xxl, SPACING.xxl * 2),
    },

    emptyIcon: {
      marginBottom: getSpacing(SPACING.lg, SPACING.xl),
    },

    emptyTitle: {
      fontSize: getFontSize(16, 18, 20),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: SPACING.sm,
    },

    emptyText: {
      fontSize: getFontSize(14, 15, 16),
      color: colors.text.secondary,
      textAlign: 'center' as const,
    },

    // Zone d’alertes (top padding)
    alertsWrapper: {
      paddingHorizontal: getSpacing(SPACING.lg, SPACING.xl),
      marginTop: getSpacing(SPACING.md, SPACING.lg),
      zIndex: 10,
    },
  };

  // COMPOSANT STAT CARD AMÉLIORÉ
  const StatCard = ({ 
    label, 
    value, 
    subtext, 
    trend, 
    icon, 
    color 
  }: {
    label: string;
    value: string;
    subtext: string;
    trend?: number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }) => (
    <Card style={styles.statCard} variant="elevated">
      <View style={styles.statHeader}>
        <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
        <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.statSubtext}>{subtext}</Text>
        {trend !== undefined && (
          <Text style={[
            styles.statTrend,
            { color: trend > 0 ? colors.success : trend < 0 ? colors.error : colors.text.secondary }
          ]}>
            {trend > 0 ? '+' : ''}{trend}%
          </Text>
        )}
      </View>
    </Card>
  );

  // COMPOSANT ACTION CARD AMÉLIORÉ
  const ActionCard = ({ action }: { action: QuickAction }) => (
    <Card 
      style={styles.actionCard}
      variant="elevated"
      pressable
      onPress={() => router.push(action.route as any)}
    >
      <View style={styles.actionContent}>
        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
          <Ionicons 
            name={action.icon} 
            size={isMobile ? 24 : 28} 
            color={action.color} 
          />
        </View>
        <Text style={styles.actionTitle}>{action.title}</Text>
        <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
      </View>
      
      {action.badge && action.badge > 0 && (
        <View style={styles.actionBadge}>
          <Badge 
            text={action.badge.toString()} 
            variant="error" 
            size="sm" 
          />
        </View>
      )}
      
      {action.isNew && (
        <View style={styles.newBadge}>
          <Badge 
            text={t('dashboard.new')} 
            variant="success" 
            size="sm" 
          />
        </View>
      )}
    </Card>
  );

  // COMPOSANT ORDER ITEM AMÉLIORÉ
  const OrderItem = ({ order, isLast }: { order: RecentOrder; isLast: boolean }) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'pending': return colors.warning;
        case 'confirmed': return colors.info;
        case 'preparing': return colors.primary;
        case 'ready': return colors.success;
        case 'served': return colors.text.light;
        default: return colors.text.light;
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'pending': return t('restaurantHome.orderStatus.pending');
        case 'confirmed': return t('restaurantHome.orderStatus.confirmed');
        case 'preparing': return t('restaurantHome.orderStatus.preparing');
        case 'ready': return t('restaurantHome.orderStatus.ready');
        case 'served': return t('restaurantHome.orderStatus.served');
        default: return status;
      }
    };

    const getStatusVariant = (status: string): 'success' | 'warning' | 'error' | 'primary' | 'default' => {
      switch (status) {
        case 'pending': return 'warning';
        case 'ready': return 'success';
        case 'served': return 'default';
        default: return 'primary';
      }
    };

    return (
      <TouchableOpacity 
        style={[styles.orderItem, isLast && styles.orderItemLast]}
        onPress={() => router.push(`/order/${order.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.statIcon,
          { backgroundColor: getStatusColor(order.status) + '20' }
        ]}>
          <Ionicons 
            name="receipt-outline" 
            size={18} 
            color={getStatusColor(order.status)} 
          />
        </View>
        
        <View style={styles.orderInfo}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderTable}>{t('dashboard.table', { number: order.tableNumber })}</Text>
            <Text style={styles.orderTime}>{order.time}</Text>
          </View>
          
          {order.customerName && (
            <Text style={styles.orderCustomer}>{order.customerName}</Text>
          )}
          
          <View style={styles.orderDetails}>
            <Text style={styles.orderItems}>
              {t('dashboard.itemsCount', { count: order.items })}
            </Text>
            <Text style={styles.orderTotal}>{order.total.toFixed(2)}€</Text>
          </View>
        </View>
        
        <Badge 
          text={getStatusText(order.status)} 
          variant={getStatusVariant(order.status)}
          size="sm"
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={statusBarBg} />
      
      {/* HEADER AVEC GRADIENT */}
      <View style={styles.header}>
        <LinearGradient
          colors={headerGradient}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <View style={styles.headerTop}>
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeText}>{t('dashboard.greeting')}</Text>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            {restaurant.description && (
              <Text style={styles.restaurantDesc}>{restaurant.description}</Text>
            )}
          </View>
          
          <View style={styles.statusContainer}>
            <TouchableOpacity 
              style={styles.statusToggle}
              onPress={askToggleRestaurantStatus}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={stats.restaurantStatus === 'open' ? "checkmark-circle" : "close-circle"} 
                size={20} 
                color={stats.restaurantStatus === 'open' ? colors.success : colors.error} 
              />
              <Text style={styles.statusText}>
                {stats.restaurantStatus === 'open' ? t('dashboard.open') : t('dashboard.closed')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ✅ Zone d’alertes (top) */}
      <View style={styles.alertsWrapper}>
        {toast.visible && (
          <InlineAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={hideToast}
            autoDismiss
          />
        )}

        {confirm.visible && confirm.nextStatus && (
          <AlertWithAction
            variant="info"
            title={confirm.title}
            message={confirm.message}
            autoDismiss={false}
            onDismiss={() => setConfirm({ visible: false, nextStatus: null, title: '', message: '' })}
            primaryButton={{
              text: t('common.confirm'),
              onPress: () => performToggleRestaurantStatus(confirm.nextStatus!),
              variant: confirm.nextStatus === 'closed' ? 'danger' : 'primary',
            }}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setConfirm({ visible: false, nextStatus: null, title: '', message: '' }),
            }}
          />
        )}
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* STATS SECTION */}
        <View style={styles.statsSection}>
          <View style={styles.statsGrid}>
            <StatCard
              label={t('dashboard.stats.todayOrders')}
              value={stats.todayOrders.toString()}
              subtext={t('dashboard.stats.vsYesterday')}
              trend={stats.weekComparison.orders}
              icon="receipt-outline"
              color={colors.primary}
            />
            
            <StatCard
              label={t('dashboard.stats.revenue')}
              value={`${stats.todayRevenue.toFixed(0)}€`}
              subtext={t('dashboard.stats.vsYesterday')}
              trend={stats.weekComparison.revenue}
              icon="trending-up-outline"
              color={colors.success}
            />
            
            <StatCard
              label={t('dashboard.stats.pending')}
              value={stats.pendingOrders.toString()}
              subtext={t('dashboard.stats.toProcess')}
              icon="time-outline"
              color={colors.warning}
            />
            
            <StatCard
              label={t('dashboard.stats.avgOrder')}
              value={`${stats.averageOrderValue.toFixed(2)}€`}
              subtext={t('dashboard.stats.vsYesterday')}
              trend={stats.weekComparison.avgOrder}
              icon="calculator-outline"
              color={colors.info}
            />
          </View>
        </View>

        {/* QUICK ACTIONS */}
        <View style={styles.contentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.quickActions')}</Text>
          </View>
          
          <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </View>
        </View>

        {/* RECENT ORDERS */}
        <View style={styles.contentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentOrders')}</Text>
            <TouchableOpacity 
              onPress={() => router.push('/orders' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllButton}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          
          <Card variant="elevated" style={styles.ordersCard}>
            {recentOrders.length === 0 ? (
              <View style={styles.emptyOrders}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="receipt-outline" size={48} color={colors.text.light} />
                </View>
                <Text style={styles.emptyTitle}>{t('dashboard.noOrders')}</Text>
                <Text style={styles.emptyText}>
                  {t('dashboard.noOrdersDesc')}
                </Text>
              </View>
            ) : (
              recentOrders.map((order, index) => (
                <OrderItem 
                  key={order.id} 
                  order={order}
                  isLast={index === recentOrders.length - 1}
                />
              ))
            )}
          </Card>
        </View>

        {/* Espace pour le FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FLOATING ACTION BUTTON */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/order/new' as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={FAB_ICON} />
      </TouchableOpacity>
    </View>
  );
}