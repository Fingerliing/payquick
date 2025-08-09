import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { 
  qrMonitoring, 
  QRAnalytics, 
  SystemHealth 
} from '@/utils/qrMonitoring';

const { width } = Dimensions.get('window');

export default function MonitoringDashboard() {
  const [analytics, setAnalytics] = useState<QRAnalytics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoDetection, setAutoDetection] = useState<{
    issues: string[];
    solutions: string[];
    criticalCount: number;
  } | null>(null);

  // Auto-refresh toutes les 30 secondes quand l'écran est actif
  useFocusEffect(
    useCallback(() => {
      loadData();
      
      const interval = setInterval(() => {
        loadData();
      }, 30000);

      return () => clearInterval(interval);
    }, [])
  );

  const loadData = async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);

      // Charger les analytics
      const analyticsData = qrMonitoring.generateAnalytics();
      setAnalytics(analyticsData);

      // Vérifier la santé du système
      const healthData = await qrMonitoring.performHealthCheck();
      setHealth(healthData);

      // Auto-détection des problèmes
      const detectionData = await qrMonitoring.autoDetectIssues();
      setAutoDetection(detectionData);

      console.log('📊 Dashboard data loaded', {
        totalScans: analyticsData.totalScans,
        health: healthData.status,
        issues: detectionData.issues.length
      });

    } catch (error) {
      console.error('❌ Failed to load dashboard data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de monitoring');
    } finally {
      if (showRefresh) setIsRefreshing(false);
    }
  };

  const handleExportData = async (format: 'json' | 'csv') => {
    try {
      const fileUri = await qrMonitoring.exportMonitoringData(format);
      Alert.alert(
        'Export terminé',
        `Les données ont été exportées vers:\n${fileUri}`,
        [
          { text: 'OK' },
          { text: 'Partager', onPress: () => shareFile(fileUri) }
        ]
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'exporter les données');
    }
  };

  const shareFile = async (fileUri: string) => {
    try {
      // Utiliser le système de partage natif
      const { default: Share } = await import('react-native-share');
      await Share.open({ url: fileUri });
    } catch (error) {
      console.error('❌ Failed to share file:', error);
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'critical': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return 'checkmark-circle';
      case 'warning': return 'warning';
      case 'critical': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const renderMetricCard = (
    title: string,
    value: string | number,
    subtitle?: string,
    color = '#059669',
    icon?: string
  ) => (
    <View style={{
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: color,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 14,
            color: '#6B7280',
            fontWeight: '500',
            marginBottom: 4,
          }}>
            {title}
          </Text>
          <Text style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: '#111827',
            marginBottom: 2,
          }}>
            {value}
          </Text>
          {subtitle && (
            <Text style={{
              fontSize: 12,
              color: '#9CA3AF',
            }}>
              {subtitle}
            </Text>
          )}
        </View>
        {icon && (
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: `${color}15`,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name={icon as any} size={24} color={color} />
          </View>
        )}
      </View>
    </View>
  );

  const renderHealthStatus = () => {
    if (!health) return null;

    const statusColor = getHealthStatusColor(health.status);
    const statusIcon = getHealthStatusIcon(health.status);
    const statusText = {
      healthy: 'Système en bonne santé',
      warning: 'Attention requise',
      critical: 'Problème critique'
    }[health.status] || 'État inconnu';

    return (
      <Card style={{ marginBottom: 16 }}>
        <View style={{ padding: 16 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: `${statusColor}15`,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
            }}>
              <Ionicons name={statusIcon as any} size={24} color={statusColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 2,
              }}>
                État du système
              </Text>
              <Text style={{
                fontSize: 14,
                color: statusColor,
                fontWeight: '500',
              }}>
                {statusText}
              </Text>
            </View>
            <Text style={{
              fontSize: 12,
              color: '#6B7280',
            }}>
              {new Date(health.lastCheck).toLocaleTimeString('fr-FR')}
            </Text>
          </View>

          {health.issues.length > 0 && (
            <View>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 8,
              }}>
                Problèmes détectés ({health.issues.length})
              </Text>
              {health.issues.slice(0, 3).map((issue, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    backgroundColor: issue.severity === 'high' ? '#FEF2F2' : '#FFFBEB',
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <Ionicons
                    name={issue.severity === 'high' ? 'alert-circle' : 'warning'}
                    size={16}
                    color={issue.severity === 'high' ? '#EF4444' : '#F59E0B'}
                  />
                  <Text style={{
                    fontSize: 13,
                    color: '#111827',
                    marginLeft: 8,
                    flex: 1,
                  }}>
                    {issue.message}
                  </Text>
                  <View style={{
                    backgroundColor: issue.severity === 'high' ? '#FCA5A5' : '#FDE68A',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: issue.severity === 'high' ? '#7F1D1D' : '#92400E',
                    }}>
                      {issue.count}
                    </Text>
                  </View>
                </View>
              ))}
              {health.issues.length > 3 && (
                <Text style={{
                  fontSize: 12,
                  color: '#6B7280',
                  textAlign: 'center',
                  marginTop: 8,
                }}>
                  +{health.issues.length - 3} autres problèmes
                </Text>
              )}
            </View>
          )}

          {health.recommendations.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 8,
              }}>
                Recommandations
              </Text>
              {health.recommendations.slice(0, 2).map((rec, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    color: '#059669',
                    marginRight: 4,
                  }}>
                    •
                  </Text>
                  <Text style={{
                    fontSize: 12,
                    color: '#374151',
                    flex: 1,
                    lineHeight: 16,
                  }}>
                    {rec}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Card>
    );
  };

  const renderAutoDetection = () => {
    if (!autoDetection) return null;

    return (
      <Card style={{ marginBottom: 16 }}>
        <View style={{ padding: 16 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <Ionicons name="search-outline" size={24} color="#3B82F6" />
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              marginLeft: 8,
            }}>
              Détection automatique
            </Text>
            {autoDetection.criticalCount > 0 && (
              <View style={{
                backgroundColor: '#EF4444',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                marginLeft: 'auto',
              }}>
                <Text style={{
                  fontSize: 12,
                  color: '#FFFFFF',
                  fontWeight: '600',
                }}>
                  {autoDetection.criticalCount} critique{autoDetection.criticalCount > 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          {autoDetection.issues.length > 0 ? (
            <View>
              <Text style={{
                fontSize: 14,
                fontWeight: '500',
                color: '#6B7280',
                marginBottom: 8,
              }}>
                Problèmes identifiés:
              </Text>
              {autoDetection.issues.map((issue, index) => (
                <Text
                  key={index}
                  style={{
                    fontSize: 13,
                    color: '#EF4444',
                    marginBottom: 4,
                    paddingLeft: 8,
                  }}
                >
                  • {issue}
                </Text>
              ))}

              {autoDetection.solutions.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: '#059669',
                    marginBottom: 8,
                  }}>
                    Solutions suggérées:
                  </Text>
                  {autoDetection.solutions.map((solution, index) => (
                    <Text
                      key={index}
                      style={{
                        fontSize: 13,
                        color: '#047857',
                        marginBottom: 4,
                        paddingLeft: 8,
                      }}
                    >
                      • {solution}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={{
              alignItems: 'center',
              paddingVertical: 20,
            }}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={{
                fontSize: 16,
                fontWeight: '500',
                color: '#10B981',
                marginTop: 8,
              }}>
                Aucun problème détecté
              </Text>
            </View>
          )}
        </View>
      </Card>
    );
  };

  const renderAnalytics = () => {
    if (!analytics) return null;

    return (
      <View>
        {/* Métriques principales */}
        <View style={{
          flexDirection: 'row',
          marginBottom: 16,
          gap: 12,
        }}>
          <View style={{ flex: 1 }}>
            {renderMetricCard(
              'Total Scans',
              analytics.totalScans,
              'Toutes méthodes',
              '#059669',
              'qr-code-outline'
            )}
          </View>
          <View style={{ flex: 1 }}>
            {renderMetricCard(
              'Taux de succès',
              `${(analytics.successRate * 100).toFixed(1)}%`,
              `${analytics.successfulScans}/${analytics.totalScans}`,
              analytics.successRate > 0.8 ? '#10B981' : '#F59E0B',
              'checkmark-circle-outline'
            )}
          </View>
        </View>

        {/* Méthodes de scan */}
        <Card style={{ marginBottom: 16 }}>
          <View style={{ padding: 16 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 12,
            }}>
              Méthodes de scan
            </Text>
            
            <View style={{
              flexDirection: 'row',
              marginBottom: 12,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  marginBottom: 4,
                }}>
                  QR Code
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}>
                  <View style={{
                    flex: 1,
                    height: 8,
                    backgroundColor: '#F3F4F6',
                    borderRadius: 4,
                    marginRight: 8,
                  }}>
                    <View style={{
                      width: `${analytics.totalScans > 0 ? (analytics.scansByMethod.qr_scan / analytics.totalScans) * 100 : 0}%`,
                      height: '100%',
                      backgroundColor: '#3B82F6',
                      borderRadius: 4,
                    }} />
                  </View>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#111827',
                    minWidth: 40,
                  }}>
                    {analytics.scansByMethod.qr_scan}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{
              flexDirection: 'row',
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  marginBottom: 4,
                }}>
                  Code manuel
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}>
                  <View style={{
                    flex: 1,
                    height: 8,
                    backgroundColor: '#F3F4F6',
                    borderRadius: 4,
                    marginRight: 8,
                  }}>
                    <View style={{
                      width: `${analytics.totalScans > 0 ? (analytics.scansByMethod.manual_code / analytics.totalScans) * 100 : 0}%`,
                      height: '100%',
                      backgroundColor: '#059669',
                      borderRadius: 4,
                    }} />
                  </View>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#111827',
                    minWidth: 40,
                  }}>
                    {analytics.scansByMethod.manual_code}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Top tables */}
        {analytics.topTables.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <View style={{ padding: 16 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 12,
              }}>
                Tables les plus utilisées
              </Text>
              
              {analytics.topTables.slice(0, 5).map((table, index) => (
                <View
                  key={table.tableId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth: index < 4 ? 1 : 0,
                    borderBottomColor: '#F3F4F6',
                  }}
                >
                  <View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#059669',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12,
                  }}>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: 'bold',
                      color: '#FFFFFF',
                    }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: '#111827',
                    flex: 1,
                  }}>
                    Table {table.tableNumber}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#059669',
                  }}>
                    {table.scans}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Erreurs récentes */}
        {analytics.recentErrors.length > 0 && (
          <Card>
            <View style={{ padding: 16 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#111827',
                marginBottom: 12,
              }}>
                Erreurs récentes
              </Text>
              
              {analytics.recentErrors.slice(0, 3).map((error, index) => (
                <View
                  key={index}
                  style={{
                    padding: 12,
                    backgroundColor: '#FEF2F2',
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                >
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                  }}>
                    <Text style={{
                      fontSize: 13,
                      color: '#EF4444',
                      flex: 1,
                      marginRight: 8,
                    }}>
                      {error.error}
                    </Text>
                    <View style={{
                      backgroundColor: '#EF4444',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 10,
                    }}>
                      <Text style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: '#FFFFFF',
                      }}>
                        {error.count}
                      </Text>
                    </View>
                  </View>
                  <Text style={{
                    fontSize: 11,
                    color: '#9CA3AF',
                  }}>
                    {new Date(error.timestamp).toLocaleString('fr-FR')}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header
        title="Monitoring QR Codes"
        rightIcon="download-outline"
        onRightPress={() => {
          Alert.alert(
            'Exporter les données',
            'Choisissez le format d\'export',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'JSON', onPress: () => handleExportData('json') },
              { text: 'CSV', onPress: () => handleExportData('csv') }
            ]
          );
        }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadData(true)}
          />
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
      >
        {/* Statut de santé */}
        {renderHealthStatus()}

        {/* Auto-détection */}
        {renderAutoDetection()}

        {/* Analytics */}
        {renderAnalytics()}

        {/* Actions */}
        <View style={{
          flexDirection: 'row',
          gap: 12,
          marginTop: 16,
        }}>
          <Button
            title="Actualiser"
            onPress={() => loadData(true)}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title="Export JSON"
            onPress={() => handleExportData('json')}
            variant="secondary"
            style={{ flex: 1 }}
          />
        </View>

        {/* Informations système */}
        <Card style={{ marginTop: 16 }}>
          <View style={{ padding: 16 }}>
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 8,
            }}>
              Informations système
            </Text>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>
                Événements stockés
              </Text>
              <Text style={{ fontSize: 12, color: '#111827', fontWeight: '500' }}>
                {qrMonitoring.getEventCount()}
              </Text>
            </View>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>
                Dernière vérification
              </Text>
              <Text style={{ fontSize: 12, color: '#111827', fontWeight: '500' }}>
                {health ? new Date(health.lastCheck).toLocaleTimeString('fr-FR') : '-'}
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}