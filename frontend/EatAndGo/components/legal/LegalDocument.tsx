import React from 'react';
import { 
  ScrollView, 
  Text, 
  View, 
  StyleSheet,
  TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/ui/Header';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface Section {
  title: string;
  content?: string;
  subsections?: Subsection[];
}

interface Subsection {
  title: string;
  content: string;
  bulletPoints?: string[];
}

interface LegalDocumentProps {
  title: string;
  lastUpdate: string;
  sections: Section[];
  showAcceptButton?: boolean;
  onAccept?: () => void;
}

export const LegalDocument: React.FC<LegalDocumentProps> = ({
  title,
  lastUpdate,
  sections,
  showAcceptButton = false,
  onAccept,
}) => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Header 
        title={title}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.mainTitle}>{title}</Text>
          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.date}>
              Dernière mise à jour : {lastUpdate}
            </Text>
          </View>
        </View>

        {/* Sections */}
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {index + 1}. {section.title}
            </Text>
            
            {section.content && (
              <Text style={styles.paragraph}>{section.content}</Text>
            )}

            {section.subsections?.map((subsection, subIndex) => (
              <View key={subIndex} style={styles.subsection}>
                <Text style={styles.subsectionTitle}>
                  {index + 1}.{subIndex + 1} {subsection.title}
                </Text>
                <Text style={styles.paragraph}>{subsection.content}</Text>
                
                {subsection.bulletPoints?.map((point, pointIndex) => (
                  <View key={pointIndex} style={styles.bulletContainer}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{point}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        {/* Contact box */}
        <View style={styles.contactBox}>
          <View style={styles.contactHeader}>
            <Ionicons name="mail-outline" size={24} color="#1E40AF" />
            <Text style={styles.contactTitle}>Contact</Text>
          </View>
          <Text style={styles.contactText}>
            Pour toute question concernant ce document :
          </Text>
          <TouchableOpacity style={styles.contactItem}>
            <Ionicons name="mail" size={16} color="#1E40AF" />
            <Text style={styles.contactLink}>support@eatandgo.com</Text>
          </TouchableOpacity>
          <View style={styles.contactItem}>
            <Ionicons name="location" size={16} color="#1E40AF" />
            <Text style={styles.contactText}>[Votre adresse]</Text>
          </View>
        </View>

        {/* Bouton Accepter (optionnel) */}
        {showAcceptButton && (
          <TouchableOpacity 
            style={styles.acceptButton}
            onPress={onAccept}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
            <Text style={styles.acceptButtonText}>J'ai lu et j'accepte</Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  subsection: {
    marginTop: 16,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 15,
    color: '#1E40AF',
    marginRight: 8,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  contactBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E40AF',
  },
  contactText: {
    fontSize: 15,
    color: '#4B5563',
    marginBottom: 8,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  contactLink: {
    fontSize: 15,
    color: '#1E40AF',
    fontWeight: '500',
  },
  acceptButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomPadding: {
    height: 40,
  },
});