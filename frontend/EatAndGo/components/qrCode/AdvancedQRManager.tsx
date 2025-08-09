import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { 
  advancedQRFeatures, 
  QRBatch, 
  QRTemplate 
} from '@/utils/advancedQRFeatures';
import { Restaurant } from '@/types/restaurant';
import { tableService } from '@/services/tableService';

export default function AdvancedQRManager() {
  const { restaurants, createTables } = useRestaurant();
  
  // États principaux
  const [batches, setBatches] = useState<QRBatch[]>([]);
  const [templates, setTemplates] = useState<QRTemplate[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  // Configuration de création
  const [createConfig, setCreateConfig] = useState({
    tableCount: 5,
    startNumber: 1,
    capacity: 4,
    template: 'classic',
    includeInstructions: true,
    customFooter: '',
  });

  // Statistiques
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const loadedBatches = await advancedQRFeatures.loadBatchesFromStorage();
      const availableTemplates = advancedQRFeatures.getAllTemplates();
      const statistics = advancedQRFeatures.getBatchStatistics();
      
      setBatches(loadedBatches);
      setTemplates(availableTemplates);
      setStats(statistics);
      
      console.log('📊 Loaded data:', { 
        batches: loadedBatches.length, 
        templates: availableTemplates.length,
        stats: statistics 
      });
    } catch (error) {
      console.error('❌ Error loading data:', error);
    }
  };

  const handleCreateBatch = async () => {
    if (!selectedRestaurant) {
      Alert.alert('Erreur', 'Veuillez sélectionner un restaurant');
      return;
    }
  
    setIsCreating(true);
    try {
      const restaurant = restaurants.find(r => r.id === selectedRestaurant);
      if (!restaurant) {
        throw new Error('Restaurant non trouvé');
      }
  
      console.log('🚀 Creating advanced batch...', createConfig);
  
      // Utiliser directement le service avec la capacité configurée
      const tables = await tableService.createTables(
        selectedRestaurant,
        createConfig.tableCount,
        createConfig.startNumber,
        createConfig.capacity
      );
  
      // Créer le batch - maintenant les types sont compatibles
      const batch: QRBatch = {
        id: `batch_${Date.now()}`,
        restaurantId: selectedRestaurant,
        restaurantName: restaurant.name,
        tables: tables, // Plus de problème de type !
        createdAt: new Date(),
        totalTables: tables.length
      };
  
      setBatches(prev => [batch, ...prev]);
      setShowCreateModal(false);
      
      // Mettre à jour les stats
      const newStats = advancedQRFeatures.getBatchStatistics();
      setStats(newStats);
  
      Alert.alert(
        'Succès',
        `Lot de ${batch.totalTables} tables créé avec succès !`,
        [
          { text: 'OK' },
          { 
            text: 'Exporter PDF', 
            onPress: () => handleExportBatch(batch.id, 'pdf') 
          }
        ]
      );
  
    } catch (error: any) {
      console.error('❌ Error creating batch:', error);
      Alert.alert('Erreur', error.message || 'Erreur lors de la création du lot');
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportBatch = async (batchId: string, format: 'pdf' | 'images' | 'json') => {
    try {
      const batch = batches.find(b => b.id === batchId);
      if (!batch) {
        Alert.alert('Erreur', 'Lot non trouvé');
        return;
      }

      const restaurant = restaurants.find(r => r.id === batch.restaurantId);
      if (!restaurant) {
        Alert.alert('Erreur', 'Restaurant non trouvé');
        return;
      }

      console.log('📤 Exporting batch...', { batchId, format });

      const selectedTemplate = templates.find(t => t.id === createConfig.template) || templates[0];
      
      const fileUri = await advancedQRFeatures.exportQRBatch(
        batch,
        restaurant,
        format,
        selectedTemplate
      );

      Alert.alert(
        'Export terminé',
        `Le fichier a été généré avec succès.`,
        [
          { text: 'OK' },
          { 
            text: 'Partager', 
            onPress: () => advancedQRFeatures.shareBatch(batchId, format as 'pdf' | 'json') 
          }
        ]
      );

    } catch (error: any) {
      console.error('❌ Export error:', error);
      Alert.alert('Erreur', error.message || 'Erreur lors de l\'export');
    }
  };

  const handleDeleteBatch = (batchId: string) => {
    Alert.alert(
      'Supprimer le lot',
      'Êtes-vous sûr de vouloir supprimer ce lot ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setBatches(prev => prev.filter(b => b.id !== batchId));
            Alert.alert('Succès', 'Lot supprimé');
          }
        }
      ]
    );
  };

  const renderBatchCard = (batch: QRBatch) => (
    <Card key={batch.id} style={{ marginBottom: 16 }}>
      <View style={{ padding: 16 }}>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 4,
            }}>
              {batch.restaurantName}
            </Text>
            <Text style={{
              fontSize: 14,
              color: '#6B7280',
              marginBottom: 8,
            }}>
              {batch.totalTables} tables • {new Date(batch.createdAt).toLocaleDateString('fr-FR')}
            </Text>
          </View>
          
          <View style={{
            backgroundColor: '#059669',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
          }}>
            <Text style={{
              fontSize: 12,
              color: '#FFFFFF',
              fontWeight: '600',
            }}>
              {batch.totalTables} tables
            </Text>
          </View>
        </View>

        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleExportBatch(batch.id, 'pdf')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#EBF8FF',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
              }}
            >
              <Ionicons name="document-text-outline" size={16} color="#3B82F6" />
              <Text style={{
                fontSize: 12,
                color: '#3B82F6',
                fontWeight: '500',
                marginLeft: 4,
              }}>
                PDF
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleExportBatch(batch.id, 'json')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F0FDF4',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
              }}
            >
              <Ionicons name="code-outline" size={16} color="#059669" />
              <Text style={{
                fontSize: 12,
                color: '#059669',
                fontWeight: '500',
                marginLeft: 4,
              }}>
                JSON
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => handleDeleteBatch(batch.id)}
            style={{
              padding: 8,
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );

  const renderCreateModal = () => (
    <Modal
      visible={showCreateModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header
          title="Créer un lot avancé"
          leftIcon="close-outline"
          onLeftPress={() => setShowCreateModal(false)}
        />

        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Sélection restaurant */}
          <Card style={{ marginBottom: 16 }}>
            <View style={{ padding: 16 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 12,
              }}>
                Restaurant
              </Text>
              
              {restaurants.map((restaurant: Restaurant) => (
                <TouchableOpacity
                  key={restaurant.id}
                  onPress={() => setSelectedRestaurant(restaurant.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    backgroundColor: selectedRestaurant === restaurant.id ? '#EBF8FF' : '#F9FAFB',
                    borderRadius: 8,
                    marginBottom: 8,
                    borderWidth: selectedRestaurant === restaurant.id ? 2 : 1,
                    borderColor: selectedRestaurant === restaurant.id ? '#3B82F6' : '#E5E7EB',
                  }}
                >
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#059669',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12,
                  }}>
                    <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: '#111827',
                    }}>
                      {restaurant.name}
                    </Text>
                    <Text style={{
                      fontSize: 12,
                      color: '#6B7280',
                    }}>
                      {restaurant.city}
                    </Text>
                  </View>
                  {selectedRestaurant === restaurant.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Configuration */}
          <Card style={{ marginBottom: 16 }}>
            <View style={{ padding: 16 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 12,
              }}>
                Configuration
              </Text>

              {/* Nombre de tables */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: 8,
                }}>
                  Nombre de tables ({createConfig.tableCount})
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F3F4F6',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  height: 44,
                }}>
                  <TouchableOpacity
                    onPress={() => setCreateConfig(prev => ({
                      ...prev,
                      tableCount: Math.max(1, prev.tableCount - 1)
                    }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#FFFFFF',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="remove-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                  <Text style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '600',
                    color: '#111827',
                  }}>
                    {createConfig.tableCount}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCreateConfig(prev => ({
                      ...prev,
                      tableCount: Math.min(50, prev.tableCount + 1)
                    }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#FFFFFF',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="add-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Numéro de départ */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: 8,
                }}>
                  Numéro de départ
                </Text>
                <TextInput
                  value={String(createConfig.startNumber)}
                  onChangeText={(text) => setCreateConfig(prev => ({
                    ...prev,
                    startNumber: parseInt(text) || 1
                  }))}
                  keyboardType="numeric"
                  style={{
                    backgroundColor: '#F3F4F6',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 44,
                    fontSize: 16,
                    color: '#111827',
                  }}
                />
              </View>

              {/* Capacité */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: 8,
                }}>
                  Capacité par table
                </Text>
                <TextInput
                  value={String(createConfig.capacity)}
                  onChangeText={(text) => setCreateConfig(prev => ({
                    ...prev,
                    capacity: parseInt(text) || 4
                  }))}
                  keyboardType="numeric"
                  style={{
                    backgroundColor: '#F3F4F6',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 44,
                    fontSize: 16,
                    color: '#111827',
                  }}
                />
              </View>

              {/* Template */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: 8,
                }}>
                  Template de design
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {templates.map((template) => (
                    <TouchableOpacity
                      key={template.id}
                      onPress={() => setCreateConfig(prev => ({ ...prev, template: template.id }))}
                      style={{
                        flex: 1,
                        padding: 12,
                        backgroundColor: createConfig.template === template.id ? '#EBF8FF' : '#F9FAFB',
                        borderRadius: 8,
                        borderWidth: createConfig.template === template.id ? 2 : 1,
                        borderColor: createConfig.template === template.id ? '#3B82F6' : '#E5E7EB',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: template.colors.primary,
                        marginBottom: 4,
                      }} />
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '500',
                        color: createConfig.template === template.id ? '#3B82F6' : '#6B7280',
                      }}>
                        {template.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Options */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                }}>
                  Inclure les instructions
                </Text>
                <Switch
                  value={createConfig.includeInstructions}
                  onValueChange={(value) => setCreateConfig(prev => ({
                    ...prev,
                    includeInstructions: value
                  }))}
                />
              </View>

              {/* Footer personnalisé */}
              <View>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: 8,
                }}>
                  Footer personnalisé (optionnel)
                </Text>
                <TextInput
                  value={createConfig.customFooter}
                  onChangeText={(text) => setCreateConfig(prev => ({
                    ...prev,
                    customFooter: text
                  }))}
                  placeholder="Ex: Contactez-nous au 01 23 45 67 89"
                  style={{
                    backgroundColor: '#F3F4F6',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 44,
                    fontSize: 14,
                    color: '#111827',
                  }}
                />
              </View>
            </View>
          </Card>

          <Button
            title={isCreating ? "Création en cours..." : "Créer le lot"}
            onPress={handleCreateBatch}
            loading={isCreating}
            disabled={!selectedRestaurant}
            variant="primary"
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );

  const renderStatsModal = () => (
    <Modal
      visible={showStatsModal}
      animationType="fade"
      transparent={true}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 350,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 20,
          }}>
            <Ionicons name="stats-chart-outline" size={24} color="#059669" />
            <Text style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#111827',
              marginLeft: 8,
            }}>
              Statistiques
            </Text>
          </View>

          {stats && (
            <View style={{ gap: 16 }}>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>Lots créés</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
                  {stats.totalBatches}
                </Text>
              </View>

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>Total tables</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
                  {stats.totalTables}
                </Text>
              </View>

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 14, color: '#6B7280' }}>Moyenne par lot</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
                  {stats.averageTablesPerBatch}
                </Text>
              </View>

              {stats.newestBatch && (
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 14, color: '#6B7280' }}>Dernier lot</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    {new Date(stats.newestBatch).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Button
            title="Fermer"
            onPress={() => setShowStatsModal(false)}
            variant="secondary"
            style={{ marginTop: 20 }}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header
        title="Gestionnaire QR Avancé"
        rightIcon="add-outline"
        onRightPress={() => setShowCreateModal(true)}
      />

      <ScrollView style={{ flex: 1 }}>
        {/* Actions rapides */}
        <View style={{
          flexDirection: 'row',
          padding: 16,
          gap: 12,
        }}>
          <Button
            title="Nouveau lot"
            onPress={() => setShowCreateModal(true)}
            variant="primary"
            style={{ flex: 1 }}
          />
          
          <TouchableOpacity
            onPress={() => setShowStatsModal(true)}
            style={{
              backgroundColor: '#F3F4F6',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="stats-chart-outline" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Liste des lots */}
        <View style={{ padding: 16 }}>
          <Text style={{
            fontSize: 18,
            fontWeight: '600',
            color: '#111827',
            marginBottom: 16,
          }}>
            Lots créés ({batches.length})
          </Text>

          {batches.length === 0 ? (
            <Card>
              <View style={{
                alignItems: 'center',
                padding: 40,
              }}>
                <Ionicons name="qr-code-outline" size={64} color="#D1D5DB" />
                <Text style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: '#111827',
                  marginTop: 16,
                  marginBottom: 8,
                  textAlign: 'center',
                }}>
                  Aucun lot créé
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  textAlign: 'center',
                  marginBottom: 20,
                }}>
                  Créez votre premier lot de QR codes avec des templates personnalisés
                </Text>
                <Button
                  title="Créer un lot"
                  onPress={() => setShowCreateModal(true)}
                  variant="primary"
                />
              </View>
            </Card>
          ) : (
            batches.map(renderBatchCard)
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      {renderCreateModal()}
      {renderStatsModal()}
    </View>
  );
}