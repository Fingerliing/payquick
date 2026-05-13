"""
Service d'envoi d'emails pour EatQuickeR
- Codes de vérification d'email (inscription / changement)
- Codes de réinitialisation de mot de passe
"""
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class EmailVerificationService:

    # ── Vérification email ────────────────────────────────────────────────────

    def send_verification_code(self, email: str, code: str) -> bool:
        """Envoie un code de vérification email (inscription)."""
        expiry = getattr(settings, 'SMS_CODE_EXPIRY_MINUTES', 10)

        subject = "Votre code de vérification EatQuickeR"

        text_body = (
            f"Votre code de vérification est : {code}\n\n"
            f"Ce code expire dans {expiry} minutes.\n"
            f"Ne partagez ce code avec personne.\n\n"
            f"Si vous n'avez pas demandé ce code, ignorez cet email.\n\n"
            f"— L'équipe EatQuickeR"
        )

        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;
                    border:1px solid #e5e7eb;border-radius:8px;">
            <h2 style="color:#111827;margin-bottom:8px;">Vérification de votre compte</h2>
            <p style="color:#6b7280;margin-bottom:24px;">
                Utilisez le code ci-dessous pour confirmer votre adresse email.
            </p>
            <div style="background:#f3f4f6;border-radius:6px;padding:20px;text-align:center;
                        letter-spacing:8px;font-size:32px;font-weight:700;color:#111827;">
                {code}
            </div>
            <p style="color:#9ca3af;font-size:13px;margin-top:20px;">
                Ce code expire dans <strong>{expiry} minutes</strong>.<br>
                Ne partagez ce code avec personne.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="color:#d1d5db;font-size:12px;">
                Si vous n'avez pas demandé ce code, ignorez cet email.
            </p>
        </div>
        """

        return self._send(email, subject, text_body, html_body)

    # ── Réinitialisation mot de passe ─────────────────────────────────────────

    def send_password_reset_code(self, email: str, code: str) -> bool:
        """
        Envoie un code de réinitialisation de mot de passe.
        Le ton et le contenu sont distincts du code de vérification email pour
        que l'utilisateur sache exactement à quoi sert ce code.
        """
        expiry = getattr(settings, 'PASSWORD_RESET_CODE_EXPIRY_MINUTES', 10)

        subject = "Réinitialisation de votre mot de passe EatQuickeR"

        text_body = (
            f"Bonjour,\n\n"
            f"Vous avez demandé à réinitialiser votre mot de passe EatQuickeR.\n\n"
            f"Votre code de réinitialisation est : {code}\n\n"
            f"Ce code expire dans {expiry} minutes.\n"
            f"Ne partagez ce code avec personne — aucun membre de l'équipe "
            f"EatQuickeR ne vous le demandera.\n\n"
            f"Si vous n'avez pas demandé cette réinitialisation, ignorez cet "
            f"email : votre mot de passe restera inchangé.\n\n"
            f"— L'équipe EatQuickeR"
        )

        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;
                    border:1px solid #e5e7eb;border-radius:8px;">
            <div style="border-left:4px solid #D4AF37;padding-left:12px;margin-bottom:20px;">
                <h2 style="color:#1E2A78;margin:0 0 4px 0;">Réinitialisation de mot de passe</h2>
                <p style="color:#6b7280;margin:0;font-size:14px;">
                    Vous avez demandé à réinitialiser votre mot de passe.
                </p>
            </div>

            <p style="color:#374151;margin-bottom:8px;">
                Saisissez le code ci-dessous dans l'application :
            </p>
            <div style="background:#F0F3FF;border:1px solid #D4DBFA;border-radius:8px;
                        padding:24px;text-align:center;letter-spacing:10px;
                        font-size:34px;font-weight:700;color:#1E2A78;
                        margin-bottom:20px;">
                {code}
            </div>

            <p style="color:#9ca3af;font-size:13px;margin:0 0 12px 0;">
                Ce code expire dans <strong>{expiry} minutes</strong>.<br>
                Ne le partagez avec personne.
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

            <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0;">
                Vous n'êtes pas à l'origine de cette demande ?<br>
                Ignorez cet email — votre mot de passe ne sera pas modifié.
                Pensez à vérifier que votre compte est bien sécurisé.
            </p>
        </div>
        """

        return self._send(email, subject, text_body, html_body)

    # ── Envoi générique ───────────────────────────────────────────────────────

    def _send(self, email: str, subject: str, text_body: str, html_body: str) -> bool:
        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
            )
            msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)
            logger.info(f"Email envoyé à {email} (sujet : {subject})")
            return True
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email à {email} : {str(e)}")
            return False

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def mask_email(email: str) -> str:
        """Masque l'email pour la réponse API — ex: u***@example.com"""
        try:
            local, domain = email.split('@', 1)
            masked_local = local[0] + '***' if len(local) > 1 else '***'
            return f"{masked_local}@{domain}"
        except Exception:
            return '***'


email_verification_service = EmailVerificationService()