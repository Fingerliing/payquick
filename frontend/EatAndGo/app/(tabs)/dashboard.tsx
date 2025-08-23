import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

// ✅ TYPES POUR DASHBOARD
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
  const { isMobile, isTablet, getSpacing, getFontSize } = useResponsive();

  // ✅ QUICK ACTIONS ADAPTATIVES
  const quickActions: QuickAction[] = [
    {
      id: '1',
      title: 'Commandes',
      subtitle: 'Gérer les commandes',
      icon: 'receipt-outline',
      color: COLORS.primary,
      route: '/orders',
      badge: stats.pendingOrders,
    },
    {
      id: '2',
      title: 'Menu',
      subtitle: 'Modifier la carte',
      icon: 'restaurant-outline',
      color: COLORS.secondary_dark,
      route: '/menu',
    },
    {
      id: '3',
      title: 'Tables',
      subtitle: 'QR codes',
      icon: 'qr-code-outline',
      color: COLORS.success,
      route: '/tables',
    },
    {
      id: '4',
      title: 'Statistiques',
      subtitle: 'Analytics',
      icon: 'stats-chart-outline',
      color: COLORS.info,
      route: '/analytics',
      isNew: true,
    },
    {
      id: '5',
      title: 'Profil',
      subtitle: 'Paramètres',
      icon: 'settings-outline',
      color: COLORS.neutral[600],
      route: '/profile',
    },
    {
      id: '6',
      title: 'Support',
      subtitle: 'Aide & contact',
      icon: 'help-circle-outline',
      color: COLORS.warning,
      route: '/support',
    },
  ];

  // ✅ FONCTIONS DE GESTION
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
      
      console.log('Dashboard data refreshed');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir les données');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const toggleRestaurantStatus = useCallback(async () => {
    const newStatus = stats.restaurantStatus === 'open' ? 'closed' : 'open';
    const statusText = newStatus === 'open' ? 'ouvrir' : 'fermer';
    
    Alert.alert(
      'Changer le statut',
      `Voulez-vous ${statusText} votre restaurant ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Confirmer', 
          onPress: async () => {
            setLoading(true);
            try {
              // Simuler appel API
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              setStats(prev => ({
                ...prev,
                restaurantStatus: newStatus,
              }));
              
              setRestaurant(prev => ({
                ...prev,
                isOpen: newStatus === 'open',
              }));
              
              Alert.alert(
                'Statut mis à jour',
                `Votre restaurant est maintenant ${newStatus === 'open' ? 'ouvert' : 'fermé'}.`
              );
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de modifier le statut');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [stats.restaurantStatus]);

  // ✅ RESPONSIVE GRID CALCULATION
  const getGridColumns = useCallback(() => {
    if (isMobile) return 2;
    if (isTablet) return 3;
    return 4;
  }, [isMobile, isTablet]);

  const gridColumns = getGridColumns();
  const cardWidth = `${(100 / gridColumns) - 2}%` as const;

  // ✅ EFFET POUR SIMULATION TEMPS RÉEL
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

  // ✅ STYLES RESPONSIVES OPTIMISÉS
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background.secondary,
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
      color: COLORS.text.white,
      opacity: 0.9,
    },
    
    restaurantName: {
      fontSize: getFontSize(22, 26, 30),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.white,
      marginTop: SPACING.xs,
    },
    
    restaurantDesc: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.white,
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
      color: COLORS.text.white,
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
      color: COLORS.text.tertiary,
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
      color: COLORS.text.primary,
      marginBottom: SPACING.xs,
    },
    
    statSubtext: {
      fontSize: getFontSize(12, 13, 14),
      color: COLORS.text.secondary,
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
      color: COLORS.text.primary,
    },
    
    seeAllButton: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.primary,
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
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: SPACING.xs,
    },
    
    actionSubtitle: {
      fontSize: getFontSize(12, 13, 14),
      color: COLORS.text.secondary,
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
      borderBottomColor: COLORS.border.light,
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
      color: COLORS.text.primary,
    },
    
    orderTime: {
      fontSize: getFontSize(12, 13, 14),
      color: COLORS.text.tertiary,
    },
    
    orderCustomer: {
      fontSize: getFontSize(13, 14, 15),
      color: COLORS.text.secondary,
      marginBottom: SPACING.xs,
    },
    
    orderDetails: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    
    orderItems: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
    },
    
    orderTotal: {
      fontSize: getFontSize(16, 17, 18),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    
    // Floating action button
    fab: {
      position: 'absolute' as const,
      bottom: getSpacing(SPACING.xl, SPACING.xxl),
      right: getSpacing(SPACING.lg, SPACING.xl),
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: COLORS.secondary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      ...SHADOWS.lg,
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
      color: COLORS.text.primary,
      marginBottom: SPACING.sm,
    },

    emptyText: {
      fontSize: getFontSize(14, 15, 16),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
    },
  };

  // ✅ COMPOSANT STAT CARD AMÉLIORÉ
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
            { color: trend > 0 ? COLORS.success : trend < 0 ? COLORS.error : COLORS.text.secondary }
          ]}>
            {trend > 0 ? '+' : ''}{trend}%
          </Text>
        )}
      </View>
    </Card>
  );

  // ✅ COMPOSANT ACTION CARD AMÉLIORÉ
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
            text="Nouveau" 
            variant="success" 
            size="sm" 
          />
        </View>
      )}
    </Card>
  );

  // ✅ COMPOSANT ORDER ITEM AMÉLIORÉ
  const OrderItem = ({ order, isLast }: { order: RecentOrder; isLast: boolean }) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'pending': return COLORS.warning;
        case 'confirmed': return COLORS.info;
        case 'preparing': return COLORS.primary;
        case 'ready': return COLORS.success;
        case 'served': return COLORS.neutral[500];
        default: return COLORS.neutral[500];
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'pending': return 'En attente';
        case 'confirmed': return 'Confirmée';
        case 'preparing': return 'En préparation';
        case 'ready': return 'Prête';
        case 'served': return 'Servie';
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
            <Text style={styles.orderTable}>Table {order.tableNumber}</Text>
            <Text style={styles.orderTime}>{order.time}</Text>
          </View>
          
          {order.customerName && (
            <Text style={styles.orderCustomer}>{order.customerName}</Text>
          )}
          
          <View style={styles.orderDetails}>
            <Text style={styles.orderItems}>
              {order.items} article{order.items > 1 ? 's' : ''}
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* ✅ HEADER AVEC GRADIENT */}
      <View style={styles.header}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primary_light]}
          style={styles.headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <View style={styles.headerTop}>
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeText}>Bonjour, Chef !</Text>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            {restaurant.description && (
              <Text style={styles.restaurantDesc}>{restaurant.description}</Text>
            )}
          </View>
          
          <View style={styles.statusContainer}>
            <TouchableOpacity 
              style={styles.statusToggle}
              onPress={toggleRestaurantStatus}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={stats.restaurantStatus === 'open' ? "checkmark-circle" : "close-circle"} 
                size={20} 
                color={stats.restaurantStatus === 'open' ? COLORS.success : COLORS.error} 
              />
              <Text style={styles.statusText}>
                {stats.restaurantStatus === 'open' ? 'Ouvert' : 'Fermé'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ✅ STATS SECTION */}
        <View style={styles.statsSection}>
          <View style={styles.statsGrid}>
            <StatCard
              label="Commandes aujourd'hui"
              value={stats.todayOrders.toString()}
              subtext="vs hier"
              trend={stats.weekComparison.orders}
              icon="receipt-outline"
              color={COLORS.primary}
            />
            
            <StatCard
              label="Chiffre d'affaires"
              value={`${stats.todayRevenue.toFixed(0)}€`}
              subtext="vs hier"
              trend={stats.weekComparison.revenue}
              icon="trending-up-outline"
              color={COLORS.success}
            />
            
            <StatCard
              label="En attente"
              value={stats.pendingOrders.toString()}
              subtext="À traiter"
              icon="time-outline"
              color={COLORS.warning}
            />
            
            <StatCard
              label="Panier moyen"
              value={`${stats.averageOrderValue.toFixed(2)}€`}
              subtext="vs hier"
              trend={stats.weekComparison.avgOrder}
              icon="calculator-outline"
              color={COLORS.info}
            />
          </View>
        </View>

        {/* ✅ QUICK ACTIONS */}
        <View style={styles.contentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Actions rapides</Text>
          </View>
          
          <View style={styles.actionsGrid}>
            {quickActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </View>
        </View>

        {/* ✅ RECENT ORDERS */}
        <View style={styles.contentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Commandes récentes</Text>
            <TouchableOpacity 
              onPress={() => router.push('/orders' as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllButton}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          
          <Card variant="elevated" style={styles.ordersCard}>
            {recentOrders.length === 0 ? (
              <View style={styles.emptyOrders}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="receipt-outline" size={48} color={COLORS.neutral[400]} />
                </View>
                <Text style={styles.emptyTitle}>Aucune commande</Text>
                <Text style={styles.emptyText}>
                  Les commandes récentes apparaîtront ici
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

      {/* ✅ FLOATING ACTION BUTTON */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push('/order/new' as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={COLORS.text.primary} />
      </TouchableOpacity>
    </View>
  );
}