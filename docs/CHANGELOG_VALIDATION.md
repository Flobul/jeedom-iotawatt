# Rapport de validation — industrialisation du changelog IoTaWatt

Date de validation : 18 octobre 2026.

## Périmètre livré

- Source officielle : `docs/CHANGELOG.md` avec section `Non publié`.
- Script générique : `scripts/changelog_wordpress.py`.
- Dépendances isolées : `requirements-changelog.txt`.
- Workflow stable : `.github/workflows/publish-changelog.yml`.
- Workflow de diagnostic en lecture seule : `.github/workflows/test-wordpress-connection.yml`.
- Tests suivis par Git : `.github/ci/test_changelog_wordpress.py`.
- Lanceur local ignoré par Git : `/tests/test_changelog_wordpress.py`.
- Documentation : `docs/CHANGELOG_AUTOMATION.md`.
- Aperçu HTML : `docs/changelog-preview.html`.
- Règles additives du skill `dev-orchestrator` pour `Non publié` et la préparation de release.

## Historique IoTaWatt

Les dix entrées historiques `0.94.0` à `0.10` sont identiques, à partir du premier titre de version, à l’historique audité du POC. Seule la section `Non publié` a été ajoutée devant elles.

Une entrée de test `0.95.0` datée du 31 octobre 2026 et ne contenant que le texte d’attente « Aucun changement pour le moment » a été retirée localement : elle ne correspondait ni à `pluginVersion` (`0.94.0`), ni à une release préparée. Le validateur refuse désormais toute entrée datée ne contenant qu’un texte d’attente.

## Contrôles locaux réussis

- Validation du changelog et de `pluginVersion 0.94.0` : réussie, 10 versions historiques.
- Tests changelog : **19/19 réussis**.
- Compilation Python : réussie.
- `actionlint` sur tous les workflows : réussi.
- ESLint et contrôles frontend : réussis.
- Contrôles Jeedom : 0 erreur, 0 avertissement.
- Validation i18n : 6 fichiers, 0 erreur.
- Analyse des secrets : 91 fichiers suivis, 0 détection à haute confiance.
- Semgrep ciblé sur le script et ses tests : 0 finding.
- `git diff --check` : réussi.
- PHP syntaxique et PHPStan : réussis lors de la validation complète précédente ; aucun fichier PHP n’a été modifié depuis.
- Dépendance épinglée `mistune==3.3.0` testée dans un environnement virtuel neuf : réussie.

Les tests couvrent l’extraction d’une version, l’exclusion de `Non publié`, la cohérence de version, le refus des entrées d’attente, les formats HTML/Markdown/Gutenberg, la conservation intégrale du contenu antérieur, l’idempotence, les versions ajoutées manuellement, les pannes, les conflits, les réponses API invalides, le mode simulation, le domaine autorisé et le fait que la requête d’écriture n’envoie que `content` avec les en-têtes conditionnels disponibles.

Un test d’intégration simulé supplémentaire utilise un article HTML fictif contenant `Version 0.94.0`, insère une entrée `0.95.0` balisée en tête, compare le résultat complet attendu, vérifie que l’ancien article reste un suffixe strictement identique et relance une seconde synchronisation. Une seule écriture fictive est observée et un seul marqueur de début subsiste.

## Validation WordPress en lecture seule

L’API publique répond et annonce la prise en charge des mots de passe d’application. L’URL canonique de `plugin_info/info.json` retrouve exactement un article public :

- type : `post` ;
- statut : `publish` ;
- slug : `liste-des-versions-du-plugin-iotawatt-pour-jeedom` ;
- URL canonique exacte : `https://flobul-domotique.fr/liste-des-versions-du-plugin-iotawatt-pour-jeedom/`.

Le contenu public contient déjà la version `0.94.0` sans marqueur géré. Après authentification réussie, une simulation de `0.94.0` doit donc conclure « version déjà présente manuellement » et ne rien ajouter.

## Authentification WordPress validée

L’exécution GitHub Actions `39111122423`, lancée le 18 octobre 2026 à 08:21 UTC, avait échoué sans écriture avec `HTTP 401`. La cause a été isolée par le test différentiel REST/XML-RPC : la valeur initialement utilisée correspondait au **nom de l’application**, et non à l’identifiant du compte WordPress.

Après utilisation de l’identifiant réel du compte avec le même mécanisme de mot de passe d’application, le contrôle local en lecture seule a réussi :

- article canonique retrouvé sans ambiguïté ;
- accès REST authentifié ;
- `content.raw` disponible ;
- format détecté : **Gutenberg** ;
- aucune écriture WordPress effectuée.

Le secret d’environnement GitHub `WP_USER` a été corrigé avec l’identifiant du compte. La simulation locale de `0.94.0` a ensuite été exécutée deux fois et a produit, à chaque exécution :

```text
No change: version 0.94.0 is already present (manual-entry); duplicate publication prevented
```

Le workflow de connexion en lecture seule `39145819747`, exécuté le 18 octobre 2026 à 16:37 UTC sur le commit `359ff586468caeebc3bba415d36169fa0bea2598`, s’est terminé avec succès. Toutes ses étapes ont réussi, notamment l’installation des dépendances et le diagnostic d’authentification WordPress. Le test de reprise est donc validé sans écriture et l’absence de doublon est démontrée sur deux simulations consécutives.

## Effets externes

- Aucune publication WordPress effectuée.
- Aucun article créé ou recréé.
- Aucun tag ou GitHub Release créé par l’automatisation.
- Aucun commit ou push effectué pendant cette reprise par Hermes.
