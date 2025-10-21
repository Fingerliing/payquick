import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export function LegalFooter() {
  const router = useRouter();

  return (
    <View style={styles.footer}>
      <Text style={styles.copyright}>
        © 2025 EatQuicker. Tous droits réservés.
      </Text>
      
      <View style={styles.links}>
        <TouchableOpacity onPress={() => router.push('/(legal)/terms')}>
          <Text style={styles.link}>CGU</Text>
        </TouchableOpacity>
        
        <Text style={styles.separator}>•</Text>
        
        <TouchableOpacity onPress={() => router.push('/(legal)/privacy')}>
          <Text style={styles.link}>Confidentialité</Text>
        </TouchableOpacity>
        
        <Text style={styles.separator}>•</Text>
        
        <TouchableOpacity onPress={() => console.log('Mentions légales')}>
          <Text style={styles.link}>Mentions légales</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.version}>Version 1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  copyright: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  link: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '500',
  },
  separator: {
    fontSize: 14,
    color: '#9CA3AF',
    marginHorizontal: 12,
  },
  version: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
});