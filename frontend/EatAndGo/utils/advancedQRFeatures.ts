import { Table } from '@/types/table';
import { Restaurant } from '@/types/restaurant';
import { tableService } from '@/services/tableService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export interface QRBatch {
  id: string;
  restaurantId: string;
  restaurantName: string;
  tables: Table[];
  createdAt: Date;
  totalTables: number;
}

export interface QRTemplate {
  id: string;
  name: string;
  design: 'classic' | 'modern' | 'minimalist' | 'branded';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  logo?: string;
  customText?: string;
}

class AdvancedQRFeatures {
  private batches: QRBatch[] = [];
  private templates: QRTemplate[] = [
    {
      id: 'classic',
      name: 'Classique',
      design: 'classic',
      colors: { primary: '#059669', secondary: '#000000', accent: '#FFFFFF' }
    },
    {
      id: 'modern',
      name: 'Moderne',
      design: 'modern',
      colors: { primary: '#3B82F6', secondary: '#1E40AF', accent: '#F8FAFC' }
    },
    {
      id: 'minimalist',
      name: 'Minimaliste',
      design: 'minimalist',
      colors: { primary: '#6B7280', secondary: '#111827', accent: '#FFFFFF' }
    }
  ];

  /**
   * Crée un lot de tables avec suivi
   */
  async createTableBatch(
    restaurantId: string,
    restaurantName: string,
    tableCount: number,
    startNumber: number = 1,
    options?: {
      capacity?: number;
      prefix?: string;
      template?: string;
    }
  ): Promise<QRBatch> {
    try {
      console.log('🚀 Creating advanced table batch...', {
        restaurantId,
        tableCount,
        startNumber,
        options
      });

      // Créer les tables via le service existant
      const tables = await tableService.createTables(
        restaurantId,
        tableCount,
        startNumber,
        options?.capacity
      );

      // Créer le batch
      const batch: QRBatch = {
        id: `batch_${Date.now()}`,
        restaurantId,
        restaurantName,
        tables,
        createdAt: new Date(),
        totalTables: tables.length
      };

      // Sauvegarder le batch
      this.batches.push(batch);
      await this.saveBatchToStorage(batch);

      console.log('✅ Table batch created:', batch);
      return batch;

    } catch (error) {
      console.error('❌ Error creating table batch:', error);
      throw error;
    }
  }

  /**
   * Génère un PDF avancé avec template personnalisé
   */
  async generateAdvancedPDF(
    tables: Table[],
    restaurant: Restaurant,
    template: QRTemplate,
    options?: {
      format?: 'A4' | 'Letter' | 'A5';
      orientation?: 'portrait' | 'landscape';
      tablesPerPage?: number;
      includeInstructions?: boolean;
      customFooter?: string;
    }
  ): Promise<string> {
    try {
      console.log('🎨 Generating advanced PDF...', { template, options });

      const htmlContent = this.generateAdvancedHTML(tables, restaurant, template, options);

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        width: options?.format === 'A5' ? 420 : 612,
        height: options?.format === 'A5' ? 595 : 792,
      });

      return uri;
    } catch (error) {
      console.error('❌ Error generating advanced PDF:', error);
      throw error;
    }
  }

  /**
   * Génère du HTML avancé avec templates
   */
  private generateAdvancedHTML(
    tables: Table[],
    restaurant: Restaurant,
    template: QRTemplate,
    options?: any
  ): string {
    const { colors } = template;
    const tablesPerPage = options?.tablesPerPage || 4;

    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: ${colors.accent};
          color: ${colors.secondary};
        }

        .page {
          width: 100%;
          min-height: 100vh;
          padding: 20px;
          page-break-after: always;
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid ${colors.primary};
        }

        .restaurant-name {
          font-size: 28px;
          font-weight: bold;
          color: ${colors.primary};
          margin-bottom: 10px;
        }

        .subtitle {
          font-size: 16px;
          color: ${colors.secondary};
          opacity: 0.8;
        }

        .tables-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 30px;
          margin-bottom: 40px;
        }

        .table-card {
          border: 2px solid ${colors.primary};
          border-radius: 15px;
          padding: 20px;
          text-align: center;
          background: ${colors.accent};
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          page-break-inside: avoid;
        }

        .brand-header {
          font-size: 20px;
          font-weight: bold;
          color: ${colors.primary};
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .table-number {
          font-size: 24px;
          font-weight: bold;
          color: ${colors.secondary};
          margin: 15px 0;
        }

        .qr-placeholder {
          width: 140px;
          height: 140px;
          margin: 20px auto;
          border: 2px dashed ${colors.primary};
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${colors.accent};
          font-size: 12px;
          color: ${colors.primary};
          text-align: center;
          line-height: 1.4;
        }

        .manual-code {
          background: linear-gradient(135deg, ${colors.primary}15, ${colors.primary}25);
          padding: 15px;
          border-radius: 10px;
          margin: 15px 0;
          border: 1px solid ${colors.primary}40;
        }

        .manual-code-label {
          font-size: 12px;
          color: ${colors.secondary};
          font-weight: 600;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .manual-code-value {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 18px;
          font-weight: bold;
          color: ${colors.primary};
          letter-spacing: 2px;
        }

        .instructions {
          font-size: 11px;
          color: ${colors.secondary};
          opacity: 0.8;
          line-height: 1.5;
          margin-top: 15px;
          padding: 10px;
          background: ${colors.primary}10;
          border-radius: 6px;
        }

        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid ${colors.primary}30;
          font-size: 12px;
          color: ${colors.secondary};
          opacity: 0.7;
        }

        @media print {
          .page { page-break-after: always; }
          .table-card { page-break-inside: avoid; }
        }

        /* Template-specific styles */
        ${this.getTemplateSpecificStyles(template)}
      </style>
    `;

    // Diviser les tables en pages
    const pages = [];
    for (let i = 0; i < tables.length; i += tablesPerPage) {
      pages.push(tables.slice(i, i + tablesPerPage));
    }

    const pagesHTML = pages.map((pageTables, pageIndex) => `
      <div class="page">
        ${pageIndex === 0 ? `
          <div class="header">
            <div class="restaurant-name">${restaurant.name}</div>
            <div class="subtitle">QR Codes pour les Tables • ${tables.length} tables</div>
          </div>
        ` : ''}
        
        <div class="tables-grid">
          ${pageTables.map(table => `
            <div class="table-card">
              <div class="brand-header">Eat&Go</div>
              <div class="table-number">Table ${table.number}</div>
              
              <div class="qr-placeholder">
                <div>
                  📱 QR CODE<br/>
                  ${table.identifiant}<br/>
                  <small>Scannez avec votre téléphone</small>
                </div>
              </div>
              
              <div class="manual-code">
                <div class="manual-code-label">Code Manuel</div>
                <div class="manual-code-value">${table.manualCode}</div>
              </div>
              
              ${options?.includeInstructions !== false ? `
                <div class="instructions">
                  <strong>Instructions :</strong><br/>
                  1. Scannez le QR code avec votre téléphone<br/>
                  2. Ou saisissez le code manuel sur notre site<br/>
                  3. Consultez le menu et passez commande
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
        
        ${pageIndex === pages.length - 1 ? `
          <div class="footer">
            ${options?.customFooter || `Généré le ${new Date().toLocaleDateString('fr-FR')} • ${restaurant.name}`}
          </div>
        ` : ''}
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>QR Codes - ${restaurant.name}</title>
          ${styles}
        </head>
        <body>
          ${pagesHTML}
        </body>
      </html>
    `;
  }

  /**
   * Styles spécifiques par template
   */
  private getTemplateSpecificStyles(template: QRTemplate): string {
    switch (template.design) {
      case 'modern':
        return `
          .table-card {
            background: linear-gradient(135deg, ${template.colors.accent}, ${template.colors.primary}15);
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.15);
          }
          .qr-placeholder {
            background: ${template.colors.accent};
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
          }
        `;
      
      case 'minimalist':
        return `
          .table-card {
            border: 1px solid ${template.colors.primary}40;
            box-shadow: none;
          }
          .brand-header { font-weight: 300; }
          .table-number { font-weight: 300; }
        `;
      
      default:
        return '';
    }
  }

  /**
   * Exporte les QR codes en différents formats
   */
  async exportQRBatch(
    batch: QRBatch,
    restaurant: Restaurant,
    format: 'pdf' | 'images' | 'json',
    template?: QRTemplate
  ): Promise<string> {
    try {
      console.log('📤 Exporting QR batch...', { format, batch: batch.id });

      switch (format) {
        case 'pdf':
          return await this.generateAdvancedPDF(
            batch.tables,
            restaurant,
            template || this.templates[0]
          );

        case 'images':
          return await this.exportAsImages(batch.tables);

        case 'json':
          return await this.exportAsJSON(batch);

        default:
          throw new Error('Format non supporté');
      }
    } catch (error) {
      console.error('❌ Error exporting QR batch:', error);
      throw error;
    }
  }

  /**
   * Exporte comme images individuelles
   */
  private async exportAsImages(tables: Table[]): Promise<string> {
    // Créer un dossier temporaire
    const folderUri = `${FileSystem.documentDirectory}qr_images_${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });

    // Générer une image pour chaque table (simulé)
    for (const table of tables) {
      const imageContent = this.generateTableImageHTML(table);
      const { uri } = await Print.printToFileAsync({
        html: imageContent,
        width: 400,
        height: 600,
      });
      
      // Copier dans le dossier
      const newUri = `${folderUri}table_${table.number}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: newUri });
    }

    return folderUri;
  }

  /**
   * Génère HTML pour une image de table individuelle
   */
  private generateTableImageHTML(table: Table): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
              text-align: center;
              background: white;
            }
            .card {
              border: 2px solid #059669;
              border-radius: 15px;
              padding: 30px;
              max-width: 300px;
              margin: 0 auto;
            }
            .brand { font-size: 24px; font-weight: bold; color: #059669; margin-bottom: 10px; }
            .table-number { font-size: 20px; font-weight: bold; margin: 15px 0; }
            .qr-placeholder {
              width: 150px; height: 150px; margin: 20px auto;
              border: 2px dashed #059669; border-radius: 10px;
              display: flex; align-items: center; justify-content: center;
              font-size: 12px; color: #059669;
            }
            .manual-code {
              background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0;
            }
            .code { font-family: monospace; font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">Eat&Go</div>
            <div class="table-number">Table ${table.number}</div>
            <div class="qr-placeholder">QR CODE<br/>${table.identifiant}</div>
            <div class="manual-code">
              <strong>Code manuel :</strong><br/>
              <div class="code">${table.manualCode}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Exporte comme JSON
   */
  private async exportAsJSON(batch: QRBatch): Promise<string> {
    const data = {
      batch,
      exportDate: new Date().toISOString(),
      format: 'json',
      tables: batch.tables.map(table => ({
        id: table.id,
        number: table.number,
        identifiant: table.identifiant,
        qrCodeUrl: table.qrCodeUrl,
        manualCode: table.manualCode,
        capacity: table.capacity,
        isActive: table.is_active
      }))
    };

    const jsonString = JSON.stringify(data, null, 2);
    const fileUri = `${FileSystem.documentDirectory}qr_batch_${batch.id}.json`;
    
    await FileSystem.writeAsStringAsync(fileUri, jsonString);
    return fileUri;
  }

  /**
   * Sauvegarde un batch en local
   */
  private async saveBatchToStorage(batch: QRBatch): Promise<void> {
    try {
      const batches = await this.loadBatchesFromStorage();
      batches.push(batch);
      
      const batchesJson = JSON.stringify(batches);
      const fileUri = `${FileSystem.documentDirectory}qr_batches.json`;
      
      await FileSystem.writeAsStringAsync(fileUri, batchesJson);
      console.log('✅ Batch saved to storage');
    } catch (error) {
      console.error('❌ Error saving batch:', error);
    }
  }

  /**
   * Charge les batches depuis le stockage local
   */
  async loadBatchesFromStorage(): Promise<QRBatch[]> {
    try {
      const fileUri = `${FileSystem.documentDirectory}qr_batches.json`;
      const fileExists = await FileSystem.getInfoAsync(fileUri);
      
      if (fileExists.exists) {
        const batchesJson = await FileSystem.readAsStringAsync(fileUri);
        return JSON.parse(batchesJson);
      }
      
      return [];
    } catch (error) {
      console.error('❌ Error loading batches:', error);
      return [];
    }
  }

  /**
   * Partage un batch
   */
  async shareBatch(batchId: string, format: 'pdf' | 'json' = 'pdf'): Promise<void> {
    try {
      const batch = this.batches.find(b => b.id === batchId);
      if (!batch) {
        throw new Error('Batch non trouvé');
      }

      // Pour cet exemple, on génère un fichier simple
      const restaurant = { name: batch.restaurantName } as Restaurant;
      const fileUri = await this.exportQRBatch(batch, restaurant, format);
      
      await Sharing.shareAsync(fileUri, {
        mimeType: format === 'pdf' ? 'application/pdf' : 'application/json',
        dialogTitle: `Partager QR Codes - ${batch.restaurantName}`
      });
    } catch (error) {
      console.error('❌ Error sharing batch:', error);
      throw error;
    }
  }

  /**
   * Obtient les statistiques des batches
   */
  getBatchStatistics(): {
    totalBatches: number;
    totalTables: number;
    averageTablesPerBatch: number;
    oldestBatch?: Date;
    newestBatch?: Date;
  } {
    if (this.batches.length === 0) {
      return {
        totalBatches: 0,
        totalTables: 0,
        averageTablesPerBatch: 0
      };
    }

    const totalTables = this.batches.reduce((sum, batch) => sum + batch.totalTables, 0);
    const dates = this.batches.map(b => b.createdAt);
    
    return {
      totalBatches: this.batches.length,
      totalTables,
      averageTablesPerBatch: Math.round(totalTables / this.batches.length),
      oldestBatch: new Date(Math.min(...dates.map(d => d.getTime()))),
      newestBatch: new Date(Math.max(...dates.map(d => d.getTime())))
    };
  }

  // Getters
  getAllBatches(): QRBatch[] {
    return [...this.batches];
  }

  getAllTemplates(): QRTemplate[] {
    return [...this.templates];
  }

  getBatchById(id: string): QRBatch | undefined {
    return this.batches.find(b => b.id === id);
  }
}

export const advancedQRFeatures = new AdvancedQRFeatures();