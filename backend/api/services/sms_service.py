from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self):
        self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        self.from_number = settings.TWILIO_PHONE_NUMBER
    
    def send_verification_code(self, phone_number: str, code: str) -> bool:
        """Envoie un code de vérification par SMS"""
        try:
            # Message en français
            message_body = (
                f"Votre code de vérification Eat&Go est : {code}\n\n"
                f"Ce code expire dans {settings.SMS_CODE_EXPIRY_MINUTES} minutes.\n"
                f"Ne partagez ce code avec personne."
            )
            
            message = self.client.messages.create(
                body=message_body,
                from_=self.from_number,
                to=phone_number,
                messaging_service_sid=settings.TWILIO_VERIFY_SERVICE_SID
            )
            
            logger.info(f"SMS envoyé avec succès à {phone_number}, SID: {message.sid}")
            return True
            
        except TwilioRestException as e:
            logger.error(f"Erreur Twilio lors de l'envoi du SMS à {phone_number}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Erreur inattendue lors de l'envoi du SMS: {str(e)}")
            return False
    
    def format_phone_number(self, phone_number: str) -> str:
        """Formate un numéro de téléphone au format international"""
        import phonenumbers
        
        try:
            # Parse le numéro (défaut France)
            parsed = phonenumbers.parse(phone_number, "FR")
            
            # Vérifier la validité
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError("Numéro de téléphone invalide")
            
            # Retourner au format international
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            
        except phonenumbers.NumberParseException:
            raise ValueError("Format de numéro invalide")

sms_service = SMSService()