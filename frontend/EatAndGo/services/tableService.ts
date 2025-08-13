import { apiClient } from './api';

export interface Table {
  id: string;
  number: string;
  identifiant: string;
  restaurant: string;
  capacity: number;
  is_active: boolean;
  qr_code?: string;
  qrCodeUrl: string;
  manualCode: string;
  created_at?: string;
}

export interface CreateTablesRequest {
  restaurantId: string;
  tableCount: number;
  startNumber?: number;
  capacity?: number;
}

export interface CreateTablesResponse {
  tables: Table[];
  restaurant: string;
  success: boolean;
}

class TableService {
  /**
  * Crée plusieurs tables pour un restaurant
  */
  async createTables(
    restaurantId: string, 
    tableCount: number, 
    startNumber: number = 1,
    capacity: number = 4
  ): Promise<Table[]> {
    try {
      const response = await apiClient.post<CreateTablesResponse>('api/v1/table/bulk_create/', {
        restaurant_id: restaurantId,
        table_count: tableCount,
        start_number: startNumber,
        capacity: capacity
      });
      
      return response.tables.map(table => this.normalizeTableData(table));
    } catch (error: any) {
      console.error('❌ Erreur création tables:', error);
      
      // Gestion spécifique des erreurs 400 (conflit de numéros de tables)
      if (error.response?.status === 400) {
        const errorData = error.response.data;
        
        // Messages d'erreur plus explicites selon le type de conflit
        if (errorData.error && errorData.error.includes('exist')) {
          throw new Error(`Des tables avec ces numéros existent déjà. Choisissez d'autres numéros de départ ou chargez les tables existantes.`);
        } else if (errorData.detail && errorData.detail.includes('exist')) {
          throw new Error(`Conflit détecté : ${errorData.detail}`);
        } else if (errorData.message && errorData.message.includes('exist')) {
          throw new Error(`Conflit : ${errorData.message}`);
        } else {
          throw new Error(`Erreur 400 : ${errorData.error || errorData.detail || errorData.message || 'Données invalides'}`);
        }
      }
      
      // Pour les autres erreurs
      throw new Error(error.message || 'Erreur lors de la création des tables');
    }
  }

  /**
  * Récupère les tables d'un restaurant
  */
  async getRestaurantTables(restaurantId: string): Promise<Table[]> {
    try {
      // appeler le bon endpoint
      const response = await apiClient.get(`api/v1/table/restaurants/${restaurantId}/tables/`);
      // extraire la liste des tables
      const tables = Array.isArray((response as any).tables)
        ? (response as any).tables
        : [];
      return tables.map(this.normalizeTableData);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return []; // aucune table pour ce restaurant
      }
      throw new Error(error.message || "Erreur lors de la récupération des tables");
    }
  }

  /**
   * Crée une table individuelle
   */
  async createTable(data: {
    restaurantId: string;
    number: string;
    capacity?: number;
    identifiant?: string;
  }): Promise<Table> {
    try {
      const response = await apiClient.post<Table>('api/v1/table/', {
        restaurant: data.restaurantId,
        number: data.number,
        capacity: data.capacity || 4,
        identifiant: data.identifiant || this.generateTableIdentifiant(data.restaurantId, data.number),
        is_active: true
      });
      
      return this.normalizeTableData(response);
    } catch (error: any) {
      console.error('❌ Erreur création table:', error);
      throw new Error(error.message || 'Erreur lors de la création de la table');
    }
  }

  /**
   * Met à jour une table
   */
  async updateTable(id: string, data: Partial<Table>): Promise<Table> {
    try {
      const response = await apiClient.patch<Table>(`api/v1/table/${id}/`, data);
      return this.normalizeTableData(response);
    } catch (error: any) {
      console.error('❌ Erreur mise à jour table:', error);
      throw new Error(error.message || 'Erreur lors de la mise à jour de la table');
    }
  }

  /**
   * Supprime une table
   */
  async deleteTable(id: string): Promise<void> {
    try {
      await apiClient.delete(`api/v1/table/${id}/`);
    } catch (error: any) {
      console.error('❌ Erreur suppression table:', error);
      throw new Error(error.message || 'Erreur lors de la suppression de la table');
    }
  }

  /**
   * Active/désactive une table
   */
  async toggleTableStatus(id: string): Promise<Table> {
    try {
      const response = await apiClient.post<Table>(`api/v1/table/${id}/toggle_status/`);
      return this.normalizeTableData(response);
    } catch (error: any) {
      console.error('❌ Erreur changement statut table:', error);
      throw new Error(error.message || 'Erreur lors du changement de statut');
    }
  }

  /**
   * Génère un QR code pour une table
   */
  async generateQRCode(tableId: string): Promise<{ qr_code_url: string; manual_code: string }> {
    try {
      const response = await apiClient.post(`api/v1/table/${tableId}/generate_qr/`) as any;
      return response;
    } catch (error: any) {
      console.error('❌ Erreur génération QR code:', error);
      throw new Error(error.message || 'Erreur lors de la génération du QR code');
    }
  }

  /**
   * Récupère les informations d'une table via son identifiant public
   */
  async getTableByIdentifiant(identifiant: string) {
    try {
      // Utilise l'endpoint public pour récupérer la table via son identifiant (QR ou manuel).
      // Le préfixe 'public' évite que les identifiants numériques soient interprétés comme des IDs
      // d'objets dans le ViewSet privé, ce qui entraînerait un 401.
      const response = await apiClient.get(`api/v1/table/public/${identifiant}/`);
      return response;
    } catch (error: any) {
      console.error('❌ Erreur récupération table publique:', error);
      throw new Error(error.message || 'Table non trouvée');
    }
  }

  /**
   * Exporte les QR codes d'un restaurant au format PDF
   */
  async exportQRCodesPDF(restaurantId: string): Promise<Blob> {
    try {
      const response = await apiClient.get(`api/v1/table/restaurants/${restaurantId}/export_qr/`, {
        responseType: 'blob'
      }) as any;
      return response;
    } catch (error: any) {
      console.error('❌ Erreur export PDF:', error);
      throw new Error(error.message || 'Erreur lors de l\'export PDF');
    }
  }

  /**
   * Normalise les données de table pour le frontend
   */
  private normalizeTableData(table: any): Table {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || window.location.origin;
    
    return {
      id: String(table.id),
      number: table.number,
      identifiant: table.identifiant || table.qr_code || `R${table.restaurant}T${String(table.number).padStart(3, '0')}`,
      restaurant: String(table.restaurant),
      capacity: table.capacity || 4,
      is_active: table.is_active ?? true,
      qr_code: table.qr_code,
      // Utilise le préfixe /table/public/ pour générer l'URL accessible au client. Si
      // table.identifiant est défini, on l'utilise, sinon on retombe sur qr_code.
      qrCodeUrl: `${baseUrl}/table/public/${table.identifiant || table.qr_code}`,
      manualCode: table.identifiant || table.qr_code,
      created_at: table.created_at
    };
  }

  /**
   * Génère un identifiant unique pour une table
   */
  private generateTableIdentifiant(restaurantId: string, tableNumber: string): string {
    return `R${restaurantId}T${String(tableNumber).padStart(3, '0')}`;
  }

  /**
   * Valide les données de création de table
   */
  private validateTableData(data: any): void {
    if (!data.restaurantId) {
      throw new Error('L\'ID du restaurant est requis');
    }
    if (!data.number) {
      throw new Error('Le numéro de table est requis');
    }
    if (data.capacity && (data.capacity < 1 || data.capacity > 20)) {
      throw new Error('La capacité doit être entre 1 et 20');
    }
  }
}

export const tableService = new TableService();