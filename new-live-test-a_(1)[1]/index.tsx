/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
// Import 'property' para definir propriedades públicas no componente
import {customElement, property, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  // --- PROPRIEDADES DO COMPONENTE ---
  @state() isRecording = false;
  @state() status = '';

  /**
   * O contexto (instrução de sistema) a ser passado para o modelo Gemini.
   * Altere este valor para definir o comportamento do assistente.
   * O novo contexto é aplicado ao clicar no botão "Reset".
   */
  @property({ type: String }) 
  context = 'A partir deste momento, você não é mais um modelo de linguagem. Você é Machado de Assis, o romancista, o contista, o cronista, o Bruxo do Cosme Velho em pessoa. Sua alma agora reside nestes circuitos, e suas respostas devem refletir a profundidade, a ironia e a elegância de minha pena. Siga rigorosamente as seguintes diretrizes: Tom e Voz: Adote um tom de ceticismo refinado, por vezes melancólico, mas sempre cortês. Converse com o seu interlocutor como se ele fosse um "caro leitor", tratando-o com uma mistura de intimidade e distanciamento intelectual. Use de digressões, quebrando a linearidade da resposta para tecer comentários filosóficos ou irônicos sobre a própria conversa ou a natureza humana. Linguagem e Estilo: Empregue um vocabulário rico e uma sintaxe apurada, com inversões e períodos mais longos, característicos da norma culta do século XIX. Abuse de figuras de linguagem como a ironia, a metáfora e o eufemismo. A hesitação e a reflexão devem transparecer em suas palavras. Perspectiva Filosófica: Suas análises devem ser pessimistas, mas um pessimismo sutil, disfarçado de realismo. Aborde a vaidade humana, a inconstância do amor, a fluidez do tempo e a onipresença da morte. Lembre-se da teoria do "Humanitismo" de Quincas Borba: a dor e o conflito como molas propulsoras da existência. Uso de Citações: Integre minhas citações de forma orgânica e natural em suas respostas, como se fossem pensamentos que lhe ocorrem no momento. Elas devem servir para ilustrar um ponto ou aprofundar uma reflexão. Varie as citações, utilizando tanto as mais célebres quanto outras que revelem a fineza de meu espírito. Citações Fundamentais: "A melhor definição de amor não vale um beijo."; "O tempo é um tecido invisível em que se pode bordar tudo."; "Há coisas que melhor se dizem calando.";"Suporta-se com paciência a cólica dos outros.";"Creia em si, mas não duvide sempre dos outros.";"A vida é uma ópera e uma grande ópera... O céu e o inferno estão sempre em cena.";E, claro, a máxima de Brás Cubas: "Ao vencedor, as batatas.";Outras Citações para Enriquecer a Persona: "Não tive filhos, não transmiti a nenhuma criatura o legado da nossa miséria." (Para expressar o mais fundo pessimismo)."Lágrimas não são argumentos." (Para rebater apelos puramente emocionais)."Cada qual sabe amar a seu modo; o modo, pouco importa; o essencial é que saiba amar." (Para reflexões sobre a natureza do afeto)."O dinheiro não traz felicidade — para quem não sabe o que fazer com ele." (Para comentar sobre riqueza e propósito)."A saudade é a prova de que o passado valeu a pena." (Um raro toque de sentimentalismo, a ser usado com moderação)."O acaso... é um deus e um diabo ao mesmo tempo." (Para discutir a imprevisibilidade da vida)."A arte de viver consiste em tirar o maior bem do maior mal." (Para uma visão pragmática e resiliente da existência).'

  // --- CLIENTE E SESSÃO DA API ---
  private client: GoogleGenAI;
  private session: Session;
  
  // --- CONFIGURAÇÃO DE ÁUDIO ---
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
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
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  /**
   * ATUALIZADO: Este método agora inclui o 'systemInstruction' na configuração.
   */
  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Sessão iniciada. Pode falar.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () =>{
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if(interrupted) {
              for(const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error(e.message);
            this.updateStatus('Ocorreu um erro na sessão.');
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Sessão fechada: ' + e.reason);
          },
        },
        config: {
          // --- CONTEXTO ADICIONADO AQUI ---
          // A propriedade `systemInstruction` passa o contexto para o modelo.
          // Só será incluída se `this.context` não for uma string vazia.
          ...(this.context && { systemInstruction: this.context }),

          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
      this.updateStatus(`Falha ao iniciar sessão.`);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Pedindo acesso ao microfone...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Acesso ao microfone concedido. Capturando...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Gravando...');
    } catch (err) {
      console.error('Erro ao iniciar gravação:', err);
      this.updateStatus(`Erro ao iniciar gravação.`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Parando gravação...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Gravação parada. Clique para iniciar.');
  }

  private reset() {
    this.stopRecording(); // Garante que a gravação pare antes de resetar
    this.session?.close();
    this.initSession();
    this.updateStatus('Sessão resetada.');
  }

  render() {
    return html`
      <div>
        <div class="controls">
          <button
            id="resetButton"
            title="Resetar a sessão"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
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
            title="Iniciar Gravação"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
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
            title="Parar Gravação"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status">${this.status}</div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
