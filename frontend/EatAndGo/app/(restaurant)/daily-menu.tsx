import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { DailyMenuManager } from '@/components/menu/DailyMenuManager';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { 
  COLORS,
} from '@/utils/designSystem';

export default function DailyMenuScreen() {
  const { currentRestaurant } = useRestaurant();
  
  // Vérification du restaurant sélectionné
  if (!currentRestaurant) {
    // Rediriger vers la sélection de restaurant
    router.replace('/(restaurant)/select' as any);
    return null;
  }

  const handleNavigateToCreate = () => {
    router.push({
      pathname: '/(restaurant)/daily-menu/create' as any,
      params: { restaurantId: currentRestaurant.id }
    });
  };

  const handleNavigateToEdit = (menuId: string) => {
    router.push({
      pathname: '/(restaurant)/daily-menu/edit/[id]' as any,
      params: { id: menuId, restaurantId: currentRestaurant.id }
    });
  };

  return (
    <View style={styles.container}>
      <Header
        title="Gestion des Menus du Jour"
        showBackButton
        rightIcon="calendar"
        onRightPress={() => {
          // Ouvrir un calendrier pour sélectionner une date
          console.log('Calendrier');
        }}
      />
      
      <DailyMenuManager
        restaurantId={String(currentRestaurant.id)}
        onNavigateToCreate={handleNavigateToCreate}
        onNavigateToEdit={handleNavigateToEdit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});