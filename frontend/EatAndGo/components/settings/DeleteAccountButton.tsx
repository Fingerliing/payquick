// components/settings/DeleteAccountButton.tsx
import React from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { legalService } from '@/services/legalService';
import { useAuth } from '@/contexts/AuthContext';

export function DeleteAccountButton() {
  const { logout } = useAuth();

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible après 30 jours.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await legalService.requestAccountDeletion(
                'Je souhaite supprimer mon compte'
              );
              
              Alert.alert(
                'Demande enregistrée',
                result.message + '\n\nVous avez 30 jours pour annuler cette demande.',
                [
                  {
                    text: 'OK',
                    onPress: () => logout(),
                  },
                ]
              );
            } catch (error) {
              Alert.alert(
                'Erreur',
                'Impossible de traiter votre demande. Veuillez réessayer.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handleDeleteAccount}
      style={{
        backgroundColor: '#FEE2E2',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FCA5A5',
      }}
    >
      <Text style={{ color: '#DC2626', fontWeight: '600', textAlign: 'center' }}>
        Supprimer mon compte
      </Text>
    </TouchableOpacity>
  );
}