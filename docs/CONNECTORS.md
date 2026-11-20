# Connexions et lancement local

## Ce qui fonctionne aujourd'hui

Le dépôt possède un prototype local et un studio partagé :

1. `/` conserve le prototype local, sans compte, avec des données dans ce navigateur.
2. `/shared` est le studio authentifié. Équipes, projets, membres, conversations, messages et mémoire sont stockés dans Supabase. Les membres voient les nouveautés au rafraîchissement automatique.
3. Le MCP sur `/api/mcp` expose `list_projects`, `get_project_brief`, `search_memory`, `list_open_questions` et `propose_claims` sur la même mémoire Supabase.

Le prototype sur `/` reste séparé. Pour tester les comptes et la mémoire commune, utiliser `/shared`. Les anciennes données du navigateur ne sont pas importées automatiquement.

Les rôles Supabase sont `admin` (chef et gestionnaire de mémoire), `contributor` (écrit et propose) et `viewer` (lecture). Chaque personne utilise son propre compte et mot de passe.

## Lancer avec Node.js

À la racine du dépôt :

    corepack pnpm install --filter @memory/web...
    corepack pnpm --filter @memory/web dev --hostname 127.0.0.1

Ouvrir http://127.0.0.1:3000. Aucun compte ni clé API n'est requis pour le studio local. Le serveur de développement doit être arrêté avant de lancer un autre serveur Next sur le même dépôt.

Pour préparer aussi la mémoire MCP partagée avec Supabase local, Docker doit tourner. À la racine du dépôt :

    corepack pnpm install
    corepack pnpm db:local:start
    corepack pnpm db:local:env

La CLI applique les migrations et le script crée `.env` ainsi que le lien `apps/web/.env`. Ces fichiers sont ignorés par Git et ne sont pas écrasés s'ils existent déjà. Redémarrer ensuite Next. `/login` crée un compte, `/console` crée une équipe et un projet et invite les autres comptes, `/shared` permet de discuter sur la mémoire commune. La migration `20261014140000_shared_conversations_memory_manager.sql` doit être appliquée avant le test du studio partagé.

Le script de démarrage vérifie les ports Docker. Sur cette machine, Supabase CLI a publié ses ports sur toutes les interfaces malgré un réseau Docker configuré pour localhost. Le script arrête donc la pile en conservant ses données dans ce cas. Utiliser une instance Supabase sécurisée ou corriger cette publication de ports avant de tester les comptes ici. Le serveur OAuth MCP local n'est pas encore activé dans la configuration. Pour les connecteurs cloud, il faut une instance déployée en HTTPS avec OAuth configuré et un compte par personne.

Pour utiliser Ollama installé sur la machine, relancer le serveur avec :

    LOCAL_MODEL_ENABLED=1 OLLAMA_BASE_URL=http://127.0.0.1:11434 corepack pnpm --filter @memory/web dev --hostname 127.0.0.1

Le modèle doit déjà être installé dans Ollama. Dans `/shared`, après sa réponse, une seconde passe extrait au plus six informations durables. Elles sont enregistrées avec la conversation comme source et attendent le check-up. Seuls les nœuds confirmés servent de contexte au prochain modèle. Sans modèle, le message humain est conservé, mais l'extraction automatique ne peut pas tourner.

## Lancer avec Docker Compose

Le port 3000 doit être libre. Pour le site seul :

    docker compose up --build -d web

Pour le site et Ollama, sans API payante :

    LOCAL_MODEL_ENABLED=1 docker compose --profile local-model up --build -d web ollama
    docker compose exec ollama ollama pull NOM_DU_MODELE

Après l'installation du modèle, actualiser la page. Les modèles Ollama restent dans le volume Docker ollama_models. Le site n'expose son port que sur 127.0.0.1. Pour utiliser un Ollama déjà lancé sur l'hôte Mac au lieu du conteneur, définir OLLAMA_BASE_URL=http://host.docker.internal:11434.

Le worker peut être lancé séparément après configuration de DATABASE_URL :

    docker compose --profile worker up --build -d worker

Arrêt :

    docker compose --profile local-model --profile worker down

Le worker et le MCP distant ont besoin des variables Supabase décrites dans .env.example. Le service web peut démarrer sans elles ; /console et /api/mcp ne fonctionneront pas tant que la connexion Supabase et OAuth n'est pas configurée.

## Connecter des assistants au MCP partagé

Configurer une instance accessible en HTTPS avec `APP_URL`, les variables Supabase et l'OAuth Supabase indiqué dans le README. L'URL MCP est `https://VOTRE-DOMAINE/api/mcp`. Chaque personne s'authentifie avec son compte. Les clients OAuth délégués peuvent lire et proposer ; ils ne peuvent ni valider ni retirer. Le gestionnaire de `/shared` permet aux administrateurs de retirer un nœud avec une raison. Le nœud sort des recherches actives mais reste dans l'audit.

- Claude : ajouter cette URL comme connecteur MCP distant dans Customize > Connectors, puis terminer la connexion OAuth. Le service doit être joignable depuis les serveurs d'Anthropic, donc localhost ne suffit pas pour Claude web. Documentation : https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- ChatGPT : ajouter un connecteur MCP personnalisé si le compte et l'espace de travail donnent accès au mode développeur. Les droits d'écriture dépendent du plan et des règles de l'espace. ChatGPT web ne se connecte pas directement à localhost. Documentation : https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
- Gemini CLI : ce client accepte un serveur MCP HTTP et OAuth. Une fois le MCP et Supabase configurés, utiliser gemini mcp add --transport http team-memory https://VOTRE-DOMAINE/api/mcp, puis terminer l'authentification. Gemini CLI peut aussi atteindre localhost depuis la même machine. Documentation : https://geminicli.com/docs/tools/mcp-server/
- Ollama : le studio partagé utilise directement son API locale et la mémoire Supabase du projet. Ollama seul n'est pas un client MCP. Documentation : https://docs.ollama.com/api/chat

## Lecture rapide du produit

Une équipe contient des projets. Dans `/shared`, un projet contient les conversations de plusieurs comptes. Les réponses Ollama peuvent produire automatiquement des propositions de mémoire. Un administrateur les confirme dans le check-up. Les membres peuvent interroger la mémoire dans le gestionnaire ; seul un administrateur peut retirer un nœud actif avec une raison. Les clients MCP lisent la même mémoire et peuvent proposer des éléments supplémentaires.

## Parcours de test partagé

1. Appliquer les migrations sur une instance Supabase sécurisée et configurer `.env` comme dans `.env.example`.
2. Lancer `LOCAL_MODEL_ENABLED=1 OLLAMA_BASE_URL=http://127.0.0.1:11434 corepack pnpm --filter @memory/web dev --hostname 127.0.0.1`.
3. Ouvrir `/login`, créer deux comptes, puis `/console` pour créer une équipe, un projet et inviter le second compte.
4. Dans `/shared`, créer une conversation, choisir un modèle Ollama installé et discuter d'une décision. Vérifier l'apparition d'une proposition dans le check-up, la confirmer, puis se connecter avec le second compte et voir le même nœud.
5. Dans « Gestionnaire mémoire », interroger ce nœud et, avec le compte administrateur, le retirer en donnant une raison. Vérifier qu'il ne remonte plus comme mémoire active.
6. Après déploiement HTTPS et activation OAuth, ajouter la même URL `/api/mcp` à Claude et ChatGPT. Vérifier le parcours croisé avec deux comptes.

`corepack pnpm test`, `corepack pnpm typecheck` et `corepack pnpm --filter @memory/web build` vérifient le code hors base. `supabase/tests/shared_memory.sql` vérifie les permissions sur une base migrée et termine par un rollback volontaire.
