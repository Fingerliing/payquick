import { Restaurant, OpeningHours, OpeningPeriod, PeriodValidationResult, HoursValidationResult } from '@/types/restaurant';

export class RestaurantHoursUtils {
  private static DAYS_FR = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 
    'Jeudi', 'Vendredi', 'Samedi'
  ] as const;

  private static DAYS_SHORT_FR = [
    'Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'
  ] as const;

  /**
   * MODIFIÉ: Vérifie si le restaurant est ouvert à l'heure actuelle
   */
  static isRestaurantOpen(restaurant: Restaurant, currentDate = new Date()): boolean {
    try {
      // Si fermeture manuelle active et non expirée
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

      // Vérifier si le restaurant est actif
      if (!restaurant.isActive) {
        return false;
      }

      // MODIFIÉ: Vérifier les horaires d'ouverture avec support multi-périodes
      return this.isOpenAccordingToSchedule(restaurant, currentDate);
    } catch (error) {
      console.error('Erreur lors de la vérification des horaires:', error);
      return false;
    }
  }

  /**
   * NOUVEAU: Vérifie si le restaurant est ouvert selon ses horaires (sans tenir compte des overrides)
   */
  static isOpenAccordingToSchedule(restaurant: Restaurant, currentDate = new Date()): boolean {
    const currentDay = currentDate.getDay();
    const currentTimeMinutes = this.dateToMinutes(currentDate);

    const todayHours = this.getTodayHours(restaurant, currentDay);
    
    if (!todayHours || todayHours.isClosed || todayHours.periods.length === 0) {
      return false;
    }

    // NOUVEAU: Vérifier si l'heure actuelle est dans une des périodes d'ouverture
    return todayHours.periods.some(period => {
      const startTime = this.timeStringToMinutes(period.startTime);
      const endTime = this.timeStringToMinutes(period.endTime);

      // Gérer le cas où la période se termine après minuit
      if (endTime < startTime) {
        return currentTimeMinutes >= startTime || currentTimeMinutes < endTime;
      } else {
        return currentTimeMinutes >= startTime && currentTimeMinutes < endTime;
      }
    });
  }

  /**
   * NOUVEAU: Obtient la période actuelle si le restaurant est ouvert
   */
  static getCurrentPeriod(restaurant: Restaurant, currentDate = new Date()): OpeningPeriod | null {
    const currentDay = currentDate.getDay();
    const currentTimeMinutes = this.dateToMinutes(currentDate);

    const todayHours = this.getTodayHours(restaurant, currentDay);
    
    if (!todayHours || todayHours.isClosed) {
      return null;
    }

    return todayHours.periods.find(period => {
      const startTime = this.timeStringToMinutes(period.startTime);
      const endTime = this.timeStringToMinutes(period.endTime);

      if (endTime < startTime) {
        return currentTimeMinutes >= startTime || currentTimeMinutes < endTime;
      } else {
        return currentTimeMinutes >= startTime && currentTimeMinutes < endTime;
      }
    }) || null;
  }

  /**
   * NOUVEAU: Obtient la prochaine période d'ouverture
   */
  static getNextOpeningPeriod(restaurant: Restaurant, currentDate = new Date()): {
    period: OpeningPeriod;
    date: Date;
    isToday: boolean;
  } | null {
    if (!restaurant.isActive) {
      return null;
    }

    const currentDay = currentDate.getDay();
    const currentTimeMinutes = this.dateToMinutes(currentDate);

    // Chercher d'abord dans les périodes restantes aujourd'hui
    const todayHours = this.getTodayHours(restaurant, currentDay);
    if (todayHours && !todayHours.isClosed) {
      const remainingPeriodsToday = todayHours.periods.filter(period => {
        const startTime = this.timeStringToMinutes(period.startTime);
        return startTime > currentTimeMinutes;
      });

      if (remainingPeriodsToday.length > 0) {
        const nextPeriod = remainingPeriodsToday[0];
        const nextDate = new Date(currentDate);
        const [hours, minutes] = nextPeriod.startTime.split(':').map(Number);
        nextDate.setHours(hours, minutes, 0, 0);

        return {
          period: nextPeriod,
          date: nextDate,
          isToday: true
        };
      }
    }

    // Chercher dans les prochains jours (max 14 jours)
    for (let i = 1; i < 15; i++) {
      const checkDay = (currentDay + i) % 7;
      const dayHours = this.getTodayHours(restaurant, checkDay);
      
      if (dayHours && !dayHours.isClosed && dayHours.periods.length > 0) {
        const firstPeriod = dayHours.periods[0];
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + i);
        const [hours, minutes] = firstPeriod.startTime.split(':').map(Number);
        nextDate.setHours(hours, minutes, 0, 0);

        return {
          period: firstPeriod,
          date: nextDate,
          isToday: false
        };
      }
    }
    
    return null;
  }

  /**
   * NOUVEAU: Obtient la prochaine fermeture si le restaurant est ouvert
   */
  static getNextClosingTime(restaurant: Restaurant, currentDate = new Date()): Date | null {
    const currentPeriod = this.getCurrentPeriod(restaurant, currentDate);
    if (!currentPeriod) {
      return null;
    }

    const closingDate = new Date(currentDate);
    const [hours, minutes] = currentPeriod.endTime.split(':').map(Number);
    
    // Si l'heure de fermeture est le lendemain (ex: fermeture à 01:00)
    if (hours < 12) {
      closingDate.setDate(closingDate.getDate() + 1);
    }
    
    closingDate.setHours(hours, minutes, 0, 0);
    return closingDate;
  }

  /**
   * MODIFIÉ: Obtient le statut textuel du restaurant avec support des périodes multiples
   */
  static getRestaurantStatus(restaurant: Restaurant, currentDate = new Date()): {
    isOpen: boolean;
    status: string;
    shortStatus?: string;
    currentPeriod?: OpeningPeriod;
    nextPeriod?: { period: OpeningPeriod; date: Date; isToday: boolean };
  } {
    // Vérifier si l'override est expiré
    if (restaurant.isManuallyOverridden && restaurant.manualOverrideUntil) {
      const overrideUntil = new Date(restaurant.manualOverrideUntil);
      if (currentDate > overrideUntil) {
        const isNowOpen = this.isOpenAccordingToSchedule(restaurant, currentDate);
        return {
          isOpen: isNowOpen,
          status: 'Fermeture expirée - Statut mis à jour automatiquement',
          shortStatus: 'Mise à jour auto'
        };
      }
    }

    if (restaurant.isManuallyOverridden) {
      let status = 'Fermé temporairement';
      if (restaurant.manualOverrideReason) {
        status += ` (${restaurant.manualOverrideReason})`;
      }
      
      if (restaurant.manualOverrideUntil) {
        const reopenDate = new Date(restaurant.manualOverrideUntil);
        status += ` jusqu'au ${reopenDate.toLocaleDateString('fr-FR')}`;
      }
      
      return { 
        isOpen: false, 
        status,
        shortStatus: 'Fermé temp.'
      };
    }

    if (!restaurant.isActive) {
      return {
        isOpen: false,
        status: 'Restaurant désactivé',
        shortStatus: 'Désactivé'
      };
    }

    const isOpen = this.isOpenAccordingToSchedule(restaurant, currentDate);
    const currentPeriod = this.getCurrentPeriod(restaurant, currentDate);
    
    if (isOpen && currentPeriod) {
      const closingTime = this.getNextClosingTime(restaurant, currentDate);
      const periodName = currentPeriod.name || 'Service en cours';
      const timeString = closingTime ? closingTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : currentPeriod.endTime;
      
      return {
        isOpen: true,
        status: `${periodName} jusqu'à ${timeString}`,
        shortStatus: `Ouvert jusqu'à ${currentPeriod.endTime}`,
        currentPeriod
      };
    } else {
      const nextPeriod = this.getNextOpeningPeriod(restaurant, currentDate);
      if (nextPeriod) {
        const nextOpeningText = this.formatNextOpening(nextPeriod.date, currentDate);
        const periodName = nextPeriod.period.name || 'Service';
        
        return {
          isOpen: false,
          status: `Fermé - ${periodName} ${nextOpeningText}`,
          shortStatus: 'Fermé',
          nextPeriod
        };
      } else {
        return {
          isOpen: false,
          status: 'Fermé - Aucune ouverture prévue',
          shortStatus: 'Fermé'
        };
      }
    }
  }

  /**
   * MODIFIÉ: Obtient un résumé lisible des horaires avec support multi-périodes
   */
  static getWeekSummary(restaurant: Restaurant): string {
    if (!Array.isArray(restaurant.openingHours) || restaurant.openingHours.length === 0) {
      return 'Horaires non définis';
    }

    const summaryParts: string[] = [];
    
    restaurant.openingHours.forEach(day => {
      const dayName = this.DAYS_SHORT_FR[day.dayOfWeek];
      
      if (day.isClosed || day.periods.length === 0) {
        summaryParts.push(`${dayName}: Fermé`);
      } else {
        const periodsText = day.periods
          .map(p => `${p.startTime}-${p.endTime}`)
          .join(', ');
        summaryParts.push(`${dayName}: ${periodsText}`);
      }
    });

    return summaryParts.join(' • ');
  }

  /**
   * NOUVEAU: Valide les horaires avec support des périodes multiples
   */
  static validateOpeningHours(openingHours: OpeningHours[]): HoursValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    const dayValidations: { [dayOfWeek: number]: PeriodValidationResult } = {};

    if (!Array.isArray(openingHours) || openingHours.length !== 7) {
      errors.push('Les horaires doivent couvrir les 7 jours de la semaine');
      return { isValid: false, errors, warnings, suggestions, dayValidations };
    }

    // Vérifier que tous les jours sont présents
    const daysCovered = new Set(openingHours.map(h => h.dayOfWeek));
    for (let i = 0; i < 7; i++) {
      if (!daysCovered.has(i)) {
        errors.push(`Horaires manquants pour ${this.DAYS_FR[i]}`);
      }
    }

    // Valider chaque jour
    openingHours.forEach(day => {
      const dayValidation = this.validateDayPeriods(day);
      dayValidations[day.dayOfWeek] = dayValidation;

      if (!dayValidation.isValid) {
        errors.push(...dayValidation.errors.map(e => `${this.DAYS_FR[day.dayOfWeek]}: ${e}`));
      }
      warnings.push(...dayValidation.warnings.map(w => `${this.DAYS_FR[day.dayOfWeek]}: ${w}`));
    });

    // Suggestions globales
    const openDays = openingHours.filter(d => !d.isClosed).length;
    if (openDays === 0) {
      suggestions.push('Votre restaurant est fermé toute la semaine');
    } else if (openDays < 5) {
      suggestions.push('Considérez ouvrir plus de jours pour augmenter votre chiffre d\'affaires');
    }

    // Vérifier les services typiques d'un restaurant
    const hasLunchService = openingHours.some(day => 
      day.periods.some(period => {
        const start = this.timeStringToMinutes(period.startTime);
        const end = this.timeStringToMinutes(period.endTime);
        return start <= 12 * 60 && end >= 14 * 60; // Service qui couvre 12h-14h
      })
    );

    const hasDinnerService = openingHours.some(day => 
      day.periods.some(period => {
        const start = this.timeStringToMinutes(period.startTime);
        const end = this.timeStringToMinutes(period.endTime);
        return start <= 19 * 60 && end >= 21 * 60; // Service qui couvre 19h-21h
      })
    );

    if (!hasLunchService && !hasDinnerService) {
      warnings.push('Aucun service aux heures de repas traditionnelles détecté');
    } else if (!hasLunchService) {
      suggestions.push('Considérez ajouter un service déjeuner pour augmenter votre activité');
    } else if (!hasDinnerService) {
      suggestions.push('Considérez ajouter un service dîner pour augmenter votre activité');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      dayValidations
    };
  }

  /**
   * NOUVEAU: Valide les périodes d'un jour donné
   */
  static validateDayPeriods(day: OpeningHours): PeriodValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: PeriodValidationResult['conflicts'] = [];

    if (day.isClosed) {
      return { isValid: true, errors, warnings, conflicts };
    }

    if (day.periods.length === 0) {
      errors.push('Aucune période définie pour un jour ouvert');
      return { isValid: false, errors, warnings, conflicts };
    }

    // Valider chaque période individuellement
    day.periods.forEach((period, index) => {
      if (!this.isValidTimeFormat(period.startTime)) {
        errors.push(`Format d'heure de début invalide pour la période ${index + 1}`);
      }
      if (!this.isValidTimeFormat(period.endTime)) {
        errors.push(`Format d'heure de fin invalide pour la période ${index + 1}`);
      }

      if (this.isValidTimeFormat(period.startTime) && this.isValidTimeFormat(period.endTime)) {
        const startMinutes = this.timeStringToMinutes(period.startTime);
        const endMinutes = this.timeStringToMinutes(period.endTime);
        
        // Durée minimale de 30 minutes
        let duration = endMinutes - startMinutes;
        if (duration < 0) duration += 24 * 60; // Service qui traverse minuit
        
        if (duration < 30) {
          conflicts.push({
            type: 'too_short',
            period1: period,
            message: `Période trop courte (${duration} min). Minimum recommandé: 30 min`,
            severity: 'warning'
          });
        }

        // Durée maximale de 18 heures
        if (duration > 18 * 60) {
          conflicts.push({
            type: 'too_long',
            period1: period,
            message: `Période très longue (${Math.round(duration / 60)}h). Vérifiez si c'est intentionnel`,
            severity: 'warning'
          });
        }
      }
    });

    // Vérifier les chevauchements entre périodes
    for (let i = 0; i < day.periods.length - 1; i++) {
      for (let j = i + 1; j < day.periods.length; j++) {
        const period1 = day.periods[i];
        const period2 = day.periods[j];
        
        if (this.periodsOverlap(period1, period2)) {
          conflicts.push({
            type: 'overlap',
            period1,
            period2,
            message: `Chevauchement entre "${period1.name || 'Période ' + (i + 1)}" et "${period2.name || 'Période ' + (j + 1)}"`,
            severity: 'error'
          });
          errors.push(`Chevauchement entre les périodes ${i + 1} et ${j + 1}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      conflicts
    };
  }

  /**
   * MODIFIÉ: Calcule le temps d'ouverture total par semaine avec support multi-périodes
   */
  static calculateWeeklyOpenHours(restaurant: Restaurant): number {
    if (!Array.isArray(restaurant.openingHours)) {
      return 0;
    }

    let totalMinutes = 0;

    restaurant.openingHours.forEach(day => {
      if (!day.isClosed && day.periods.length > 0) {
        day.periods.forEach(period => {
          const startMinutes = this.timeStringToMinutes(period.startTime);
          const endMinutes = this.timeStringToMinutes(period.endTime);
          
          let duration = endMinutes - startMinutes;
          if (duration < 0) duration += 24 * 60; // Service qui traverse minuit
          
          totalMinutes += duration;
        });
      }
    });

    return Math.round(totalMinutes / 60 * 100) / 100; // Arrondi à 2 décimales
  }

  /**
   * NOUVEAU: Obtient le nombre de services par jour de la semaine
   */
  static getServicesPerDay(restaurant: Restaurant): { [dayOfWeek: number]: number } {
    const servicesPerDay: { [dayOfWeek: number]: number } = {};
    
    restaurant.openingHours.forEach(day => {
      servicesPerDay[day.dayOfWeek] = day.isClosed ? 0 : day.periods.length;
    });

    return servicesPerDay;
  }

  /**
   * NOUVEAU: Identifie le type de service d'une période
   */
  static identifyServiceType(period: OpeningPeriod): 'breakfast' | 'lunch' | 'dinner' | 'continuous' | 'late_night' {
    const startMinutes = this.timeStringToMinutes(period.startTime);
    const endMinutes = this.timeStringToMinutes(period.endTime);
    let duration = endMinutes - startMinutes;
    if (duration < 0) duration += 24 * 60;

    // Service continu (plus de 8h)
    if (duration > 8 * 60) {
      return 'continuous';
    }

    // Classification selon l'heure de début
    if (startMinutes >= 7 * 60 && startMinutes < 11 * 60) {
      return 'breakfast';
    } else if (startMinutes >= 11 * 60 && startMinutes < 16 * 60) {
      return 'lunch';
    } else if (startMinutes >= 18 * 60 && startMinutes < 23 * 60) {
      return 'dinner';
    } else {
      return 'late_night';
    }
  }

  /**
   * NOUVEAU: Génère les options d'heures pour un sélecteur
   */
  static generateTimeOptions(startHour = 6, endHour = 25, interval = 30): string[] {
    const options: string[] = [];
    
    for (let hour = startHour; hour < endHour; hour++) {
      const displayHour = hour >= 24 ? hour - 24 : hour;
      for (let minute = 0; minute < 60; minute += interval) {
        const timeString = `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeString);
      }
    }
    
    return options;
  }

  /**
   * NOUVEAU: Formate la prochaine ouverture de manière lisible
   */
  static formatNextOpening(nextOpening: Date, currentDate = new Date()): string {
    const diffMs = nextOpening.getTime() - currentDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const timeString = nextOpening.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    if (diffDays === 0) {
      return `aujourd'hui à ${timeString}`;
    } else if (diffDays === 1) {
      return `demain à ${timeString}`;
    } else if (diffDays < 7) {
      return `${this.DAYS_FR[nextOpening.getDay()]} à ${timeString}`;
    } else {
      return `le ${nextOpening.toLocaleDateString('fr-FR')} à ${timeString}`;
    }
  }

  // === Méthodes utilitaires privées ===

  private static getTodayHours(restaurant: Restaurant, dayOfWeek: number): OpeningHours | null {
    if (!Array.isArray(restaurant.openingHours)) {
      return null;
    }
    return restaurant.openingHours.find(h => h.dayOfWeek === dayOfWeek) || null;
  }

  private static timeStringToMinutes(timeString: string): number {
    try {
      const [hours, minutes] = timeString.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time format');
      }
      return hours * 60 + minutes;
    } catch {
      return 0;
    }
  }

  private static dateToMinutes(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
  }

  private static isValidTimeFormat(timeString: string): boolean {
    if (!timeString || typeof timeString !== 'string') {
      return false;
    }
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
  }

  private static periodsOverlap(period1: OpeningPeriod, period2: OpeningPeriod): boolean {
    const start1 = this.timeStringToMinutes(period1.startTime);
    const end1 = this.timeStringToMinutes(period1.endTime);
    const start2 = this.timeStringToMinutes(period2.startTime);
    const end2 = this.timeStringToMinutes(period2.endTime);

    // Gestion simple sans traversée de minuit pour la détection de chevauchement
    return Math.max(start1, start2) < Math.min(end1, end2);
  }
}