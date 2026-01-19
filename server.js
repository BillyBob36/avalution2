require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;
const AZURE_API_VERSION = process.env.AZURE_API_VERSION || '2024-12-01-preview';
const AZURE_DEPLOYMENT = process.env.AZURE_DEPLOYMENT || 'gpt-5.2-chat-2';

const AZURE_TTS_ENDPOINT = process.env.AZURE_TTS_ENDPOINT;
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY;
const AZURE_TTS_DEPLOYMENT = process.env.AZURE_TTS_DEPLOYMENT || 'tts-hd';
const AZURE_TTS_API_VERSION = process.env.AZURE_TTS_API_VERSION || '2025-03-01-preview';
const AZURE_TTS_VOICE = process.env.AZURE_TTS_VOICE || 'alloy';

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        
        const conversationMessages = [
            {
                role: 'system',
                content: 'Tu es un assistant virtuel sympathique et serviable. Réponds de manière naturelle et conversationnelle en français. Garde tes réponses courtes et concises (2-3 phrases maximum).'
            },
            ...messages
        ];
        
        const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VERSION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_OPENAI_KEY
            },
            body: JSON.stringify({
                messages: conversationMessages,
                max_completion_tokens: 500
            })
        });
        
        const responseText = await response.text();
        
        if (!response.ok) {
            console.error('Erreur Azure OpenAI:', response.status, responseText);
            throw new Error(`Azure OpenAI API error: ${response.status} - ${responseText}`);
        }
        
        const data = JSON.parse(responseText);
        const assistantMessage = data.choices[0].message.content;
        
        res.json({ message: assistantMessage });
        
    } catch (error) {
        console.error('Erreur chat:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/speech', async (req, res) => {
    try {
        const { text, voice } = req.body;
        
        console.log('TTS Request - Voice:', voice, 'Text length:', text?.length);
        
        const url = `${AZURE_TTS_ENDPOINT}/openai/deployments/${AZURE_TTS_DEPLOYMENT}/audio/speech?api-version=${AZURE_TTS_API_VERSION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_TTS_KEY
            },
            body: JSON.stringify({
                model: AZURE_TTS_DEPLOYMENT,
                input: text,
                voice: voice || AZURE_TTS_VOICE
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erreur Azure TTS:', response.status, errorText);
            throw new Error(`Azure TTS API error: ${response.status}`);
        }
        
        res.setHeader('Content-Type', 'audio/mpeg');
        response.body.pipe(res);
        
    } catch (error) {
        console.error('Erreur speech:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
