import { authService } from '../../services/authService';
import { apiClient } from '../../services/api';

// Mock de l'API client
jest.mock('../../services/api');
const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockResponse = {
        user: { id: '1', email: 'test@test.com', firstName: 'Test', lastName: 'User' },
        token: 'mock-token',
      };

      mockedApiClient.post.mockResolvedValue(mockResponse);

      const result = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/login/', {
        email: 'test@test.com',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on invalid credentials', async () => {
      const mockError = {
        code: 401,
        message: 'Invalid credentials',
      };

      mockedApiClient.post.mockRejectedValue(mockError);

      await expect(
        authService.login({
          email: 'test@test.com',
          password: 'wrongpassword',
        })
      ).rejects.toEqual(mockError);
    });
  });

  describe('register', () => {
    it('should register successfully with valid data', async () => {
      const mockResponse = {
        user: { id: '1', email: 'test@test.com', firstName: 'Test', lastName: 'User' },
        token: 'mock-token',
      };

      mockedApiClient.post.mockResolvedValue(mockResponse);

      const registerData = {
        email: 'test@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const result = await authService.register(registerData);

      expect(mockedApiClient.post).toHaveBeenCalledWith('/auth/register/', registerData);
      expect(result).toEqual(mockResponse);
    });
  });
});