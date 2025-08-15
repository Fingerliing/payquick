import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  Pressable, 
  StatusBar,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';

export default function ClientHome() {
  const { user } = useAuth();
  const statusBarHeight = Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 0;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: statusBarHeight }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Eat&Go</Text>
        <Text style={styles.subtitle}>Commandez facilement</Text>
        {user && (
          <Text style={styles.welcome}>
            Bonjour {user.first_name || user.username} ! 👋
          </Text>
        )}
      </View>

      <View style={styles.content}>
        {/* Composant QR Scanner réutilisable */}
        <QRAccessButtons />

        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Actions rapides</Text>
          
          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/(client)/browse')}
          >
            <Ionicons name="restaurant-outline" size={24} color="#666" />
            <Text style={styles.quickActionButtonText}>Parcourir les restaurants</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
          
          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/(client)/orders')}
          >
            <Ionicons name="receipt-outline" size={24} color="#666" />
            <Text style={styles.quickActionButtonText}>Mes commandes</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/(client)/cart')}
          >
            <Ionicons name="bag-outline" size={24} color="#666" />
            <Text style={styles.quickActionButtonText}>Mon panier</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  welcome: {
    fontSize: 16,
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  quickActions: {
    flex: 1,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  quickActionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
});