class AudioRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        
        this.port.onmessage = (event) => {
            if (event.data.command === 'start') {
                this.isRecording = true;
            } else if (event.data.command === 'stop') {
                this.isRecording = false;
            }
        };
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        
        if (this.isRecording && input && input[0]) {
            const channelData = input[0];
            this.port.postMessage({
                audioData: channelData.slice()
            });
        }
        
        return true;
    }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
