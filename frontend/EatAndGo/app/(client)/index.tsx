import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import QRScanner from '@/components/client/QRScanner';

export default function ClientHome() {
  const [showScanner, setShowScanner] = useState(false);
  const { user } = useAuth();

  const handleScanSuccess = (qrData: string) => {
    console.log('QR Code scanné:', qrData);
    
    // Parser l'URL du QR code pour extraire restaurant ID et table
    const restaurantMatch = qrData.match(/restaurant[\/=](\d+)/i);
    const tableMatch = qrData.match(/table[\/=](\d+)/i);
    
    if (restaurantMatch) {
      const restaurantId = restaurantMatch[1];
      const tableNumber = tableMatch ? tableMatch[1] : null;
      
      // Naviguer vers le menu client
      router.push({
        pathname: `/menu/client/${restaurantId}` as any,
        params: { table: tableNumber }
      });
    }
    
    setShowScanner(false);
  };

  if (showScanner) {
    return (
      <QRScanner
        onScanSuccess={handleScanSuccess}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PayQuick</Text>
        <Text style={styles.subtitle}>Commandez facilement</Text>
        {user && (
          <Text style={styles.welcome}>
            Bonjour {user.first_name} ! 👋
          </Text>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.scannerCard}>
          <Ionicons name="qr-code-outline" size={80} color="#FF6B35" />
          <Text style={styles.scannerTitle}>Scanner pour commander</Text>
          <Text style={styles.scannerDescription}>
            Scannez le QR code sur votre table pour accéder au menu du restaurant
          </Text>
          
          <Pressable 
            style={styles.scanButton} 
            onPress={() => setShowScanner(true)}
          >
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={styles.scanButtonText}>Scanner QR Code</Text>
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Actions rapides</Text>
          
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push('/(client)/browse')}
          >
            <Ionicons name="restaurant-outline" size={24} color="#666" />
            <Text style={styles.actionButtonText}>Parcourir les restaurants</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
          
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push('/(client)/orders')}
          >
            <Ionicons name="receipt-outline" size={24} color="#666" />
            <Text style={styles.actionButtonText}>Mes commandes</Text>
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
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  welcome: {
    fontSize: 16,
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  scannerCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
  },
  scannerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  scannerDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  quickActions: {
    flex: 1,
  },
  quickActionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
});