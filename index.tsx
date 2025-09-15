/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import './visual-3d';
import { GoogleGenAI } from "@google/genai";

// FIX: Add comprehensive type definitions for Web Speech API to resolve TypeScript errors.
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
  item(index: number): SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

// Define SpeechRecognition for browsers that might prefix it.
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
    webkitAudioContext: typeof AudioContext;
  }
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = 'Click the record button to start talking.';
  @state() error = '';
  @state() userPrompt = '';
  @state() llmResponse = '';

  private inputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 24000});

  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();

  private mediaStream: MediaStream;
  private sourceNode: MediaStreamAudioSourceNode;

  private recognition: SpeechRecognition;
  private finalTranscript = '';

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
      padding: 0 10px;
    }

    .conversation {
      position: absolute;
      top: 5vh;
      left: 5vw;
      right: 5vw;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 1em;
      font-family: sans-serif;
      color: white;
      max-height: 40vh;
      overflow-y: auto;
    }
    .conversation > div {
      padding: 1em;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
    }
    .conversation .user-prompt {
      align-self: flex-end;
      background: rgba(100, 150, 255, 0.2);
    }
    .conversation .llm-response {
      align-self: flex-start;
    }
    .conversation strong {
      display: block;
      margin-bottom: 0.5em;
      opacity: 0.7;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    this.outputNode.connect(this.outputAudioContext.destination);
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.updateError('Speech Recognition API not supported in this browser.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      this.finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this.finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      this.userPrompt = this.finalTranscript + interimTranscript;
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        this.stopRecording();
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.updateError(`Speech recognition error: ${event.error}`);
    };
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = msg; // Also show error in status for visibility
  }

  private async getGeminiResponse(prompt: string) {
    this.updateStatus('Thinking...');
    this.llmResponse = '';
    try {
      // FIX: Use Gemini API instead of Ollama
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text;
      this.llmResponse = text;
      this.speakResponse(text);
    } catch (err) {
      console.error('Error calling Gemini:', err);
      this.updateError(
        `Error: Could not connect to Gemini.`,
      );
    }
  }

  private speakResponse(text: string) {
    if (!('speechSynthesis' in window)) {
      this.updateError('Speech Synthesis API not supported.');
      return;
    }
    this.updateStatus('Speaking...');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      this.updateStatus('Ready. Click record to speak.');
    };
    utterance.onerror = (event) => {
      this.updateError(`Speech synthesis error: ${event.error}`);
    };
    window.speechSynthesis.speak(utterance);
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      // Setup audio graph for visualizer
      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      // Start speech recognition
      if (this.recognition) {
        this.finalTranscript = '';
        this.userPrompt = '';
        this.llmResponse = '';
        this.recognition.start();
        this.isRecording = true;
        this.updateStatus('🔴 Recording... Speak now.');
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      if (this.isRecording) {
        this.stopRecording();
      }
    }
  }

  private stopRecording() {
    if (!this.isRecording) return;

    if (this.recognition) {
      this.recognition.stop();
    }
    this.isRecording = false;
    this.updateStatus('Stopping recording...');

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Processing...');

    const trimmedTranscript = this.finalTranscript.trim();
    if (trimmedTranscript) {
      this.userPrompt = trimmedTranscript;
      // FIX: Call getGeminiResponse instead of getOllamaResponse
      this.getGeminiResponse(trimmedTranscript);
    } else {
      this.updateStatus('No speech detected. Click record to try again.');
    }
  }

  private reset() {
    if (this.isRecording) {
      this.stopRecording();
    }
    window.speechSynthesis.cancel();
    this.finalTranscript = '';
    this.userPrompt = '';
    this.llmResponse = '';
    this.updateStatus('Session cleared. Click record to start.');
  }

  render() {
    return html`
      <div>
        <div class="conversation">
          ${
            this.userPrompt
              ? html` <div class="user-prompt">
                  <strong>You</strong>
                  ${this.userPrompt}
                </div>`
              : ''
          }
          ${
            this.llmResponse
              ? html` <div class="llm-response">
                  <strong>AI</strong>
                  ${this.llmResponse}
                </div>`
              : ''
          }
        </div>
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}
            title="Reset Session">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}
            title="Start Recording">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}
            title="Stop Recording">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#4A4A4A"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="15" y="15" width="70" height="70" rx="10" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error ? this.error : this.status} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
