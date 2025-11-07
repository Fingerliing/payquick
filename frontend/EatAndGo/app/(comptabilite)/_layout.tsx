import { Stack } from 'expo-router';

export default function ComptabiliteLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Comptabilité' }} />
      <Stack.Screen name="settings" options={{ title: 'Paramètres' }} />
      <Stack.Screen name="recaps" options={{ title: 'Récaps TVA' }} />
      <Stack.Screen name="exports" options={{ title: 'Exports' }} />
    </Stack>
  );
}