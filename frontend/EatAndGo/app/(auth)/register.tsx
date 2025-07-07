import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function RegisterScreen() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return false;
    }

    if (formData.password.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères');
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      const { confirmPassword, ...registerData } = formData;
      await register(registerData);
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Erreur d\'inscription', error.message || 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  };

  const titleStyle: TextStyle = {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  };

  const linkStyle: TextStyle = {
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
  };

  return (
    <KeyboardAvoidingView 
      style={containerStyle} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={contentStyle}>
        <Card>
          <Text style={titleStyle}>Créer un compte</Text>
          <Text style={subtitleStyle}>Rejoignez PayQuick aujourd'hui</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Input
              label="Prénom *"
              placeholder="John"
              value={formData.firstName}
              onChangeText={(value) => updateField('firstName', value)}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Input
              label="Nom *"
              placeholder="Doe"
              value={formData.lastName}
              onChangeText={(value) => updateField('lastName', value)}
              style={{ flex: 1, marginLeft: 8 }}
            />
          </View>

          <Input
            label="Email *"
            placeholder="votre@email.com"
            value={formData.email}
            onChangeText={(value) => updateField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
          />

          <Input
            label="Téléphone"
            placeholder="+33 6 12 34 56 78"
            value={formData.phone}
            onChangeText={(value) => updateField('phone', value)}
            keyboardType="phone-pad"
            leftIcon="call-outline"
          />

          <Input
            label="Mot de passe *"
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(value) => updateField('password', value)}
            secureTextEntry
            leftIcon="lock-closed-outline"
          />

          <Input
            label="Confirmer le mot de passe *"
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChangeText={(value) => updateField('confirmPassword', value)}
            secureTextEntry
            leftIcon="lock-closed-outline"
          />

          <Button
            title="S'inscrire"
            onPress={handleRegister}
            loading={isLoading}
            fullWidth
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={linkStyle}>Déjà un compte ? Se connecter</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}