import { Restaurant, OpeningHours } from '../types/restaurant';

export class RestaurantHoursUtils {
  private static DAYS_FR = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 
    'Jeudi', 'Vendredi', 'Samedi'
  ];

  /**
   * Vérifie si le restaurant est ouvert à l'heure actuelle
   */
  static isRestaurantOpen(restaurant: Restaurant, currentDate = new Date()): boolean {
    // Si fermeture manuelle active
    if (restaurant.isManuallyOverridden) {
      if (restaurant.manualOverrideUntil) {
        const overrideUntil = new Date(restaurant.manualOverrideUntil);
        if (currentDate <= overrideUntil) {
          return false; // Encore fermé manuellement
        }
      } else {
        return false; // Fermé indéfiniment
      }
    }

    // Vérifier les horaires d'ouverture
    const currentDay = currentDate.getDay(); // 0 = Sunday
    const currentTime = this.formatTimeToMinutes(
      currentDate.getHours(), 
      currentDate.getMinutes()
    );

    const todayHours = Array.isArray(restaurant.openingHours)
      ? restaurant.openingHours.find(h => h.dayOfWeek === currentDay)
      : null;
    
    if (!todayHours || todayHours.isClosed) {
      return false;
    }

    const openTime = this.timeStringToMinutes(todayHours.openTime);
    const closeTime = this.timeStringToMinutes(todayHours.closeTime);

    // Gérer le cas où le restaurant ferme après minuit
    if (closeTime < openTime) {
      // Ex: ouvert de 18:00 à 02:00
      return currentTime >= openTime || currentTime <= closeTime;
    } else {
      // Cas normal: ouvert de 09:00 à 22:00
      return currentTime >= openTime && currentTime <= closeTime;
    }
  }

  /**
   * Calcule les prochaines heures d'ouverture
   */
  static getNextOpeningTime(restaurant: Restaurant, currentDate = new Date()): Date | null {
    const currentDay = currentDate.getDay();
    
    // Chercher dans les 7 prochains jours
    for (let i = 0; i < 7; i++) {
      const checkDay = (currentDay + i) % 7;
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() + i);
      
      const dayHours = Array.isArray(restaurant.openingHours)
        ? restaurant.openingHours.find(h => h.dayOfWeek === checkDay)
        : null;
      
      if (dayHours && !dayHours.isClosed) {
        const [hours, minutes] = dayHours.openTime.split(':').map(Number);
        checkDate.setHours(hours, minutes, 0, 0);
        
        // Si c'est aujourd'hui, vérifier que l'heure n'est pas passée
        if (i === 0 && checkDate <= currentDate) {
          continue;
        }
        
        return checkDate;
      }
    }
    
    return null; // Aucune ouverture prévue dans les 7 prochains jours
  }

  /**
   * Obtient le statut textuel du restaurant
   */
  static getRestaurantStatus(restaurant: Restaurant, currentDate = new Date()): {
    isOpen: boolean;
    status: string;
    nextOpening?: Date | null;
  } {
    if (restaurant.isManuallyOverridden) {
      let status = 'Fermé temporairement';
      if (restaurant.manualOverrideReason) {
        status += ` (${restaurant.manualOverrideReason})`;
      }
      
      if (restaurant.manualOverrideUntil) {
        const reopenDate = new Date(restaurant.manualOverrideUntil);
        status += ` - Réouverture prévue le ${reopenDate.toLocaleDateString('fr-FR')}`;
      }
      
      return { isOpen: false, status };
    }

    const isOpen = this.isRestaurantOpen(restaurant, currentDate);
    
    if (isOpen) {
      const currentDay = currentDate.getDay();
      const todayHours = Array.isArray(restaurant.openingHours)
        ? restaurant.openingHours.find(h => h.dayOfWeek === currentDay)
        : null;
      return {
        isOpen: true,
        status: `Ouvert jusqu'à ${todayHours?.closeTime || 'N/A'}`
      };
    } else {
      const nextOpening = this.getNextOpeningTime(restaurant, currentDate);
      return {
        isOpen: false,
        status: nextOpening ? 
          `Fermé - Réouvre ${this.formatNextOpening(nextOpening, currentDate)}` : 
          'Fermé',
        nextOpening
      };
    }
  }

  /**
   * Formate la prochaine ouverture
   */
  private static formatNextOpening(nextOpening: Date, currentDate: Date): string {
    const diffDays = Math.floor((nextOpening.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `aujourd'hui à ${nextOpening.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `demain à ${nextOpening.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return `${this.DAYS_FR[nextOpening.getDay()]} à ${nextOpening.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  /**
   * Convertit une heure en minutes depuis minuit
   */
  private static timeStringToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Formate des heures/minutes en minutes depuis minuit
   */
  private static formatTimeToMinutes(hours: number, minutes: number): number {
    return hours * 60 + minutes;
  }

  /**
   * Obtient les horaires par défaut (ouvert du lundi au samedi 9h-19h)
   */
  static getDefaultOpeningHours(): OpeningHours[] {
    return [
      { dayOfWeek: 0, openTime: '10:00', closeTime: '18:00', isClosed: true }, // Dimanche fermé
      { dayOfWeek: 1, openTime: '09:00', closeTime: '19:00', isClosed: false }, // Lundi
      { dayOfWeek: 2, openTime: '09:00', closeTime: '19:00', isClosed: false }, // Mardi
      { dayOfWeek: 3, openTime: '09:00', closeTime: '19:00', isClosed: false }, // Mercredi
      { dayOfWeek: 4, openTime: '09:00', closeTime: '19:00', isClosed: false }, // Jeudi
      { dayOfWeek: 5, openTime: '09:00', closeTime: '19:00', isClosed: false }, // Vendredi
      { dayOfWeek: 6, openTime: '10:00', closeTime: '18:00', isClosed: false }, // Samedi
    ];
  }
}