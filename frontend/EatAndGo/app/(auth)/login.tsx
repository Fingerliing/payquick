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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    try {
      setIsLoading(true);
      await login({ email, password });
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Erreur de connexion', error.message || 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const contentStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
          <Text style={titleStyle}>PayQuick</Text>
          <Text style={subtitleStyle}>Connectez-vous à votre compte</Text>

          <Input
            label="Email"
            placeholder="votre@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
          />

          <Input
            label="Mot de passe"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            leftIcon="lock-closed-outline"
          />

          <Button
            title="Se connecter"
            onPress={handleLogin}
            loading={isLoading}
            fullWidth
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={linkStyle}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={linkStyle}>Pas encore de compte ? S'inscrire</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}