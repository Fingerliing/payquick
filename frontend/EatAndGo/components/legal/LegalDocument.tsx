import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BORDER_RADIUS, SHADOWS, TYPOGRAPHY } from '@/utils/designSystem';

interface Subsection {
  title: string;
  content: string;
  bulletPoints?: string[];
}

interface Section {
  title: string;
  content?: string;
  subsections?: Subsection[];
  bulletPoints?: string[];
}

interface LegalDocumentProps {
  title: string;
  lastUpdate: string;
  sections: Section[];
  showAcceptButton?: boolean;
  onAccept?: () => void;
  acceptButtonText?: string;
}

export function LegalDocument({
  title,
  lastUpdate,
  sections,
  showAcceptButton = false,
  onAccept,
  acceptButtonText = "J'ai lu et j'accepte",
}: LegalDocumentProps) {
  const router = useRouter();

  const handleAcceptPress = () => {
    if (onAccept) {
      onAccept();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.date}>Dernière mise à jour : {lastUpdate}</Text>

          {sections.map((section, index) => (
            <View key={index} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              
              {/* Contenu principal de la section */}
              {section.content && (
                <Text style={styles.paragraph}>{section.content}</Text>
              )}

              {/* BulletPoints de la section */}
              {section.bulletPoints && section.bulletPoints.length > 0 && (
                <View style={styles.bulletPointsContainer}>
                  {section.bulletPoints.map((point, bulletIndex) => (
                    <View key={bulletIndex} style={styles.bulletPointRow}>
                      <Text style={styles.bulletPoint}>•</Text>
                      <Text style={styles.bulletPointText}>{point}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Subsections */}
              {section.subsections && section.subsections.map((subsection, subIndex) => (
                <View key={subIndex} style={styles.subsection}>
                  <Text style={styles.subsectionTitle}>{subsection.title}</Text>
                  <Text style={styles.paragraph}>{subsection.content}</Text>
                  
                  {/* BulletPoints de la subsection */}
                  {subsection.bulletPoints && subsection.bulletPoints.length > 0 && (
                    <View style={styles.bulletPointsContainer}>
                      {subsection.bulletPoints.map((point, bulletIndex) => (
                        <View key={bulletIndex} style={styles.bulletPointRow}>
                          <Text style={styles.bulletPoint}>•</Text>
                          <Text style={styles.bulletPointText}>{point}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

          {/* Spacer pour le footer */}
          {showAcceptButton && <View style={styles.bottomSpacer} />}
        </View>
      </ScrollView>

      {/* Bouton d'acceptation - toujours actif */}
      {showAcceptButton && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAcceptPress}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={COLORS.text.inverse}
            />
            <Text style={styles.acceptButtonText}>
              {acceptButtonText}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
    ...SHADOWS.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  subsection: {
    marginTop: 16,
    marginLeft: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: COLORS.text.secondary,
    lineHeight: 24,
  },
  bulletPointsContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  bulletPointRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 15,
    color: COLORS.text.secondary,
    marginRight: 8,
    lineHeight: 24,
  },
  bulletPointText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text.secondary,
    lineHeight: 24,
  },
  bottomSpacer: {
    height: 40,
  },
  footer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    ...SHADOWS.lg,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: BORDER_RADIUS.xl,
    gap: 8,
    ...SHADOWS.button,
  },
  acceptButtonText: {
    color: COLORS.text.inverse,
    fontSize: 16,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});