import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
}

interface UseLocationReturn {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
  getCurrentLocation: () => Promise<void>;
  getAddressFromCoordinates: (lat: number, lng: number) => Promise<string>;
}

export const useLocation = (): UseLocationReturn => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermissions = async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Permission de géolocalisation refusée');
      return false;
    }
    return true;
  };

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      setError(null);

      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      const locationData = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
      });

      const address = reverseGeocode[0];
      setLocation({
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
        address: address ? `${address.street || ''} ${address.streetNumber || ''}`.trim() : undefined,
        city: address?.city || undefined,
        country: address?.country || undefined,
      });
    } catch (err) {
      setError('Impossible de récupérer votre position');
      console.error('Location error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAddressFromCoordinates = async (lat: number, lng: number): Promise<string> => {
    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      const address = reverseGeocode[0];
      if (!address) return 'Adresse inconnue';

      return [
        address.street,
        address.streetNumber,
        address.city,
        address.country,
      ].filter(Boolean).join(', ');
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      return 'Adresse inconnue';
    }
  };

  return {
    location,
    loading,
    error,
    getCurrentLocation,
    getAddressFromCoordinates,
  };
};