# Publication du changelog vers WordPress

## Principe

`docs/CHANGELOG.md` est l’unique source officielle. Il contient toujours une section `## Non publié`, suivie de l’historique daté complet. Les anciennes entrées ne doivent jamais être réécrites.

Le script générique `scripts/changelog_wordpress.py` :

- lit `pluginVersion` et l’URL canonique de l’article dans `plugin_info/info.json` ;
- n’utilise aucun identifiant numérique WordPress configuré ;
- retrouve l’article en interrogeant les types REST exposés, puis exige une correspondance unique et exacte de l’URL canonique ;
- extrait une seule entrée datée et refuse `Non publié` ;
- détecte le contenu HTML classique, Gutenberg ou Markdown sans convertir l’historique ;
- ajoute une entrée balisée en tête et conserve l’ancien contenu comme suffixe inchangé ;
- refuse les doublons, y compris une version ajoutée manuellement sans marqueur ;
- fonctionne en simulation par défaut et n’écrit qu’avec `sync --publish` ;
- relit l’article avant et après l’écriture, utilise les validateurs HTTP disponibles et refuse une modification concurrente détectée ;
- n’envoie que le champ `content` et vérifie après écriture le titre, le slug, le statut, le type et les catégories.

Les marqueurs ont la forme suivante et sont uniques par plugin et version :

```html
<!-- jeedom-changelog:iotawatt:0.95.0:start -->
...
<!-- jeedom-changelog:iotawatt:0.95.0:end -->
```

## Dépendances

Les dépendances propres à ce système sont isolées dans `requirements-changelog.txt`.

```bash
cd /Users/blackou/github/jeedom-iotawatt
python3 -m venv .venv-changelog
source .venv-changelog/bin/activate
python -m pip install --requirement requirements-changelog.txt
```

## Configuration WordPress et GitHub

1. Créer dans WordPress un compte technique disposant uniquement du droit de modifier l’article existant.
2. Créer un **mot de passe d’application WordPress** pour ce compte. Ne pas utiliser le mot de passe de connexion normal.
3. Dans le dépôt GitHub, créer l’environnement `wordpress-publication`. Une approbation obligatoire peut y être ajoutée.
4. Ajouter les secrets d’environnement :
   - `WP_USER` : identifiant du compte technique ;
   - `WP_APP_PASSWORD` : mot de passe d’application.
5. Ajouter la variable d’environnement `WP_ALLOWED_DOMAIN` avec la valeur `flobul-domotique.fr`.

Le domaine autorisé est indépendant de `plugin_info/info.json`. Une modification malveillante de l’URL `changelog` ne peut donc pas envoyer les identifiants à un autre domaine. Les redirections vers un autre hôte sont également refusées.

Aucun contenu brut d’article, cookie ou identifiant n’est écrit dans les journaux. Le workflow ne téléverse que l’entrée HTML générée et un résumé contenant des empreintes SHA-256 ; les fichiers locaux avant/après et leur diff restent dans `.changelog-preview/`, dossier ignoré par Git.

## Développement quotidien

Ajouter uniquement les changements utiles aux utilisateurs sous `## Non publié`. Fusionner les notes décrivant le même problème et éviter les détails purement techniques.

Validation locale sans réseau :

```bash
python scripts/changelog_wordpress.py validate
python .github/ci/test_changelog_wordpress.py
python tests/test_changelog_wordpress.py
```

Le fichier sous `.github/ci/` est suivi par Git et exécuté dans la CI. Le lanceur sous `/tests/` respecte la convention locale qui exclut ce dossier du dépôt.

## Préparation explicite d’une version

Cette commande est volontairement explicite. Elle déplace le contenu actuel de `Non publié` vers une entrée datée et remet une section vide. Elle ne crée ni tag, ni Release, ni commit, et ne change pas `pluginVersion`.

```bash
python scripts/changelog_wordpress.py prepare --version 0.95.0 --date 31/10/2026
```

Mettre ensuite à jour `pluginVersion` dans les fichiers du plugin selon le processus de release, puis valider :

```bash
python scripts/changelog_wordpress.py validate --version 0.95.0
```

## Connexion en lecture seule et simulation

Saisir le mot de passe dans le terminal, jamais dans la ligne de commande ni dans une conversation :

```bash
cd /Users/blackou/github/jeedom-iotawatt
export WP_USER='identifiant-wordpress'
read -s 'WP_APP_PASSWORD?Mot de passe application WordPress: '
export WP_APP_PASSWORD
printf '\n'

python scripts/changelog_wordpress.py connection-test \
  --allowed-domain flobul-domotique.fr

python scripts/changelog_wordpress.py sync \
  --version 0.94.0 \
  --allowed-domain flobul-domotique.fr \
  --dry-run
```

La simulation authentifie l’accès, retrouve l’article, lit `content.raw`, détecte son format, vérifie l’absence de la version et crée :

- `.changelog-preview/wordpress-before.txt` ;
- `.changelog-preview/wordpress-after.txt` ;
- `.changelog-preview/wordpress-before-after.diff` ;
- `.changelog-preview/changelog-entry.html` ;
- `.changelog-preview/summary.json`.

Si la version `0.94.0` est déjà présente manuellement sur le site, la simulation s’arrête proprement sans créer de doublon. Pour tester l’insertion complète, utiliser la prochaine version réellement préparée dans le changelog et `pluginVersion` — sans créer de Release tant que la revue n’est pas terminée.

## Workflow GitHub Actions

`.github/workflows/publish-changelog.yml` possède deux déclencheurs :

- `workflow_dispatch` : simulation uniquement ; exige un tag existant, sa version et le SHA complet attendu ;
- `release: published` : publication uniquement si la Release n’est ni un brouillon ni une préversion.

Le workflow vérifie que le checkout correspond exactement au commit du tag, exécute les tests suivis par Git, valide le changelog et `plugin_info/info.json`, teste WordPress en lecture seule, effectue une simulation, puis seulement pour une Release stable exécute `--publish`.

Il ne crée jamais de tag, de numéro de version, de Release ou d’article WordPress.

## Reprise après incident

La publication est idempotente : une entrée marquée ou détectée manuellement n’est pas ajoutée une seconde fois. En cas d’indisponibilité WordPress, de JSON inattendu, de format ambigu, de conflit ou d’échec de relecture, le processus échoue sans supprimer l’historique. Relancer le workflow après correction est sûr : le contrôle de présence empêche la duplication.

Une publication est refusée si WordPress ne fournit ni `ETag` ni `Last-Modified` pour protéger l’écriture conditionnelle. Dans ce cas, corriger la configuration du serveur ou du proxy plutôt que d’affaiblir la protection.
