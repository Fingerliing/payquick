"""
Service de vérification par email pour EatQuickeR
"""
from django.core.mail import send_mail, EmailMultiAlternatives
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class EmailVerificationService:

    def send_verification_code(self, email: str, code: str) -> bool:
        """Envoie un code de vérification par email"""
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

        try:
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
            )
            msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)
            logger.info(f"Email de vérification envoyé à {email}")
            return True
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi de l'email à {email}: {str(e)}")
            return False

    @staticmethod
    def mask_email(email: str) -> str:
        """Masque l'email pour la réponse API  ex: u***@example.com"""
        try:
            local, domain = email.split('@', 1)
            masked_local = local[0] + '***' if len(local) > 1 else '***'
            return f"{masked_local}@{domain}"
        except Exception:
            return '***'


email_verification_service = EmailVerificationService()