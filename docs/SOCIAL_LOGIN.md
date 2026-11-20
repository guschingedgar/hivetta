# Connexion Google et GitHub

La page `/login` propose le compte par e-mail et mot de passe ainsi que Google et GitHub. Au premier accès avec un fournisseur, Supabase crée le compte. Le callback `/auth/callback` échange le code PKCE et ouvre `/shared` ou la page demandée avant la connexion.

## Configuration nécessaire

1. Choisir l'instance Supabase utilisée par le site. Dans `.env`, définir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `APP_URL` (origine exacte du site, par exemple `http://127.0.0.1:3000` ou `https://votre-domaine`). Ne pas mélanger `localhost` et `127.0.0.1` pendant un même flux PKCE.
2. Dans Supabase, **Authentication → URL Configuration**, ajouter `APP_URL/auth/callback` aux URL de redirection autorisées et définir la Site URL sur l'origine de l'application.
3. Dans Google Cloud, créer un client OAuth **Web application**. Mettre l'origine du site dans les origines JavaScript autorisées et l'URL de callback affichée par **Supabase → Authentication → Sign In / Providers → Google** dans les URI de redirection autorisés. Coller le Client ID et le Client Secret dans la configuration Google de Supabase, puis activer ce fournisseur.
4. Dans GitHub, créer une **OAuth App**. Mettre l'origine du site comme Homepage URL et l'URL de callback affichée par **Supabase → Authentication → Sign In / Providers → GitHub** comme Authorization callback URL. Coller le Client ID et le Client Secret dans Supabase, puis activer ce fournisseur.
5. Tester depuis `/login` avec un compte Google et un compte GitHub. Pour rejoindre une équipe sur invitation, le fournisseur doit donner à Supabase l'adresse e-mail utilisée dans l'invitation.

Les secrets Google et GitHub restent dans Supabase et dans les consoles des fournisseurs. Ne pas les ajouter au dépôt, aux variables `NEXT_PUBLIC_*` ni à une conversation.

**Attention :** la connexion sociale des membres et l'OAuth du serveur MCP sont deux configurations distinctes. Activer Google ou GitHub ne rend pas automatiquement `/api/mcp` connectable à Claude.

Cette machine ne lance pas actuellement Supabase local : ses ports étaient publiés sur toutes les interfaces et le script de sécurité a arrêté la pile. Le flux OAuth complet nécessite une instance Supabase accessible et sécurisée.

Sources officielles : [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github), [URL de redirection](https://supabase.com/docs/guides/auth/redirect-urls).
