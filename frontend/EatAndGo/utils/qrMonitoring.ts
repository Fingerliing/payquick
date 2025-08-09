import { apiClient } from '@/services/api';
import * as FileSystem from 'expo-file-system';

export interface QRScanEvent {
  id: string;
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  restaurantName: string;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
  success: boolean;
  errorMessage?: string;
  scanMethod: 'qr_scan' | 'manual_code';
  sessionId: string;
}

export interface QRAnalytics {
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  successRate: number;
  scansByMethod: {
    qr_scan: number;
    manual_code: number;
  };
  scansByTime: {
    hour: number;
    count: number;
  }[];
  topTables: {
    tableId: string;
    tableNumber: string;
    scans: number;
  }[];
  recentErrors: {
    timestamp: Date;
    error: string;
    count: number;
  }[];
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  lastCheck: Date;
  issues: {
    type: 'api_error' | 'high_failure_rate' | 'low_usage' | 'config_issue';
    severity: 'low' | 'medium' | 'high';
    message: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
  }[];
  recommendations: string[];
}

class QRMonitoringSystem {
  private events: QRScanEvent[] = [];
  private healthStatus: SystemHealth = {
    status: 'healthy',
    lastCheck: new Date(),
    issues: [],
    recommendations: []
  };

  private readonly STORAGE_KEY = 'qr_monitoring_events';
  private readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_EVENTS_STORED = 1000;

  constructor() {
    this.initializeMonitoring();
  }

  /**
   * Initialise le système de monitoring
   */
  private async initializeMonitoring(): Promise<void> {
    try {
      await this.loadStoredEvents();
      this.startHealthChecks();
      console.log('✅ QR Monitoring System initialized');
    } catch (error) {
      console.error('❌ Failed to initialize monitoring:', error);
    }
  }

  /**
   * Enregistre un événement de scan QR
   */
  async recordScanEvent(event: Omit<QRScanEvent, 'id' | 'timestamp' | 'sessionId'>): Promise<void> {
    try {
      const scanEvent: QRScanEvent = {
        ...event,
        id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        sessionId: this.generateSessionId()
      };

      this.events.push(scanEvent);
      
      // Limiter le nombre d'événements stockés
      if (this.events.length > this.MAX_EVENTS_STORED) {
        this.events = this.events.slice(-this.MAX_EVENTS_STORED);
      }

      await this.saveEventsToStorage();
      
      // Analyse en temps réel pour détecter les problèmes
      await this.analyzeRecentEvents();

      console.log('📊 QR scan event recorded:', {
        table: event.tableNumber,
        success: event.success,
        method: event.scanMethod
      });

    } catch (error) {
      console.error('❌ Failed to record scan event:', error);
    }
  }

  /**
   * Analyse les événements récents pour détecter les problèmes
   */
  private async analyzeRecentEvents(): Promise<void> {
    try {
      const recentEvents = this.getRecentEvents(30 * 60 * 1000); // 30 minutes
      const failureRate = this.calculateFailureRate(recentEvents);
      
      // Détection de taux d'échec élevé
      if (failureRate > 0.3 && recentEvents.length >= 5) {
        this.addHealthIssue({
          type: 'high_failure_rate',
          severity: 'high',
          message: `Taux d'échec élevé: ${(failureRate * 100).toFixed(1)}% sur les 30 dernières minutes`,
          count: recentEvents.filter(e => !e.success).length,
          firstSeen: recentEvents.find(e => !e.success)?.timestamp || new Date(),
          lastSeen: new Date()
        });
      }

      // Détection d'erreurs répétées
      const errorGroups = this.groupErrorsByMessage(recentEvents.filter(e => !e.success));
      Object.entries(errorGroups).forEach(([error, events]) => {
        if (events.length >= 3) {
          this.addHealthIssue({
            type: 'api_error',
            severity: 'medium',
            message: `Erreur répétée: ${error}`,
            count: events.length,
            firstSeen: events[0].timestamp,
            lastSeen: events[events.length - 1].timestamp
          });
        }
      });

    } catch (error) {
      console.error('❌ Failed to analyze recent events:', error);
    }
  }

  /**
   * Effectue une vérification de santé complète du système
   */
  async performHealthCheck(): Promise<SystemHealth> {
    try {
      console.log('🔍 Performing QR system health check...');

      const issues: SystemHealth['issues'] = [];
      const recommendations: string[] = [];

      // Test de connectivité API
      const apiHealthy = await this.testAPIConnectivity();
      if (!apiHealthy) {
        issues.push({
          type: 'api_error',
          severity: 'high',
          message: 'API non accessible',
          count: 1,
          firstSeen: new Date(),
          lastSeen: new Date()
        });
        recommendations.push('Vérifiez la connexion réseau et les endpoints API');
      }

      // Analyse des événements des dernières 24h
      const dayEvents = this.getRecentEvents(24 * 60 * 60 * 1000);
      const failureRate = this.calculateFailureRate(dayEvents);

      if (failureRate > 0.2) {
        issues.push({
          type: 'high_failure_rate',
          severity: failureRate > 0.5 ? 'high' : 'medium',
          message: `Taux d'échec élevé sur 24h: ${(failureRate * 100).toFixed(1)}%`,
          count: dayEvents.filter(e => !e.success).length,
          firstSeen: dayEvents.find(e => !e.success)?.timestamp || new Date(),
          lastSeen: new Date()
        });
        recommendations.push('Vérifiez la configuration des QR codes et la validité des tables');
      }

      // Détection de faible utilisation
      if (dayEvents.length < 5 && dayEvents.length > 0) {
        issues.push({
          type: 'low_usage',
          severity: 'low',
          message: 'Faible utilisation des QR codes',
          count: dayEvents.length,
          firstSeen: new Date(Date.now() - 24 * 60 * 60 * 1000),
          lastSeen: new Date()
        });
        recommendations.push('Vérifiez que les QR codes sont visibles et accessibles aux clients');
      }

      // Déterminer le statut global
      const status = issues.some(i => i.severity === 'high') ? 'critical' :
                    issues.some(i => i.severity === 'medium') ? 'warning' : 'healthy';

      this.healthStatus = {
        status,
        lastCheck: new Date(),
        issues,
        recommendations
      };

      console.log(`🏥 Health check complete: ${status}`, {
        issues: issues.length,
        recommendations: recommendations.length
      });

      return this.healthStatus;

    } catch (error) {
      console.error('❌ Health check failed:', error);
      return {
        status: 'critical',
        lastCheck: new Date(),
        issues: [{
          type: 'config_issue',
          severity: 'high',
          message: 'Échec de la vérification de santé',
          count: 1,
          firstSeen: new Date(),
          lastSeen: new Date()
        }],
        recommendations: ['Vérifiez la configuration du système de monitoring']
      };
    }
  }

  /**
   * Génère des analytics détaillées
   */
  generateAnalytics(timeRange?: { start: Date; end: Date }): QRAnalytics {
    try {
      const events = timeRange ? 
        this.events.filter(e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end) :
        this.events;

      const totalScans = events.length;
      const successfulScans = events.filter(e => e.success).length;
      const failedScans = totalScans - successfulScans;
      const successRate = totalScans > 0 ? successfulScans / totalScans : 0;

      // Scans par méthode
      const scansByMethod = {
        qr_scan: events.filter(e => e.scanMethod === 'qr_scan').length,
        manual_code: events.filter(e => e.scanMethod === 'manual_code').length
      };

      // Scans par heure
      const scansByTime = this.groupEventsByHour(events);

      // Top tables
      const tableScans = this.groupEventsByTable(events);
      const topTables = Object.entries(tableScans)
        .map(([tableId, tableEvents]) => ({
          tableId,
          tableNumber: tableEvents[0].tableNumber,
          scans: tableEvents.length
        }))
        .sort((a, b) => b.scans - a.scans)
        .slice(0, 10);

      // Erreurs récentes
      const recentErrors = this.groupRecentErrors(events.filter(e => !e.success));

      return {
        totalScans,
        successfulScans,
        failedScans,
        successRate,
        scansByMethod,
        scansByTime,
        topTables,
        recentErrors
      };

    } catch (error) {
      console.error('❌ Failed to generate analytics:', error);
      return {
        totalScans: 0,
        successfulScans: 0,
        failedScans: 0,
        successRate: 0,
        scansByMethod: { qr_scan: 0, manual_code: 0 },
        scansByTime: [],
        topTables: [],
        recentErrors: []
      };
    }
  }

  /**
   * Exporte les données de monitoring
   */
  async exportMonitoringData(format: 'json' | 'csv'): Promise<string> {
    try {
      const analytics = this.generateAnalytics();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      if (format === 'json') {
        const data = {
          exportDate: new Date().toISOString(),
          analytics,
          healthStatus: this.healthStatus,
          events: this.events.slice(-100) // Derniers 100 événements
        };
        
        const jsonString = JSON.stringify(data, null, 2);
        const fileUri = `${FileSystem.documentDirectory}qr_monitoring_${timestamp}.json`;
        
        await FileSystem.writeAsStringAsync(fileUri, jsonString);
        return fileUri;
      } else {
        // Export CSV
        const csvData = this.convertEventsToCSV(this.events);
        const fileUri = `${FileSystem.documentDirectory}qr_events_${timestamp}.csv`;
        
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        return fileUri;
      }
    } catch (error) {
      console.error('❌ Failed to export monitoring data:', error);
      throw error;
    }
  }

  /**
   * Détecte automatiquement les problèmes et propose des solutions
   */
  async autoDetectIssues(): Promise<{
    issues: string[];
    solutions: string[];
    criticalCount: number;
  }> {
    try {
      await this.performHealthCheck();
      
      const issues: string[] = [];
      const solutions: string[] = [];
      let criticalCount = 0;

      this.healthStatus.issues.forEach(issue => {
        issues.push(`${issue.type}: ${issue.message}`);
        
        if (issue.severity === 'high') {
          criticalCount++;
        }

        // Solutions spécifiques par type d'issue
        switch (issue.type) {
          case 'high_failure_rate':
            solutions.push('Vérifiez que les tables sont actives et que les QR codes sont valides');
            solutions.push('Testez manuellement quelques QR codes pour identifier le problème');
            break;
          case 'api_error':
            solutions.push('Vérifiez la connectivité réseau');
            solutions.push('Redémarrez l\'application si le problème persiste');
            break;
          case 'low_usage':
            solutions.push('Vérifiez que les QR codes sont visibles sur les tables');
            solutions.push('Assurez-vous que le WiFi du restaurant est fonctionnel');
            break;
          case 'config_issue':
            solutions.push('Vérifiez la configuration des endpoints API');
            solutions.push('Contactez le support technique si nécessaire');
            break;
        }
      });

      return {
        issues,
        solutions: [...new Set(solutions)], // Dédoublonner
        criticalCount
      };

    } catch (error) {
      console.error('❌ Failed to auto-detect issues:', error);
      return {
        issues: ['Erreur lors de la détection automatique'],
        solutions: ['Redémarrez l\'application et réessayez'],
        criticalCount: 1
      };
    }
  }

  // Méthodes utilitaires privées
  private async testAPIConnectivity(): Promise<boolean> {
    try {
      const response = await apiClient.get('/api/health/', { timeout: 5000 }) as any;
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getRecentEvents(timeMs: number): QRScanEvent[] {
    const cutoff = new Date(Date.now() - timeMs);
    return this.events.filter(e => e.timestamp >= cutoff);
  }

  private calculateFailureRate(events: QRScanEvent[]): number {
    if (events.length === 0) return 0;
    return events.filter(e => !e.success).length / events.length;
  }

  private groupErrorsByMessage(events: QRScanEvent[]): Record<string, QRScanEvent[]> {
    return events.reduce((groups, event) => {
      const key = event.errorMessage || 'Unknown error';
      groups[key] = groups[key] || [];
      groups[key].push(event);
      return groups;
    }, {} as Record<string, QRScanEvent[]>);
  }

  private groupEventsByHour(events: QRScanEvent[]): { hour: number; count: number }[] {
    const hourCounts = new Array(24).fill(0);
    
    events.forEach(event => {
      const hour = event.timestamp.getHours();
      hourCounts[hour]++;
    });

    return hourCounts.map((count, hour) => ({ hour, count }));
  }

  private groupEventsByTable(events: QRScanEvent[]): Record<string, QRScanEvent[]> {
    return events.reduce((groups, event) => {
      groups[event.tableId] = groups[event.tableId] || [];
      groups[event.tableId].push(event);
      return groups;
    }, {} as Record<string, QRScanEvent[]>);
  }

  private groupRecentErrors(errorEvents: QRScanEvent[]): { timestamp: Date; error: string; count: number }[] {
    const errorGroups = this.groupErrorsByMessage(errorEvents);
    
    return Object.entries(errorGroups).map(([error, events]) => ({
      error,
      count: events.length,
      timestamp: events[events.length - 1].timestamp
    })).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private addHealthIssue(issue: Omit<SystemHealth['issues'][0], 'firstSeen' | 'lastSeen'> & { firstSeen: Date; lastSeen: Date }): void {
    const existingIssue = this.healthStatus.issues.find(i => 
      i.type === issue.type && i.message === issue.message
    );

    if (existingIssue) {
      existingIssue.count = issue.count;
      existingIssue.lastSeen = issue.lastSeen;
    } else {
      this.healthStatus.issues.push(issue);
    }
  }

  private convertEventsToCSV(events: QRScanEvent[]): string {
    const headers = ['Timestamp', 'Table ID', 'Table Number', 'Restaurant', 'Success', 'Method', 'Error'];
    const rows = events.map(event => [
      event.timestamp.toISOString(),
      event.tableId,
      event.tableNumber,
      event.restaurantName,
      event.success ? 'Success' : 'Failed',
      event.scanMethod,
      event.errorMessage || ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private async saveEventsToStorage(): Promise<void> {
    try {
      const data = JSON.stringify(this.events);
      const fileUri = `${FileSystem.documentDirectory}${this.STORAGE_KEY}.json`;
      await FileSystem.writeAsStringAsync(fileUri, data);
    } catch (error) {
      console.error('❌ Failed to save events to storage:', error);
    }
  }

  private async loadStoredEvents(): Promise<void> {
    try {
      const fileUri = `${FileSystem.documentDirectory}${this.STORAGE_KEY}.json`;
      const fileExists = await FileSystem.getInfoAsync(fileUri);
      
      if (fileExists.exists) {
        const data = await FileSystem.readAsStringAsync(fileUri);
        const events = JSON.parse(data);
        
        // Convertir les timestamps string en Date objects
        this.events = events.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp)
        }));
        
        console.log(`📊 Loaded ${this.events.length} monitoring events from storage`);
      }
    } catch (error) {
      console.error('❌ Failed to load stored events:', error);
      this.events = [];
    }
  }

  private startHealthChecks(): void {
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  // Getters publics
  getHealthStatus(): SystemHealth {
    return this.healthStatus;
  }

  getAllEvents(): QRScanEvent[] {
    return [...this.events];
  }

  getEventCount(): number {
    return this.events.length;
  }
}

export const qrMonitoring = new QRMonitoringSystem();