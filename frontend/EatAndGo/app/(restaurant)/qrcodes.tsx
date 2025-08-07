import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Dimensions,
  RefreshControl,
  Modal,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Table } from '@/types/table';
import { Restaurant } from '@/types/restaurant';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '@/constants/config';

const { width } = Dimensions.get('window');

export default function QRCodesScreen() {
  const { 
    restaurants, 
    createTables, 
    loadRestaurantTables, 
    isLoading,
    error 
  } = useRestaurant();

  const [selectedRestaurant, setSelectedRestaurant] = useState('');
  const [tableCount, setTableCount] = useState(5);
  const [startNumber, setStartNumber] = useState(1);
  const [generatedTables, setGeneratedTables] = useState<Table[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const [previewTable, setPreviewTable] = useState<Table | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (restaurants.length === 1) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [restaurants]);

  const selectedRestaurantData = restaurants.find((r: Restaurant) => r.id === selectedRestaurant);

  const handleGenerateTables = async () => {
    if (!selectedRestaurant) {
      Alert.alert('Erreur', 'Veuillez sélectionner un restaurant');
      return;
    }

    setIsGenerating(true);
    try {
      const tables = await createTables(selectedRestaurant, tableCount, startNumber);
      setGeneratedTables(tables);
      Alert.alert(
        'Succès', 
        `${tables.length} tables créées avec succès !`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Erreur lors de la génération des tables:', error);
      Alert.alert(
        'Erreur', 
        error.message || 'Erreur lors de la génération des QR codes'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareTable = async (table: Table) => {
    try {
      const message = `Table ${table.number} - ${selectedRestaurantData?.name}\n\nCode manuel: ${table.manualCode}\nOu scannez ce QR code pour accéder au menu !\n\n${table.qrCodeUrl}`;
      
      await Share.share({
        message,
        title: `QR Code - Table ${table.number}`,
      });
    } catch (error) {
      console.error('Erreur partage:', error);
    }
  };

  const generatePrintHTML = (tables: Table[]) => {
    const tablesHTML = tables.map(table => `
      <div style="
        page-break-inside: avoid;
        text-align: center;
        margin-bottom: 40px;
        padding: 20px;
        border: 2px solid #000;
        border-radius: 10px;
        background: white;
        width: 250px;
        margin: 20px auto;
      ">
        <div style="
          font-size: 24px;
          font-weight: bold;
          color: #059669;
          margin-bottom: 10px;
        ">Eat&Go</div>
        
        <div style="
          font-size: 18px;
          font-weight: bold;
          margin: 10px 0;
        ">Table ${table.number}</div>
        
        <div style="
          width: 150px;
          height: 150px;
          margin: 15px auto;
          border: 1px solid #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f9f9f9;
          font-size: 12px;
        ">
          QR CODE<br/>${table.identifiant}
        </div>
        
        <div style="
          font-size: 14px;
          color: #666;
          margin-top: 15px;
          padding: 10px;
          background: #f3f4f6;
          border-radius: 5px;
        ">
          <strong>Code manuel :</strong><br/>
          <span style="font-family: monospace; font-size: 16px; font-weight: bold;">${table.manualCode}</span>
        </div>
        
        <div style="
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        ">
          Scannez le QR code ou saisissez le code manuel
        </div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>QR Codes - ${selectedRestaurantData?.name}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: white;
            }
            @media print {
              body { padding: 10px; }
              .table-page { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          <h1 style="text-align: center; color: #059669; margin-bottom: 30px;">
            QR Codes - ${selectedRestaurantData?.name}
          </h1>
          ${tablesHTML}
        </body>
      </html>
    `;
  };

  const handlePrintAll = async () => {
    if (generatedTables.length === 0) return;

    try {
      const html = generatePrintHTML(generatedTables);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Impossible de générer le PDF');
    }
  };

  const handlePrintSingle = async (table: Table) => {
    try {
      const html = generatePrintHTML([table]);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Impossible de générer le PDF');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (selectedRestaurant) {
        await loadRestaurantTables(selectedRestaurant);
      }
    } catch (error) {
      console.error('Erreur rafraîchissement:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const renderRestaurantPicker = () => (
    <Modal
      visible={showRestaurantPicker}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title="Choisir un restaurant"
          leftIcon="close-outline"
          onLeftPress={() => setShowRestaurantPicker(false)}
        />
        <ScrollView style={{ flex: 1 }}>
          {restaurants.map((restaurant: Restaurant) => (
            <TouchableOpacity
              key={restaurant.id}
              onPress={() => {
                setSelectedRestaurant(restaurant.id);
                setShowRestaurantPicker(false);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}
            >
              <View style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: COLORS.primary || '#3B82F6',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 12,
              }}>
                <Ionicons name="restaurant-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 4,
                }}>
                  {restaurant.name}
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                }}>
                  {restaurant.address}, {restaurant.city}
                </Text>
              </View>
              {selectedRestaurant === restaurant.id && (
                <Ionicons name="checkmark-outline" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderTableCard = (table: Table) => (
    <Card key={table.id} style={{ marginBottom: 16 }}>
      <View style={{ alignItems: 'center', padding: 16 }}>
        <Text style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: '#059669',
          marginBottom: 8,
        }}>
          Eat&Go
        </Text>
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          marginBottom: 16,
        }}>
          Table {table.number}
        </Text>
        
        <View style={{ marginBottom: 16 }}>
          <QRCode
            value={table.qrCodeUrl}
            size={120}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        </View>
        
        <View style={{
          backgroundColor: '#F3F4F6',
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}>
          <Text style={{
            fontSize: 12,
            color: '#6B7280',
            fontWeight: '500',
            marginBottom: 4,
          }}>
            Code manuel
          </Text>
          <Text style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#111827',
            fontFamily: 'monospace',
          }}>
            {table.manualCode}
          </Text>
        </View>
        
        <Text style={{
          fontSize: 12,
          color: '#9CA3AF',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          Scannez le QR code ou saisissez le code manuel
        </Text>
        
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-around', 
          width: '100%',
          gap: 8,
        }}>
          <Button
            title="Aperçu"
            onPress={() => setPreviewTable(table)}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
          />
          
          <Button
            title="Partager"
            onPress={() => handleShareTable(table)}
            variant="secondary"
            size="small"
            style={{ flex: 1 }}
          />
          
          <Button
            title="Imprimer"
            onPress={() => handlePrintSingle(table)}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Card>
  );

  const renderPreviewModal = () => (
    <Modal
      visible={!!previewTable}
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
        {previewTable && (
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: 24,
            alignItems: 'center',
            maxWidth: 300,
            width: '100%',
          }}>
            <Text style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: '#059669',
              marginBottom: 8,
            }}>
              Eat&Go
            </Text>
            <Text style={{
              fontSize: 20,
              fontWeight: '600',
              marginBottom: 16,
            }}>
              Table {previewTable.number}
            </Text>
            
            <View style={{ marginBottom: 16 }}>
              <QRCode
                value={previewTable.qrCodeUrl}
                size={150}
                backgroundColor="#FFFFFF"
                color="#000000"
              />
            </View>
            
            <View style={{
              backgroundColor: '#F3F4F6',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 12,
                color: '#6B7280',
                fontWeight: '500',
                marginBottom: 4,
              }}>
                Code manuel
              </Text>
              <Text style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: '#111827',
                fontFamily: 'monospace',
              }}>
                {previewTable.manualCode}
              </Text>
            </View>
            
            <Text style={{
              fontSize: 12,
              color: '#9CA3AF',
              textAlign: 'center',
              marginBottom: 20,
            }}>
              Scannez le QR code ou saisissez le code manuel
            </Text>
            
            <Button
              title="Fermer"
              onPress={() => setPreviewTable(null)}
              variant="secondary"
            />
          </View>
        )}
      </View>
    </Modal>
  );

  if (isLoading && restaurants.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="QR Codes Tables" />
        <Loading fullScreen text="Chargement..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="QR Codes Tables"
        rightIcon="settings-outline"
        onRightPress={() => setShowSettings(!showSettings)}
      />
      
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Configuration */}
        <Card style={{ margin: 16 }}>
          <View style={{ padding: 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Ionicons name="qr-code-outline" size={24} color="#059669" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#111827',
                marginLeft: 8,
              }}>
                Générateur de QR Codes
              </Text>
            </View>
            
            <Text style={{
              fontSize: 14,
              color: '#6B7280',
              marginBottom: 20,
              lineHeight: 20,
            }}>
              Créez des QR codes pour vos tables et permettez à vos clients de scanner ou saisir un code manuel pour accéder au menu.
            </Text>

            {/* Sélection du restaurant */}
            <TouchableOpacity
              onPress={() => setShowRestaurantPicker(true)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                backgroundColor: '#F3F4F6',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <View>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 2,
                }}>
                  Restaurant
                </Text>
                <Text style={{
                  fontSize: 16,
                  color: '#111827',
                  fontWeight: '500',
                }}>
                  {selectedRestaurantData?.name || 'Sélectionner un restaurant'}
                </Text>
              </View>
              <Ionicons name="chevron-down-outline" size={20} color="#6B7280" />
            </TouchableOpacity>

            {/* Configuration du nombre de tables */}
            <View style={{
              flexDirection: 'row',
              marginBottom: 16,
              gap: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginBottom: 8,
                  fontWeight: '500',
                }}>
                  Nombre de tables
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
                    onPress={() => setTableCount(Math.max(1, tableCount - 1))}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
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
                    {tableCount}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setTableCount(Math.min(50, tableCount + 1))}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: '#FFFFFF',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="add-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {showSettings && (
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 12,
                    color: '#6B7280',
                    marginBottom: 8,
                    fontWeight: '500',
                  }}>
                    Numéro de départ
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
                      onPress={() => setStartNumber(Math.max(1, startNumber - 1))}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
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
                      {startNumber}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setStartNumber(startNumber + 1)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#FFFFFF',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="add-outline" size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Boutons d'action */}
            <View style={{ gap: 12 }}>
              <Button
                title={isGenerating ? 'Génération...' : 'Générer les QR Codes'}
                onPress={handleGenerateTables}
                loading={isGenerating}
                disabled={!selectedRestaurant}
                variant="primary"
                fullWidth
              />

              {generatedTables.length > 0 && (
                <Button
                  title="Imprimer tout (PDF)"
                  onPress={handlePrintAll}
                  variant="secondary"
                  fullWidth
                />
              )}
            </View>
          </View>
        </Card>

        {/* Information du restaurant sélectionné */}
        {selectedRestaurantData && (
          <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
            }}>
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
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: 2,
                }}>
                  {selectedRestaurantData.name}
                </Text>
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                }}>
                  {selectedRestaurantData.address}, {selectedRestaurantData.city}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Liste des QR codes générés */}
        {generatedTables.length > 0 && (
          <View style={{ marginHorizontal: 16 }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#111827',
              }}>
                QR Codes générés ({generatedTables.length})
              </Text>
            </View>

            {generatedTables.map(renderTableCard)}
          </View>
        )}

        {/* Message d'aide */}
        {generatedTables.length === 0 && (
          <Card style={{ margin: 16 }}>
            <View style={{
              alignItems: 'center',
              padding: 32,
            }}>
              <Ionicons name="qr-code-outline" size={64} color="#D1D5DB" />
              <Text style={{
                fontSize: 18,
                fontWeight: '500',
                color: '#111827',
                marginTop: 16,
                marginBottom: 8,
                textAlign: 'center',
              }}>
                Aucun QR code généré
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#6B7280',
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: 24,
              }}>
                Sélectionnez un restaurant et spécifiez le nombre de tables pour commencer
              </Text>
              
              <View style={{
                backgroundColor: '#EBF8FF',
                padding: 16,
                borderRadius: 8,
                width: '100%',
              }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#1E40AF',
                  marginBottom: 8,
                }}>
                  Comment ça marche :
                </Text>
                <Text style={{
                  fontSize: 12,
                  color: '#1E40AF',
                  lineHeight: 18,
                }}>
                  • Choisissez votre restaurant{'\n'}
                  • Indiquez le nombre de tables{'\n'}
                  • Générez les QR codes{'\n'}
                  • Partagez ou imprimez{'\n'}
                  • Vos clients pourront scanner ou saisir le code manuel
                </Text>
              </View>
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Modals */}
      {renderRestaurantPicker()}
      {renderPreviewModal()}
    </View>
  );
}