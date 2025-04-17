from django.contrib.auth.models import User, Group

# Étape 1 : Créer les groupes
group_names = ["admin", "restaurateur", "client"]
groups = {}
for name in group_names:
    group, created = Group.objects.get_or_create(name=name)
    groups[name] = group
    print(f"Groupe '{name}' {'créé' if created else 'déjà existant'}")

# Étape 2 : Créer les utilisateurs de test
users_info = [
    ("admin_user", "admin123", "admin"),
    ("restaurateur_user", "resto123", "restaurateur"),
    ("client_user", "client123", "client"),
]

for username, password, group_name in users_info:
    user, created = User.objects.get_or_create(username=username)
    if created:
        user.set_password(password)
        user.save()
        print(f"Utilisateur '{username}' créé avec mot de passe : {password}")
    else:
        print(f"Utilisateur '{username}' déjà existant")

    # Ajouter au groupe
    user.groups.add(groups[group_name])
    print(f"→ Assigné au groupe '{group_name}'")
