import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

interface UseImagePickerReturn {
  image: string | null;
  loading: boolean;
  pickFromLibrary: () => Promise<void>;
  pickFromCamera: () => Promise<void>;
  removeImage: () => void;
}

export const useImagePicker = (initialImage?: string): UseImagePickerReturn => {
  const [image, setImage] = useState<string | null>(initialImage || null);
  const [loading, setLoading] = useState(false);

  const pickFromLibrary = async () => {
    try {
      setLoading(true);
      
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Nous avons besoin de la permission pour accéder à vos photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sélectionner une image');
      console.error('Image picker error:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickFromCamera = async () => {
    try {
      setLoading(true);
      
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Nous avons besoin de la permission pour accéder à l\'appareil photo');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de prendre une photo');
      console.error('Camera error:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    setImage(null);
  };

  return {
    image,
    loading,
    pickFromLibrary,
    pickFromCamera,
    removeImage,
  };
};