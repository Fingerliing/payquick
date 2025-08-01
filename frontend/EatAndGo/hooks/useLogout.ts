import { useAuth } from '../contexts/AuthContext';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLogout() {
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 Début de la déconnexion...');
              
              // 1. Appeler la fonction logout du contexte
              await logout();
              
              // 2. Nettoyage manuel de sécurité
              await AsyncStorage.multiRemove([
                'authToken', 
                'userToken', 
                'accessToken', 
                'refreshToken',
                'user', 
                'userProfile', 
                'authState'
              ]);
              
              // 3. Redirection forcée
              console.log('🔄 Redirection forcée vers login...');
              router.replace('/(auth)/login');
              
              console.log('✅ Déconnexion réussie');
              
            } catch (error) {
              console.error('❌ Erreur lors de la déconnexion:', error);
              
              try {
                await AsyncStorage.clear();
                router.replace('/(auth)/login');
                console.log('🔧 Déconnexion forcée après erreur');
              } catch (forceError) {
                console.error('❌ Erreur lors de la déconnexion forcée:', forceError);
                Alert.alert(
                  'Erreur Critique',
                  'Impossible de se déconnecter. Redémarrez l\'application.',
                  [
                    { 
                      text: 'Redémarrer', 
                      onPress: () => {
                        // Tentative de redirection d'urgence
                        router.replace('/(auth)/login');
                      }
                    }
                  ]
                );
              }
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const forceLogout = async () => {
    try {
      console.log('🚨 Déconnexion forcée d\'urgence...');
      
      // Nettoyer tout le stockage
      await AsyncStorage.clear();
      
      // Appeler logout du contexte (ne pas attendre en cas d'erreur)
      try {
        await logout();
      } catch (contextError) {
        console.warn('⚠️ Erreur contexte ignorée lors du logout forcé:', contextError);
      }
      
      // Redirection forcée
      router.replace('/(auth)/login');
      
      console.log('✅ Déconnexion forcée réussie');
      
    } catch (error) {
      console.error('❌ Erreur déconnexion forcée:', error);
      // Dernière tentative
      router.replace('/(auth)/login');
    }
  };

  return { 
    handleLogout, 
    forceLogout
  };
}