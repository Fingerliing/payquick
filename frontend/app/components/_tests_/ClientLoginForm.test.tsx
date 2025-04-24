
import { render, screen, fireEvent } from '@testing-library/react';
import ClientLoginForm from '../ClientLoginForm';

// Mock du store Zustand
jest.mock('@/store/authStore', () => ({
  useAuthStore: jest.fn(() => ({ login: jest.fn() })),
}));

describe('ClientLoginForm', () => {
  it('renderise le formulaire de connexion', () => {
    render(<ClientLoginForm />);
    expect(screen.getByPlaceholderText("Nom d'utilisateur")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('accepte la saisie utilisateur', () => {
    render(<ClientLoginForm />);
    const usernameInput = screen.getByPlaceholderText("Nom d'utilisateur") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText("Mot de passe") as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'mypassword' } });

    expect(usernameInput.value).toBe('testuser');
    expect(passwordInput.value).toBe('mypassword');
  });
});
