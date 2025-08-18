import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface QRScannerProps {
  onScanSuccess?: (data: string) => void;
  onClose?: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    console.log('🎯 QR Code scanné:', data);
    
    if (!isScanning) return;
    
    setIsScanning(false);
    
    // 🔧 CORRECTION: Extraire l'identifiant et valider
    const processedData = extractAndValidateCode(data);
    
    if (processedData) {
      console.log('✅ QR Code valide, identifiant extrait:', processedData);
      onScanSuccess?.(processedData);
    } else {
      console.log('❌ QR Code invalide:', data);
      Alert.alert(
        'QR Code invalide',
        `Ce QR code ne correspond pas à un restaurant Eat&Go\n\nValeur scannée: ${data}`,
        [
          { text: 'Réessayer', onPress: () => setIsScanning(true) },
          { text: 'Annuler', onPress: onClose }
        ]
      );
    }
  };

  const extractAndValidateCode = (data: string): string | null => {
    console.log('🔍 Analyse du QR code:', {
      rawData: data,
      isUrl: data.startsWith('http'),
      length: data.length
    });
    
    // Cas 1: C'est une URL de votre app
    if (data.startsWith('http')) {
      try {
        const url = new URL(data);
        console.log('🔍 URL analysée:', {
          host: url.host,
          pathname: url.pathname,
          segments: url.pathname.split('/').filter(Boolean)
        });
        
        // Vérifier si c'est une URL de table publique
        if (url.pathname.includes('/table/public/')) {
          const segments = url.pathname.split('/').filter(Boolean);
          const lastSegment = segments[segments.length - 1];
          
          console.log('🔧 Extraction depuis URL:', {
            segments: segments,
            lastSegment: lastSegment,
            isValidFormat: /^R\d+T\d+$/.test(lastSegment || '')
          });
          
          // Vérifier que c'est bien un identifiant de table
          if (lastSegment && /^R\d+T\d+$/.test(lastSegment)) {
            return lastSegment;
          }
        }
        
        // Vérifier d'autres patterns dans l'URL
        if (url.pathname.includes('/restaurant/') || url.pathname.includes('/table/')) {
          const segments = url.pathname.split('/').filter(Boolean);
          const lastSegment = segments[segments.length - 1];
          if (lastSegment && lastSegment.length > 0) {
            return lastSegment;
          }
        }
        
      } catch (error) {
        console.error('❌ Erreur analyse URL:', error);
      }
    }
    
    // Cas 2: C'est directement un identifiant de table
    if (/^R\d+T\d+$/.test(data)) {
      console.log('✅ Identifiant direct détecté:', data);
      return data;
    }
    
    // Cas 3: Autres formats possibles
    if (data.length >= 4 && data.length <= 20) {
      // Accepter les codes courts qui pourraient être des identifiants
      console.log('🤔 Code court accepté:', data);
      return data;
    }
    
    console.log('❌ Aucun format reconnu');
    return null;
  };

  // 🗑️ ANCIENNE FONCTION - remplacée par extractAndValidateCode
  const isValidEatAndGoQR = (data: string): boolean => {
    // Cette fonction n'est plus utilisée
    return data.includes('eatandgo') || 
           data.includes('restaurant') || 
           /restaurant[\/=]\d+/i.test(data);
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text style={styles.permissionTitle}>Accès caméra requis</Text>
        <Text style={styles.permissionText}>
          Pour scanner les QR codes, nous avons besoin d'accéder à votre caméra.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
      />
      
      {/* Overlay avec cadre de scan */}
      <View style={styles.overlay}>
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </View>
      
      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Pointez la caméra vers le QR code du restaurant
        </Text>
      </View>
      
      {/* Bouton fermer */}
      {onClose && (
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={32} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#FF6B35',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instructions: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
    borderRadius: 8,
  },
  instructionText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});