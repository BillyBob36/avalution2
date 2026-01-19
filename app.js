class AvatarController {
    constructor() {
        this.img = document.getElementById('avatarImg');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.qualitySelect = document.getElementById('qualitySelect');
        this.silenceThresholdInput = document.getElementById('silenceThreshold');
        this.silenceValueLabel = document.getElementById('silenceValue');
        this.voiceSelect = document.getElementById('voiceSelect');
        
        this.FPS = 30;
        this.minSilenceDuration = 0.7;
        this.selectedVoice = 'alloy';
        this.FRAME_COUNT = 150;
        this.FRAME_DURATION = 1000 / this.FPS;
        this.VIDEO_DURATION = 5.0;
        this.KEYFRAME_INTERVAL = 0.5;
        this.KEYFRAMES_PER_INTERVAL = 15;
        
        this.quality = 'demi';
        
        this.idleFrames = [];
        this.speakFrames = [];
        
        this.currentMode = 'idle';
        this.currentFrame = 0;
        this.playDirection = 1;
        this.isPlaying = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        
        this.isHalfAccordion = false;
        this.pendingAudio = null;
        this.preparedAudio = null;
        this.conversationHistory = [];
        
        this.silenceSegments = [];
        this.audioStartTime = 0;
        
        this.init();
    }
    
    async init() {
        await this.preloadFrames();
        
        this.sendButton.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
        
        this.qualitySelect.addEventListener('change', () => {
            this.changeQuality(this.qualitySelect.value);
        });
        
        this.silenceThresholdInput.addEventListener('input', () => {
            this.minSilenceDuration = parseFloat(this.silenceThresholdInput.value);
            this.silenceValueLabel.textContent = this.minSilenceDuration.toFixed(1);
        });
        
        this.voiceSelect.addEventListener('change', () => {
            this.selectedVoice = this.voiceSelect.value;
        });
        
        this.showFrame(0);
        this.startAccordionLoop();
    }
    
    async preloadFrames() {
        const loadImage = (src) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        };
        
        const promises = [];
        
        for (let i = 0; i < this.FRAME_COUNT; i++) {
            const frameNum = i.toString().padStart(4, '0');
            promises.push(loadImage(`frames/idle/${this.quality}/frame_${frameNum}.jpg`));
            promises.push(loadImage(`frames/speek/${this.quality}/frame_${frameNum}.jpg`));
        }
        
        const results = await Promise.all(promises);
        
        for (let i = 0; i < this.FRAME_COUNT; i++) {
            this.idleFrames.push(results[i * 2]);
            this.speakFrames.push(results[i * 2 + 1]);
        }
        
        console.log(`Préchargé ${this.idleFrames.length} frames idle et ${this.speakFrames.length} frames speak (${this.quality})`);
    }
    
    async changeQuality(newQuality) {
        if (newQuality === this.quality) return;
        
        this.quality = newQuality;
        this.idleFrames = [];
        this.speakFrames = [];
        
        const savedFrame = this.currentFrame;
        const savedMode = this.currentMode;
        
        await this.preloadFrames();
        
        this.currentFrame = Math.min(savedFrame, this.FRAME_COUNT - 1);
        this.currentMode = savedMode;
        this.showFrame(this.currentFrame);
    }
    
    getFrames() {
        return this.currentMode === 'idle' ? this.idleFrames : this.speakFrames;
    }
    
    showFrame(frameIndex) {
        const frames = this.getFrames();
        const frame = frames[frameIndex];
        if (frame) {
            this.img.src = frame.src;
        }
        this.currentFrame = frameIndex;
    }
    
    startAccordionLoop() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        this.playDirection = 1;
        this.currentFrame = 0;
        this.showFrame(0);
        this.animate();
    }
    
    animate() {
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        
        if (elapsed >= this.FRAME_DURATION) {
            this.lastFrameTime = now - (elapsed % this.FRAME_DURATION);
            
            let nextFrame = this.currentFrame + this.playDirection;
            
            const maxFrame = this.isHalfAccordion ? Math.floor(this.FRAME_COUNT / 2) - 1 : this.FRAME_COUNT - 1;
            
            if (this.playDirection === 1 && nextFrame > maxFrame) {
                nextFrame = maxFrame;
                this.playDirection = -1;
            } else if (this.playDirection === -1 && nextFrame < 0) {
                nextFrame = 0;
                this.playDirection = 1;
                
                if (this.pendingAudio) {
                    this.playPendingAudio();
                    return;
                }
                
                if (this.switchToHalfAccordionPending) {
                    this.isHalfAccordion = true;
                    this.switchToHalfAccordionPending = false;
                }
            }
            
            this.showFrame(nextFrame);
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    getNearestKeyframe(time) {
        const keyframeIndex = Math.round(time / this.KEYFRAME_INTERVAL);
        return Math.min(keyframeIndex * this.KEYFRAME_INTERVAL, this.VIDEO_DURATION);
    }
    
    getFrameFromTime(time) {
        return Math.min(Math.floor(time * this.FPS), this.FRAME_COUNT - 1);
    }
    
    returnToStart(callback) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.currentFrame <= 0) {
            if (callback) callback();
            return;
        }
        
        this.playDirection = -1;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        
        const animateReturn = () => {
            const now = performance.now();
            const elapsed = now - this.lastFrameTime;
            
            if (elapsed >= this.FRAME_DURATION) {
                this.lastFrameTime = now;
                
                let nextFrame = this.currentFrame - 1;
                
                if (nextFrame <= 0) {
                    this.showFrame(0);
                    this.isPlaying = false;
                    if (callback) callback();
                    return;
                }
                
                this.showFrame(nextFrame);
            }
            
            this.animationFrameId = requestAnimationFrame(animateReturn);
        };
        
        animateReturn();
    }
    
    switchToMode(mode, callback) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.returnToStart(() => {
            this.currentMode = mode;
            this.currentFrame = 0;
            this.playDirection = 1;
            this.showFrame(0);
            if (callback) callback();
        });
    }
    
    startSpeakMode() {
        if (this.currentMode === 'speak') return;
        this.switchToMode('speak', () => this.startAccordionLoop());
    }
    
    startIdleMode() {
        if (this.currentMode === 'idle') return;
        this.isHalfAccordion = false;
        this.switchToMode('idle', () => this.startAccordionLoop());
    }
    
    enableHalfAccordion() {
        this.switchToHalfAccordionPending = true;
    }
    
    async handleSend() {
        const message = this.userInput.value.trim();
        if (!message) return;
        
        this.userInput.value = '';
        this.sendButton.disabled = true;
        
        this.enableHalfAccordion();
        
        try {
            this.conversationHistory.push({ role: 'user', content: message });
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: this.conversationHistory })
            });
            
            if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
            
            const data = await response.json();
            this.conversationHistory.push({ role: 'assistant', content: data.message });
            
            const audioBlob = await this.generateSpeech(data.message);
            this.pendingAudio = audioBlob;
            this.prepareAudio(audioBlob);
            
        } catch (error) {
            console.error('Erreur:', error);
            this.sendButton.disabled = false;
            this.isHalfAccordion = false;
        }
    }
    
    async generateSpeech(text) {
        const response = await fetch('/api/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: this.selectedVoice })
        });
        
        if (!response.ok) throw new Error(`Erreur génération vocale: ${response.status}`);
        return await response.blob();
    }
    
    async prepareAudio(audioBlob) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const silenceSegments = this.detectSilenceSegments(audioBuffer);
            const timeline = this.buildAnimationTimeline(audioBuffer.duration, silenceSegments);
            
            this.preparedAudio = {
                context: audioContext,
                buffer: audioBuffer,
                timeline: timeline
            };
            
            console.log('Timeline pré-calculée:', timeline);
        } catch (error) {
            console.error('Erreur préparation audio:', error);
            this.pendingAudio = null;
            this.preparedAudio = null;
            this.sendButton.disabled = false;
            this.isHalfAccordion = false;
        }
    }
    
    detectSilenceSegments(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const segments = [];
        
        const windowSize = Math.floor(sampleRate * 0.05);
        const silenceThreshold = 0.02;
        const minSilenceDuration = this.minSilenceDuration;
        
        let silenceStart = null;
        let lastSoundTime = 0;
        
        for (let i = 0; i < channelData.length; i += windowSize) {
            let sum = 0;
            const end = Math.min(i + windowSize, channelData.length);
            
            for (let j = i; j < end; j++) {
                sum += Math.abs(channelData[j]);
            }
            
            const average = sum / (end - i);
            const currentTime = i / sampleRate;
            
            if (average < silenceThreshold) {
                if (silenceStart === null) silenceStart = currentTime;
            } else {
                lastSoundTime = currentTime + (windowSize / sampleRate);
                if (silenceStart !== null) {
                    const silenceDuration = currentTime - silenceStart;
                    if (silenceDuration >= minSilenceDuration) {
                        segments.push({ start: silenceStart, end: currentTime });
                    }
                    silenceStart = null;
                }
            }
        }
        
        if (silenceStart !== null) {
            const audioDuration = channelData.length / sampleRate;
            const silenceDuration = audioDuration - silenceStart;
            if (silenceDuration >= minSilenceDuration) {
                segments.push({ start: silenceStart, end: audioDuration });
            }
        }
        
        this.lastSoundTime = lastSoundTime;
        return segments;
    }
    
    buildAnimationTimeline(audioDuration, silenceSegments) {
        const timeline = [];
        let currentTime = 0;
        
        const effectiveEndTime = this.lastSoundTime || audioDuration;
        
        for (const silence of silenceSegments) {
            if (silence.start > currentTime) {
                timeline.push(this.createSegment('speak', currentTime, silence.start));
            }
            timeline.push(this.createSegment('idle', silence.start, silence.end));
            currentTime = silence.end;
        }
        
        if (currentTime < effectiveEndTime) {
            timeline.push(this.createSegment('speak', currentTime, effectiveEndTime));
        }
        
        console.log('Audio duration:', audioDuration, 'Last sound:', effectiveEndTime);
        return timeline;
    }
    
    createSegment(mode, startTime, endTime) {
        const duration = endTime - startTime;
        const totalFramesAvailable = duration * this.FPS;
        
        const fullAccordionFrames = this.FRAME_COUNT * 2;
        const fullCycles = Math.floor(totalFramesAvailable / fullAccordionFrames);
        
        let totalCycles;
        if (fullCycles === 0) {
            totalCycles = 1;
        } else {
            const remainingFrames = totalFramesAvailable - (fullCycles * fullAccordionFrames);
            totalCycles = (remainingFrames >= this.FPS) ? fullCycles + 1 : fullCycles;
            if (totalCycles === 0) totalCycles = 1;
        }
        
        const framesPerCycle = totalFramesAvailable / totalCycles;
        let maxFrame = framesPerCycle / 2;
        
        maxFrame = Math.min(maxFrame, this.FRAME_COUNT - 1);
        maxFrame = Math.max(maxFrame, 1);
        
        return {
            mode: mode,
            startTime: startTime,
            endTime: endTime,
            duration: duration,
            maxFrame: maxFrame,
            totalCycles: totalCycles,
            framesPerCycle: framesPerCycle
        };
    }
    
    playPendingAudio() {
        if (!this.preparedAudio) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
            return;
        }
        
        this.pendingAudio = null;
        this.isHalfAccordion = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        const { context: audioContext, buffer: audioBuffer, timeline } = this.preparedAudio;
        this.preparedAudio = null;
        this.timeline = timeline;
        this.audioDuration = audioBuffer.duration;
        this.currentSegmentIndex = 0;
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        
        this.audioStartTime = audioContext.currentTime;
        this.isPlaying = true;
        
        if (this.timeline.length > 0) {
            const firstSegment = this.timeline[0];
            this.currentMode = firstSegment.mode;
            this.currentMaxFrame = firstSegment.maxFrame;
        }
        
        this.currentFrame = 0;
        this.playDirection = 1;
        this.showFrame(0);
        this.lastFrameTime = performance.now();
        
        source.start(0);
        this.animateWithTimeline(audioContext);
        
        source.onended = () => {
            audioContext.close();
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.currentFrame = 0;
            this.playDirection = 1;
            this.currentMode = 'idle';
            this.showFrame(0);
            this.isPlaying = false;
            this.startAccordionLoop();
            this.sendButton.disabled = false;
        };
    }
    
    animateWithTimeline(audioContext) {
        const audioElapsed = audioContext.currentTime - this.audioStartTime;
        
        if (audioElapsed >= this.audioDuration) {
            return;
        }
        
        const currentSegment = this.getCurrentSegment(audioElapsed);
        if (!currentSegment) {
            return;
        }
        
        if (currentSegment.mode !== this.currentMode) {
            this.currentMode = currentSegment.mode;
            this.currentMaxFrame = currentSegment.maxFrame;
            this.currentFramesPerCycle = currentSegment.framesPerCycle;
        }
        
        const timeInSegment = audioElapsed - currentSegment.startTime;
        const framesInSegment = timeInSegment * this.FPS;
        
        const positionInAccordion = framesInSegment % currentSegment.framesPerCycle;
        const halfCycle = currentSegment.framesPerCycle / 2;
        
        let frameToShow;
        if (positionInAccordion < halfCycle) {
            frameToShow = Math.floor((positionInAccordion / halfCycle) * currentSegment.maxFrame);
        } else {
            const returnPosition = positionInAccordion - halfCycle;
            frameToShow = Math.floor(currentSegment.maxFrame - (returnPosition / halfCycle) * currentSegment.maxFrame);
        }
        
        frameToShow = Math.max(0, Math.min(frameToShow, Math.floor(currentSegment.maxFrame)));
        
        if (frameToShow !== this.currentFrame) {
            this.currentFrame = frameToShow;
            this.showFrame(frameToShow);
        }
        
        this.animationFrameId = requestAnimationFrame(() => {
            this.animateWithTimeline(audioContext);
        });
    }
    
    getCurrentSegment(audioElapsed) {
        for (const segment of this.timeline) {
            if (audioElapsed >= segment.startTime && audioElapsed < segment.endTime) {
                return segment;
            }
        }
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AvatarController();
});
