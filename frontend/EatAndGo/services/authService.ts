import { User, LoginCredentials, RegisterCredentials } from '../types/auth';
import { apiClient } from './api';

export class AuthService {
  async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    return apiClient.post('/auth/login/', credentials);
  }

  async register(data: RegisterCredentials): Promise<{ user: User; token: string }> {
    return apiClient.post('/auth/register/', data);
  }

  async logout(): Promise<void> {
    return apiClient.post('/auth/logout/');
  }

  async getCurrentUser(): Promise<User> {
    return apiClient.get('/auth/me/');
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    return apiClient.patch('/auth/profile/', data);
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    return apiClient.post('/auth/change-password/', data);
  }

  async forgotPassword(email: string): Promise<void> {
    return apiClient.post('/auth/forgot-password/', { email });
  }

  async resetPassword(data: { token: string; password: string }): Promise<void> {
    return apiClient.post('/auth/reset-password/', data);
  }

  async uploadAvatar(file: FormData): Promise<User> {
    return apiClient.post('/auth/avatar/', file);
  }
}

export const authService = new AuthService();