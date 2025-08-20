'use client';

import React, { useState, useEffect } from 'react';
import { 
  useOrderRealtime, 
  OrderUpdate, 
  getOrderStatusColor, 
  getOrderStatusLabel,
  isActiveOrder 
} from '@/utils/realtime';

// Types pour vos commandes (adaptez selon votre interface existante)
interface Order {
  id: number;
  status: string;
  waiting_time?: number;
  restaurant_name?: string;
  created_at: string;
  // ... autres propriétés selon votre modèle
}

interface OrderRealtimeWrapperProps {
  orders: Order[];
  onOrderUpdate?: (orderId: number, update: OrderUpdate) => void;
  children: React.ReactNode;
}

/**
 * Wrapper qui ajoute le temps réel à vos composants existants
 * Utilisez-le autour de vos listes de commandes existantes
 */
export function OrderRealtimeWrapper({ 
  orders, 
  onOrderUpdate, 
  children 
}: OrderRealtimeWrapperProps) {
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Extraire les IDs des commandes actives
  const activeOrderIds = orders
    .filter(order => isActiveOrder(order.status))
    .map(order => order.id);

  const { connectionState, isConnected, activeOrdersCount } = useOrderRealtime(
    activeOrderIds,
    {
      enabled: activeOrderIds.length > 0,
      onOrderUpdate: (update) => {
        console.log('📦 Order update in wrapper:', update);
        setLastUpdate(new Date());
        onOrderUpdate?.(update.order_id, update);
      },
      onConnectionChange: (state) => {
        console.log('🔗 Connection state:', state);
      }
    }
  );

  return (
    <div className="relative">
      {/* Indicateur de connexion (optionnel) */}
      {activeOrdersCount > 0 && (
        <RealtimeIndicator 
          connectionState={connectionState}
          activeOrdersCount={activeOrdersCount}
          lastUpdate={lastUpdate}
        />
      )}
      
      {/* Vos composants existants */}
      {children}
    </div>
  );
}

interface RealtimeIndicatorProps {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  activeOrdersCount: number;
  lastUpdate?: Date;
}

/**
 * Indicateur visuel de l'état de la connexion temps réel
 */
export function RealtimeIndicator({ 
  connectionState, 
  activeOrdersCount, 
  lastUpdate 
}: RealtimeIndicatorProps) {
  const getIndicatorConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          color: 'bg-green-500',
          text: 'Temps réel actif',
          icon: '🟢'
        };
      case 'connecting':
        return {
          color: 'bg-yellow-500',
          text: 'Connexion...',
          icon: '🟡'
        };
      case 'error':
        return {
          color: 'bg-red-500',
          text: 'Erreur de connexion',
          icon: '🔴'
        };
      default:
        return {
          color: 'bg-gray-500',
          text: 'Hors ligne',
          icon: '⚪'
        };
    }
  };

  const config = getIndicatorConfig();

  return (
    <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm font-medium text-gray-700">
        {config.text} ({activeOrdersCount} commande{activeOrdersCount > 1 ? 's' : ''})
      </span>
      
      {lastUpdate && connectionState === 'connected' && (
        <span className="text-xs text-gray-500 ml-auto">
          Dernière mise à jour : {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

interface OrderStatusBadgeProps {
  status: string;
  waiting_time?: number;
  isRealtime?: boolean;
  className?: string;
}

/**
 * Badge de statut amélioré avec indicateur temps réel
 * Remplace ou complète vos badges existants
 */
export function OrderStatusBadge({ 
  status, 
  waiting_time, 
  isRealtime = false,
  className = '' 
}: OrderStatusBadgeProps) {
  const color = getOrderStatusColor(status);
  const label = getOrderStatusLabel(status);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${className}`}
         style={{ backgroundColor: `${color}20`, color: color }}>
      
      {/* Indicateur temps réel */}
      {isRealtime && isActiveOrder(status) && (
        <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
      )}
      
      <span>{label}</span>
      
      {/* Temps d'attente */}
      {waiting_time && (
        <span className="text-xs opacity-75">
          ~{waiting_time}min
        </span>
      )}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  isRealtime?: boolean;
  onOrderClick?: (order: Order) => void;
}

/**
 * Carte de commande avec support temps réel
 * Exemple d'intégration avec vos composants existants
 */
export function OrderCard({ order, isRealtime = false, onOrderClick }: OrderCardProps) {
  const [isUpdated, setIsUpdated] = useState(false);

  // Animation flash lors des mises à jour
  useEffect(() => {
    if (isRealtime) {
      setIsUpdated(true);
      const timer = setTimeout(() => setIsUpdated(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [order.status, order.waiting_time, isRealtime]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const isToday = date.toDateString() === new Date().toDateString();
    
    if (isToday) {
      return `Aujourd'hui à ${date.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })}`;
    }
    
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div 
      className={`
        p-4 bg-white rounded-lg border shadow-sm cursor-pointer
        transition-all duration-300 hover:shadow-md
        ${isUpdated ? 'ring-2 ring-blue-400 bg-blue-50' : ''}
        ${isActiveOrder(order.status) ? 'border-l-4 border-l-blue-500' : ''}
      `}
      onClick={() => onOrderClick?.(order)}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            Commande #{order.id}
          </h3>
          {order.restaurant_name && (
            <p className="text-sm text-gray-600">{order.restaurant_name}</p>
          )}
        </div>
        
        <OrderStatusBadge 
          status={order.status}
          waiting_time={order.waiting_time}
          isRealtime={isRealtime && isActiveOrder(order.status)}
        />
      </div>

      {/* Détails */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{formatDate(order.created_at)}</span>
        
        {isRealtime && isActiveOrder(order.status) && (
          <span className="flex items-center gap-1 text-green-600">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Suivi temps réel
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Hook personnalisé pour intégrer facilement le temps réel à vos pages existantes
 */
export function useOrderListRealtime(initialOrders: Order[]) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Mettre à jour les commandes depuis le parent
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Gestionnaire des mises à jour temps réel
  const handleOrderUpdate = (orderId: number, update: OrderUpdate) => {
    setOrders(prevOrders => 
      prevOrders.map(order => 
        order.id === orderId 
          ? { 
              ...order, 
              status: update.status || order.status,
              waiting_time: update.waiting_time ?? order.waiting_time
            }
          : order
      )
    );
    setLastUpdateTime(new Date());
  };

  return {
    orders,
    lastUpdateTime,
    handleOrderUpdate,
    refreshOrders: () => {
      // Fonction pour forcer un refresh depuis votre API
      // Vous pouvez l'implémenter selon votre logique existante
      setLastUpdateTime(new Date());
    }
  };
}