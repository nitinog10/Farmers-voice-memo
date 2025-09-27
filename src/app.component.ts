import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { GeminiService } from './services/gemini.service';

type RecordingState = 'idle' | 'recording' | 'stopped';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class AppComponent {
  private sanitizer = inject(DomSanitizer);
  private geminiService = inject(GeminiService);

  recordingState = signal<RecordingState>('idle');
  permissionError = signal<string | null>(null);
  audioUrl = signal<string | null>(null);
  isTranscribing = signal(false);
  transcription = signal('');
  transcriptionError = signal('');
  copied = signal(false);

  isDrafting = signal(false);
  draft = signal('');
  draftError = signal('');

  safeAudioUrl = computed<SafeUrl | null>(() => 
    this.audioUrl() ? this.sanitizer.bypassSecurityTrustUrl(this.audioUrl()!) : null
  );

  recordButtonText = computed(() => {
    switch (this.recordingState()) {
      case 'idle':
        return 'Record';
      case 'recording':
        return 'Stop';
      case 'stopped':
        return 'Record Again';
    }
  });
  
  recordButtonClass = computed(() => {
     switch (this.recordingState()) {
      case 'idle':
      case 'stopped':
        return 'bg-green-600 hover:bg-green-700 focus:ring-green-300';
      case 'recording':
        return 'bg-red-600 hover:bg-red-700 focus:ring-red-300';
    }
  });

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  toggleRecording(): void {
    if (this.recordingState() === 'recording') {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private startRecording(): void {
    this.resetState();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          this.permissionError.set(null);
          this.mediaRecorder = new MediaRecorder(stream);
          this.mediaRecorder.ondataavailable = event => {
            this.audioChunks.push(event.data);
          };
          this.mediaRecorder.onstop = this.handleRecordingStop.bind(this);
          this.mediaRecorder.start();
          this.recordingState.set('recording');
        })
        .catch(err => {
          console.error('Error accessing microphone:', err);
          this.permissionError.set('Microphone access denied. Please enable it in your browser settings.');
        });
    } else {
      this.permissionError.set('Audio recording is not supported by your browser.');
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.recordingState() === 'recording') {
      this.mediaRecorder.stop();
      this.recordingState.set('stopped');
      // Stop all tracks on the stream to release the microphone
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  private async handleRecordingStop(): Promise<void> {
    const audioBlob = new Blob(this.audioChunks, { type: this.audioChunks[0]?.type || 'audio/webm' });
    const audioUrl = URL.createObjectURL(audioBlob);
    this.audioUrl.set(audioUrl);
    this.audioChunks = [];

    try {
      const base64Audio = await this.blobToBase64(audioBlob);
      this.isTranscribing.set(true);
      const result = await this.geminiService.transcribeAudio(base64Audio, audioBlob.type);
      this.transcription.set(result);
    } catch (error) {
      console.error('Transcription error:', error);
      this.transcriptionError.set('Sorry, we could not transcribe the audio. Please try again.');
    } finally {
      this.isTranscribing.set(false);
    }
  }
  
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
  }

  private resetState(): void {
    this.audioUrl.set(null);
    this.transcription.set('');
    this.transcriptionError.set('');
    this.isTranscribing.set(false);
    this.permissionError.set(null);
    this.copied.set(false);
    this.draft.set('');
    this.draftError.set('');
    this.isDrafting.set(false);
  }

  copyToClipboard(): void {
    if (this.transcription()) {
      navigator.clipboard.writeText(this.transcription()).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    }
  }

  async generateDraft(): Promise<void> {
    if (!this.transcription()) return;

    this.isDrafting.set(true);
    this.draft.set('');
    this.draftError.set('');

    try {
        const generatedDraft = await this.geminiService.generateDraft(this.transcription());
        this.draft.set(generatedDraft);
    } catch (error) {
        console.error('Draft generation error:', error);
        this.draftError.set('Sorry, we could not generate a draft. Please try again.');
    } finally {
        this.isDrafting.set(false);
    }
  }

  downloadDraft(): void {
    if (!this.draft()) return;

    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
          "xmlns:w='urn:schemas-microsoft-com:office:word' "+
          "xmlns='http://www.w3.org/TR/REC-html40'>"+
          "<head><meta charset='utf-8'><title>Farmer's Request Draft</title></head><body>";
    const footer = "</body></html>";
    // Replace newlines with <br> tags for line breaks in Word
    const formattedDraft = this.draft().replace(/\n/g, '<br>');
    const sourceHTML = header + formattedDraft + footer;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'farmers-request.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  }
}