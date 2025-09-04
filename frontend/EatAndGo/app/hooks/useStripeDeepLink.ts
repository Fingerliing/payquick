import { useEffect } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { stripeService } from '@/services/stripeService';

export function useStripeDeepLink() {
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      console.log('Deep link reçu:', url);
      
      const result = stripeService.handleStripeReturn(url);
      
      if (result.success) {
        switch (result.type) {
          case 'success':
            router.push('./stripe/success');
            break;
          case 'refresh':
            router.push('./stripe/refresh');
            break;
          case 'cancel':
            router.replace('/(restaurant)');
            break;
        }
      }
    };

    // Gérer l'app ouverte via deep link
    const handleInitialURL = async () => {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        handleDeepLink(initialURL);
      }
    };

    // Gérer les deep links quand l'app est ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    handleInitialURL();

    return () => {
      subscription?.remove();
    };
  }, []);
}