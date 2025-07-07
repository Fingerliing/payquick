export class FormatUtils {
  static formatPrice(price: number, currency = '€'): string {
    return `${price.toFixed(2)} ${currency}`;
  }

  static formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return dateObj.toLocaleDateString('fr-FR', { ...defaultOptions, ...options });
  }

  static formatTime(date: string | Date): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  static formatDateTime(date: string | Date): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  static formatPhone(phone: string): string {
    // Format français: +33 6 12 34 56 78
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('33') && cleaned.length === 11) {
      return `+33 ${cleaned.slice(2, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9)}`;
    }
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
      return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
    }
    return phone;
  }

  static formatAddress(address: {
    street: string;
    city: string;
    zipCode: string;
    country?: string;
  }): string {
    const parts = [address.street, `${address.zipCode} ${address.city}`];
    if (address.country) {
      parts.push(address.country);
    }
    return parts.join(', ');
  }

  static formatDistance(distanceInKm: number): string {
    if (distanceInKm < 1) {
      return `${Math.round(distanceInKm * 1000)} m`;
    }
    return `${distanceInKm.toFixed(1)} km`;
  }

  static formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h${remainingMinutes.toString().padStart(2, '0')}`;
  }

  static formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }

  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  static capitalizeFirst(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  static slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  static trimChars(str: string, chars: string): string {
    const escapeChars = chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^[${escapeChars}]+|[${escapeChars}]+$`, 'g');
    return str.replace(regex, '');
  }

  static formatUrl(url: string): string {
    if (!url) return '';
    
    // Ajouter https:// si pas de protocole
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    
    return url;
  }

  static formatRating(rating: number, maxRating = 5): string {
    const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(maxRating - Math.floor(rating));
    return `${stars} (${rating.toFixed(1)})`;
  }

  static formatOrderNumber(orderId: string): string {
    // Prendre les 8 derniers caractères
    return `#${orderId.slice(-8).toUpperCase()}`;
  }

  static formatPercentage(value: number, decimals = 1): string {
    return `${value.toFixed(decimals)}%`;
  }

  static formatRelativeTime(date: string | Date): string {
    const now = new Date();
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const diffInMinutes = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'À l\'instant';
    } else if (diffInMinutes < 60) {
      return `Il y a ${diffInMinutes} min`;
    } else if (diffInMinutes < 1440) { // 24 heures
      const hours = Math.floor(diffInMinutes / 60);
      return `Il y a ${hours}h`;
    } else if (diffInMinutes < 43200) { // 30 jours
      const days = Math.floor(diffInMinutes / 1440);
      return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
    } else {
      return this.formatDate(targetDate);
    }
  }

  static formatPriceWithDiscount(originalPrice: number, currentPrice: number, currency = '€'): string {
    if (originalPrice === currentPrice) {
      return this.formatPrice(currentPrice, currency);
    }
    
    const discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    return `${this.formatPrice(currentPrice, currency)} (-${discount}%)`;
  }

  static formatQuantity(quantity: number, unit?: string): string {
    if (unit) {
      return `${quantity} ${unit}${quantity > 1 ? 's' : ''}`;
    }
    return quantity.toString();
  }

  static formatCoordinates(latitude: number, longitude: number): string {
    const latDir = latitude >= 0 ? 'N' : 'S';
    const lonDir = longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(latitude).toFixed(6)}°${latDir}, ${Math.abs(longitude).toFixed(6)}°${lonDir}`;
  }

  static formatFullName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }

  static formatInitials(firstName: string, lastName: string): string {
    const firstInitial = firstName ? firstName.charAt(0).toUpperCase() : '';
    const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
    return `${firstInitial}${lastInitial}`;
  }

  static getStatusColor(status: string): string {
    const statusColors: Record<string, string> = {
      pending: '#F59E0B',
      confirmed: '#3B82F6',
      preparing: '#8B5CF6',
      ready: '#10B981',
      delivered: '#059669',
      cancelled: '#EF4444',
      active: '#10B981',
      inactive: '#6B7280',
    };
    return statusColors[status] || '#6B7280';
  }

  static formatCurrency(amount: number, currencyCode = 'EUR'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  }

  static formatNumber(number: number): string {
    return new Intl.NumberFormat('fr-FR').format(number);
  }
}