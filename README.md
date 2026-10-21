# Secret Santa en famille

Tirage au sort de cadeaux avec tickets à gratter, listes d'idées et discussions secrètes entre pères Noël.

- **Organisateur** : ajoute les participants (pseudo + photo facultative), définit les exclusions et le nombre de personnes tirées par participant, lance le tirage et envoie à chacun son lien personnel.
- **Participant** (via son lien) : gratte ses tickets pour découvrir qui il gâte, écrit sa liste d'idées, et rejoint une discussion avec les autres pères Noël de chaque personne tirée pour se répartir les idées.
- **Groupes** : l'organisateur peut regrouper des participants (un couple, une famille). Un groupe tire et est tiré comme une seule entité ; tirer un groupe, c'est offrir un cadeau à chacun de ses membres. Le tirage équilibre la répartition pour que chaque personne ait un nombre de cadeaux à préparer aussi proche que possible du nombre de tirages choisi. Chaque membre garde son lien et sa liste, et gratte lui-même les tickets communs du groupe.
- Une idée ne peut être prise que par un seul père Noël. Le destinataire ne voit jamais quelles idées ont été prises, ni qui l'a tiré. L'organisateur non plus.

Stack : Next.js (Vercel) + Supabase (Postgres). Tout tient dans les offres gratuites.

## Déploiement

### 1. Base de données Supabase

1. Crée un compte sur https://supabase.com puis **New project** (région Europe, par ex. Paris ou Frankfurt). Note le mot de passe de la base quelque part, il ne sera pas utile ensuite mais Supabase l'exige.
2. Dans le projet : **SQL Editor > New query**, colle tout le contenu de `supabase/schema.sql`, clique **Run**. Tu dois voir « Success. No rows returned ».
3. **Project Settings > API Keys** (ou **Settings > API** selon l'interface) et récupère :
   - l'**URL du projet** (`https://xxxx.supabase.co`, visible aussi dans **Project Settings > Data API**) ;
   - la **clé secrète** : `sb_secret_...` dans l'onglet *API Keys*, ou à défaut la clé `service_role` de l'onglet *Legacy API keys*.

La clé secrète donne un accès total à la base : ne la mets jamais dans le code, uniquement dans les variables d'environnement Vercel.

### 2. Code sur GitHub

```bash
cd secret-santa
git init
git add .
git commit -m "Secret Santa"
```

Crée un dépôt **privé** vide sur https://github.com/new, puis :

```bash
git remote add origin https://github.com/<ton-compte>/secret-santa.git
git branch -M main
git push -u origin main
```

### 3. Hébergement Vercel

1. Crée un compte sur https://vercel.com avec ton compte GitHub (offre *Hobby*, gratuite).
2. **Add New > Project**, importe le dépôt `secret-santa`. Vercel détecte Next.js tout seul.
3. Avant de cliquer *Deploy*, ouvre **Environment Variables** et ajoute :
   - `SUPABASE_URL` = l'URL du projet
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé secrète
   - `CREATE_SECRET` = un mot de passe de ton choix (recommandé : sans lui, n'importe qui connaissant l'adresse du site pourrait créer des tirages)
4. **Deploy**. Au bout d'une minute, tu obtiens une adresse du type `https://secret-santa-xxxx.vercel.app`.

Chaque `git push` sur `main` redéploie automatiquement le site.

### 4. Organiser le tirage

1. Ouvre l'adresse du site, crée le tirage (avec le mot de passe `CREATE_SECRET`).
2. Tu arrives sur ta **page organisateur** : mets-la en favori, c'est ta seule clé d'accès.
3. Ajoute les participants (toi compris si tu participes), les exclusions, puis **Lancer le tirage**.
4. Pour chaque personne, clique **Envoyer son lien** (partage direct sur mobile, copie sur ordinateur) et envoie-le par WhatsApp ou SMS. Toi aussi, utilise ton propre lien participant pour gratter tes tickets.

Les participants peuvent écrire leur liste d'idées avant même le tirage.

## Mise à jour depuis la version 1 (ajout des groupes)

Si ta base a été créée avec la première version :

1. Dans Supabase > SQL Editor, exécute **une seule fois** `supabase/migration-v2-groupes.sql`. Toutes les données sont conservées (participants, liens, listes, tirage, tickets grattés, messages).
2. Pousse le nouveau code sur GitHub : Vercel redéploie automatiquement.

Pour une nouvelle installation, `supabase/schema.sql` contient déjà tout : n'exécute pas la migration.

## Comment le tirage équilibre les groupes

Chaque personne seule ou groupe tire k « entités » (k = nombre de tirages réglé par l'organisateur). Une entité de s personnes devrait idéalement avoir k × s cadeaux à préparer, soit k par personne. Le tirage cherche la répartition qui s'en approche le plus, tout en respectant les exclusions. L'équilibre parfait n'est pas toujours possible : par exemple avec 2 couples et k = 2, un couple ne peut tirer l'autre qu'une fois, donc certaines personnes seules devront tirer un couple. La page organisateur affiche après le tirage la fourchette du nombre de cadeaux par personne.

## Bon à savoir

- **Pause Supabase** : un projet gratuit inactif pendant 7 jours est mis en pause. Si le site affiche « Erreur de base de données », va sur le tableau de bord Supabase et clique **Restore project**. Fais-le juste avant d'envoyer les liens.
- **Un lien a fuité ?** Sur la page organisateur, **Nouveau lien** invalide l'ancien.
- **Réinitialiser le tirage** efface les attributions, les idées réservées et les discussions, mais conserve les listes d'idées.
- **Domaine personnalisé** : facultatif, à ajouter dans Vercel > Settings > Domains.

## Développement local

```bash
cp .env.example .env.local   # puis remplis les deux variables Supabase
npm install
npm run dev                  # http://localhost:3000
npm run test:draw            # vérifie l'algorithme de tirage
```

## Organisation du code

- `supabase/schema.sql` : tables et sécurité (RLS activé sans politique : seul le serveur accède aux données).
- `lib/draw.ts` : algorithme de tirage (tirages aléatoires valides améliorés par échanges pour équilibrer les groupes).
- `app/api/admin/[token]` : actions de l'organisateur.
- `app/api/p/[token]` : actions du participant ; c'est ici que sont faites les vérifications de visibilité.
- `app/admin/[token]`, `app/p/[token]` : les pages.
- `components/ScratchCard.tsx` : le ticket à gratter.
