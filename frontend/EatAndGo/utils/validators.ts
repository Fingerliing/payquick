export class ValidationUtils {
  static isEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isPhone(phone: string): boolean {
    const phoneRegex = /^(?:\+33|0)[1-9](?:[0-9]{8})$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  static isPostalCode(postalCode: string, country = 'FR'): boolean {
    switch (country) {
      case 'FR':
        return /^[0-9]{5}$/.test(postalCode);
      default:
        return postalCode.length > 0;
    }
  }

  static isStrongPassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Le mot de passe doit contenir au moins 8 caractères');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une minuscule');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins une majuscule');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un chiffre');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Le mot de passe doit contenir au moins un caractère spécial');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static isUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isNumber(value: string): boolean {
    return !isNaN(Number(value)) && !isNaN(parseFloat(value));
  }

  static isInteger(value: string): boolean {
    return Number.isInteger(Number(value));
  }

  static isPositive(value: number): boolean {
    return value > 0;
  }

  static isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  static isRequired(value: string | null | undefined): boolean {
    return value != null && value.trim().length > 0;
  }

  static minLength(value: string, min: number): boolean {
    return value.length >= min;
  }

  static maxLength(value: string, max: number): boolean {
    return value.length <= max;
  }

  static validateRestaurant(data: any): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!this.isRequired(data.name)) {
      errors.name = 'Le nom est requis';
    }

    if (!this.isRequired(data.address)) {
      errors.address = 'L\'adresse est requise';
    }

    if (!this.isRequired(data.city)) {
      errors.city = 'La ville est requise';
    }

    if (!this.isRequired(data.zipCode)) {
      errors.zipCode = 'Le code postal est requis';
    } else if (!this.isPostalCode(data.zipCode)) {
      errors.zipCode = 'Code postal invalide';
    }

    if (!this.isRequired(data.phone)) {
      errors.phone = 'Le téléphone est requis';
    } else if (!this.isPhone(data.phone)) {
      errors.phone = 'Numéro de téléphone invalide';
    }

    if (!this.isRequired(data.email)) {
      errors.email = 'L\'email est requis';
    } else if (!this.isEmail(data.email)) {
      errors.email = 'Email invalide';
    }

    if (data.website && !this.isUrl(data.website)) {
      errors.website = 'URL du site web invalide';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  static validateProduct(data: any): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!this.isRequired(data.name)) {
      errors.name = 'Le nom est requis';
    }

    if (!this.isRequired(data.description)) {
      errors.description = 'La description est requise';
    }

    if (!this.isNumber(data.price)) {
      errors.price = 'Le prix doit être un nombre';
    } else if (!this.isPositive(Number(data.price))) {
      errors.price = 'Le prix doit être positif';
    }

    if (data.preparationTime && !this.isInteger(data.preparationTime)) {
      errors.preparationTime = 'Le temps de préparation doit être un nombre entier';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  // Méthodes de validation spécifiques à PayQuick
  static validateSiret(siret: string): boolean {
    // Validation SIRET français (14 chiffres)
    const siretRegex = /^\d{14}$/;
    return siretRegex.test(siret.replace(/\s/g, ''));
  }

  static validateUserRegistration(data: {
    username: string;
    password: string;
    nom: string;
    role: 'client' | 'restaurateur';
    telephone?: string;
    siret?: string;
  }): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    // Validation nom
    if (!this.isRequired(data.nom)) {
      errors.nom = 'Le nom est obligatoire';
    } else if (!this.minLength(data.nom.trim(), 2)) {
      errors.nom = 'Le nom doit contenir au moins 2 caractères';
    }

    // Validation email (username)
    if (!this.isRequired(data.username)) {
      errors.username = 'L\'email est obligatoire';
    } else if (!this.isEmail(data.username)) {
      errors.username = 'Format d\'email invalide';
    }

    // Validation mot de passe
    if (!this.isRequired(data.password)) {
      errors.password = 'Le mot de passe est obligatoire';
    } else {
      const passwordValidation = this.isStrongPassword(data.password);
      if (!passwordValidation.isValid) {
        errors.password = passwordValidation.errors.join(', ');
      }
    }

    // Validation téléphone (optionnel)
    if (data.telephone && !this.isPhone(data.telephone)) {
      errors.telephone = 'Format de téléphone invalide';
    }

    // Validation SIRET pour les restaurateurs
    if (data.role === 'restaurateur') {
      if (!this.isRequired(data.siret || '')) {
        errors.siret = 'Le SIRET est obligatoire pour les restaurateurs';
      } else if (data.siret && !this.validateSiret(data.siret)) {
        errors.siret = 'Format SIRET invalide (14 chiffres)';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }

  static validateUserLogin(data: {
    username: string;
    password: string;
  }): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    // Validation email
    if (!this.isRequired(data.username)) {
      errors.username = 'L\'email est obligatoire';
    } else if (!this.isEmail(data.username)) {
      errors.username = 'Format d\'email invalide';
    }

    // Validation mot de passe
    if (!this.isRequired(data.password)) {
      errors.password = 'Le mot de passe est obligatoire';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }
}