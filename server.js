require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

const AZURE_REALTIME_ENDPOINT = process.env.AZURE_REALTIME_ENDPOINT;
const AZURE_REALTIME_KEY = process.env.AZURE_REALTIME_KEY;
const AZURE_REALTIME_DEPLOYMENT = process.env.AZURE_REALTIME_DEPLOYMENT || 'gpt-realtime';

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

app.post('/api/realtime', async (req, res) => {
    try {
        const { messages, voice } = req.body;
        
        if (!AZURE_REALTIME_ENDPOINT || !AZURE_REALTIME_KEY) {
            throw new Error('Realtime API not configured');
        }
        
        const userMessage = messages[messages.length - 1]?.content || '';
        const conversationContext = messages.slice(0, -1).map(m => 
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n');
        
        const wsUrl = `${AZURE_REALTIME_ENDPOINT}?api-version=2024-10-01-preview&deployment=${AZURE_REALTIME_DEPLOYMENT}`;
        
        const ws = new WebSocket(wsUrl, {
            headers: {
                'api-key': AZURE_REALTIME_KEY
            }
        });
        
        const audioChunks = [];
        let textResponse = '';
        let sessionConfigured = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Timeout' });
            }
        }, 30000);
        
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: 'Tu es un assistant virtuel sympathique et serviable. Réponds de manière naturelle et conversationnelle en français. Garde tes réponses courtes et concises (2-3 phrases maximum).' + (conversationContext ? '\n\nContexte de la conversation:\n' + conversationContext : ''),
                    voice: voice || 'alloy',
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    turn_detection: null
                }
            }));
        });
        
        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                
                if (event.type === 'session.created' || event.type === 'session.updated') {
                    if (!sessionConfigured) {
                        sessionConfigured = true;
                        ws.send(JSON.stringify({
                            type: 'conversation.item.create',
                            item: {
                                type: 'message',
                                role: 'user',
                                content: [{
                                    type: 'input_text',
                                    text: userMessage
                                }]
                            }
                        }));
                        ws.send(JSON.stringify({
                            type: 'response.create'
                        }));
                    }
                }
                
                if (event.type === 'response.audio.delta') {
                    audioChunks.push(Buffer.from(event.delta, 'base64'));
                }
                
                if (event.type === 'response.audio_transcript.delta') {
                    textResponse += event.delta;
                }
                
                if (event.type === 'response.done') {
                    clearTimeout(timeout);
                    ws.close();
                    
                    const audioBuffer = Buffer.concat(audioChunks);
                    
                    res.json({
                        message: textResponse,
                        audio: audioBuffer.toString('base64'),
                        format: 'pcm16'
                    });
                }
                
                if (event.type === 'error') {
                    console.error('Realtime API error:', event.error);
                    clearTimeout(timeout);
                    ws.close();
                    if (!res.headersSent) {
                        res.status(500).json({ error: event.error?.message || 'Realtime API error' });
                    }
                }
            } catch (e) {
                console.error('Error parsing realtime message:', e);
            }
        });
        
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            clearTimeout(timeout);
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });
        
        ws.on('close', () => {
            clearTimeout(timeout);
        });
        
    } catch (error) {
        console.error('Erreur realtime:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/realtime-voice', async (req, res) => {
    try {
        const { audio, voice, context } = req.body;
        
        if (!audio) {
            return res.status(400).json({ error: 'No audio data provided' });
        }
        
        if (!AZURE_REALTIME_ENDPOINT || !AZURE_REALTIME_KEY) {
            throw new Error('Realtime API not configured');
        }
        
        const wsUrl = `${AZURE_REALTIME_ENDPOINT}?api-version=2024-10-01-preview&deployment=${AZURE_REALTIME_DEPLOYMENT}`;
        
        const ws = new WebSocket(wsUrl, {
            headers: {
                'api-key': AZURE_REALTIME_KEY
            }
        });
        
        const audioChunks = [];
        let textResponse = '';
        let transcription = '';
        let sessionConfigured = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Timeout' });
            }
        }, 30000);
        
        console.log('Received PCM16 audio, base64 length:', audio.length);
        
        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: 'Tu es un assistant virtuel sympathique et serviable. Réponds de manière naturelle et conversationnelle en français. Garde tes réponses courtes et concises (2-3 phrases maximum).' + (context ? '\n\nContexte de la conversation:\n' + context : ''),
                    voice: voice || 'alloy',
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'whisper-1'
                    },
                    turn_detection: null
                }
            }));
        });
        
        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                
                if (event.type === 'session.created' || event.type === 'session.updated') {
                    if (!sessionConfigured) {
                        sessionConfigured = true;
                        
                        console.log('Sending PCM16 audio to API...');
                        
                        ws.send(JSON.stringify({
                            type: 'input_audio_buffer.append',
                            audio: audio
                        }));
                        
                        ws.send(JSON.stringify({
                            type: 'input_audio_buffer.commit'
                        }));
                        
                        ws.send(JSON.stringify({
                            type: 'response.create'
                        }));
                    }
                }
                
                if (event.type === 'conversation.item.input_audio_transcription.completed') {
                    transcription = event.transcript;
                    console.log('Transcription received:', transcription);
                }
                
                if (event.type === 'response.audio.delta') {
                    audioChunks.push(Buffer.from(event.delta, 'base64'));
                }
                
                if (event.type === 'response.audio_transcript.delta') {
                    textResponse += event.delta;
                }
                
                if (event.type === 'response.done') {
                    clearTimeout(timeout);
                    ws.close();
                    
                    const audioBuffer = Buffer.concat(audioChunks);
                    
                    res.json({
                        transcription: transcription,
                        message: textResponse,
                        audio: audioBuffer.toString('base64'),
                        format: 'pcm16'
                    });
                }
                
                if (event.type === 'error') {
                    console.error('Realtime API error:', event.error);
                    clearTimeout(timeout);
                    ws.close();
                    if (!res.headersSent) {
                        res.status(500).json({ error: event.error?.message || 'Realtime API error' });
                    }
                }
            } catch (e) {
                console.error('Error parsing realtime message:', e);
            }
        });
        
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            clearTimeout(timeout);
            if (!res.headersSent) {
                res.status(500).json({ error: err.message });
            }
        });
        
        ws.on('close', () => {
            clearTimeout(timeout);
        });
        
    } catch (error) {
        console.error('Erreur realtime-voice:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
