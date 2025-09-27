import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private genAI: GoogleGenAI;

  constructor() {
    // This is a placeholder for a secure API key handling mechanism.
    // In a real-world application, this should not be hardcoded.
    // The Applet environment provides process.env.API_KEY.
    const apiKey = (process.env as any).API_KEY || 'demo-key';
    if (!apiKey || apiKey === 'demo-key') {
      console.warn('API_KEY not found in environment variables. Using demo mode.');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    if (!audioBase64) {
      throw new Error('Audio data is empty.');
    }
    
    try {
      const audioPart = {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64,
        },
      };

      const textPart = {
        text: 'Transcribe the following audio recording of a farmer\'s request. The audio may contain background noise from a farm. Provide a clean, accurate transcription of the spoken words.',
      };
      
      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, audioPart] }
      });

      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      // Provide a more user-friendly error message
      if (error instanceof Error && error.message.includes('API key not valid')) {
          throw new Error('The provided API key is not valid. Please check your configuration.');
      }
      throw new Error('Failed to communicate with the AI model.');
    }
  }

  async generateDraft(transcription: string): Promise<string> {
    if (!transcription) {
      throw new Error('Transcription is empty.');
    }

    try {
      const prompt = `Based on the following transcription of a farmer's request, please format it into a clear and concise formal request. Structure it clearly with paragraphs, correct any grammatical errors, and ensure the tone is appropriate for a formal document. Do not add any information that is not present in the transcription.\n\nTranscription:\n"${transcription}"`;

      const response = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API for drafting:', error);
      if (error instanceof Error && error.message.includes('API key not valid')) {
          throw new Error('The provided API key is not valid. Please check your configuration.');
      }
      throw new Error('Failed to communicate with the AI model for draft generation.');
    }
  }
}