from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

def send_data_export_email(user, download_url):
    """Email avec lien de téléchargement des données"""
    
    subject = 'Votre export de données EatQuickeR est prêt'
    
    context = {
        'user_name': user.first_name,
        'download_url': download_url,
        'expiry_days': 7,
    }
    
    html_content = render_to_string('emails/data_export.html', context)
    text_content = f'''
    Bonjour {user.first_name},
    
    Votre export de données est prêt à être téléchargé.
    
    Lien de téléchargement : {download_url}
    (valable 7 jours)
    
    Cordialement,
    L'équipe EatQuickeR
    '''
    
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email='contact@eatquicker.com',
        to=[user.email]
    )
    email.attach_alternative(html_content, "text/html")
    email.send()


def send_account_deletion_confirmation(user, deletion_date):
    """Email de confirmation de suppression de compte"""
    
    subject = 'Confirmation de suppression de compte EatQuickeR'
    
    context = {
        'user_name': user.first_name,
        'deletion_date': deletion_date.strftime('%d/%m/%Y'),
    }
    
    # ... similaire au précédent