# Configuration Coolify pour Avalution2

## 1. Créer une nouvelle application dans Coolify

1. Connecte-toi à ton instance Coolify
2. Crée une nouvelle application
3. Sélectionne "GitHub" comme source
4. Choisis le repo `BillyBob36/avalution2`
5. Branche : `main`

## 2. Configuration de build

- **Build Pack** : Dockerfile
- **Dockerfile Location** : `./Dockerfile`
- **Port** : 3000

## 3. Variables d'environnement à configurer

Ajoute ces variables dans Coolify (utilise tes vraies clés Azure) :

```
AZURE_OPENAI_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_OPENAI_KEY=your-openai-key-here
AZURE_API_VERSION=2024-12-01-preview
AZURE_DEPLOYMENT=gpt-5.2-chat-2

AZURE_TTS_ENDPOINT=https://your-tts-resource.cognitiveservices.azure.com
AZURE_TTS_KEY=your-tts-key-here
AZURE_TTS_DEPLOYMENT=tts-hd
AZURE_TTS_API_VERSION=2025-03-01-preview
AZURE_TTS_VOICE=alloy

PORT=3000
```

**Note** : Les vraies valeurs sont dans ton fichier `.env` local (non versionné).

## 4. Déployer

Clique sur "Deploy" dans Coolify.

## 5. Récupérer l'URL du backend

Une fois déployé, Coolify te donnera une URL (ex: `https://avalution2.ton-domaine.com`)

## 6. Modifier le frontend pour pointer vers le backend Coolify

Dans `app.js`, remplace les URLs des API :
- `/api/chat` → `https://avalution2.ton-domaine.com/api/chat`
- `/api/speech` → `https://avalution2.ton-domaine.com/api/speech`

Puis commit et push les changements.

## 7. Accéder à l'application

- **Frontend** : https://billybob36.github.io/avalution2/
- **Backend** : https://avalution2.ton-domaine.com (ton URL Coolify)
