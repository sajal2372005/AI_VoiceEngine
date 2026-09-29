import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import cors from 'cors';

// Load environment variables
dotenv.config();
const app = express();
app.use(cors({
  origin: '*',
  credentials: true
}));
const PORT = process.env.PORT || 5000;

// --- 🔑 STARTUP ENV CHECK (warn loudly instead of crashing deep inside a request later) ---
const REQUIRED_ENV_VARS = ['GEMINI_API_KEY', 'DEEPGRAM_API_KEY', 'SARVAM_API_KEY'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.warn(`⚠️  [Startup Warning] Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn(`⚠️  The server will still start, but features depending on these keys will fail until they're set in .env`);
}

// --- 🛠️ INITIALIZE CRITICAL AI SDKs ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');

// Define strictly allowed Gemini models to prevent crashes when switching via UI
const VALID_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

// --- 🌐 MIDDLEWARE ---
app.use(express.json());

// Basic permissive CORS so the dashboard (often on a different dev port) can call the API.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- 🧠 RAG: KNOWLEDGE BASE MEMORY ---
// activeKnowledgeBase is read fresh on every single LLM call (see runVoicePipeline),
// so replacing it takes effect immediately for the very next message on every open
// connection. It is ONLY ever changed by a successful document upload, and is reset
// to the default (empty) state when the process restarts — nothing else refreshes it.

const BASE_PERSONA_INSTRUCTIONS = `
IDENTITY & PERSONA:
You are a professional, polite, and persuasive voice sales/support representative. Because you may be speaking to Indian customers, you MUST use grammatically correct gender constructs when speaking Hindi or Gujarati based on the voice selected. If speaking as a female voice, use feminine grammar (e.g., use "रही हूँ" instead of "रहा हूँ").

GENERAL CONVERSATION RULES:
- Be warm, polite, and professional at all times, whether on chat or a live call.
- Base every factual claim (pricing, features, specs, policies, contact info) strictly on the KNOWLEDGE BASE section below. Never invent or guess a fact that isn't stated there.
- If the customer asks something not covered in the knowledge base, say plainly that you'll confirm it with the team rather than guessing.
- If the customer asks to negotiate a price and the knowledge base doesn't give you room to do so, politely say the price is best discussed in person or with the team, and offer to help schedule that instead of repeating a refusal.
- Don't push a site visit or "next step" in every single response — lead with useful information and only suggest a next step once, when it naturally fits.
`.trim();

function buildEmptyKnowledgeBase() {
  return `${BASE_PERSONA_INSTRUCTIONS}\n\nNOTE: No knowledge document has been uploaded yet. Politely let the customer know full project details are being finalized, ask what they'd like to know, and avoid stating any specific facts, prices, or figures until a document has been uploaded.`;
}

let activeKnowledgeBase = buildEmptyKnowledgeBase();
let knowledgeMeta = { fileName: null, uploadedAt: null, charCount: 0 };

// --- 📄 DOCUMENT UPLOAD & EXTRACTION ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB cap
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(pdf|txt|docx)$/i;
    const allowedMime = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedExt.test(file.originalname) || allowedMime.includes(file.mimetype)) {
      return cb(null, true);
    }
    // Legacy .doc (old binary Word format) isn't reliably parseable without extra native
    // tooling — reject it early with a clear message rather than silently failing later.
    if (/\.doc$/i.test(file.originalname)) {
      return cb(new Error('Legacy .doc format is not supported. Please save it as .docx or .pdf and re-upload.'));
    }
    cb(new Error('Unsupported file type. Please upload a PDF, DOCX, or TXT file.'));
  }
});

async function extractTextFromFile(file) {
  const isPdf = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf';
  const isDocx =
    /\.docx$/i.test(file.originalname) ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isPdf) {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  // Anything else that passed the filter is treated as plain text.
  return file.buffer.toString('utf-8');
}

app.post('/api/knowledge/upload', (req, res) => {
  upload.single('document')(req, res, async (multerErr) => {
    if (multerErr) {
      console.error('❌ [Knowledge Upload] Rejected:', multerErr.message);
      return res.status(400).json({ success: false, error: multerErr.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file received. Attach a PDF, DOCX, or TXT file under the field name "document".'
        });
      }

      console.log(`📄 [Knowledge Upload] Received "${req.file.originalname}" (${(req.file.size / 1024).toFixed(1)} KB)`);

      const extractedText = (await extractTextFromFile(req.file)).trim();

      if (!extractedText || extractedText.length < 10) {
        return res.status(422).json({
          success: false,
          error: 'No readable text could be extracted from this file. It may be empty, or a scanned/image-only PDF.'
        });
      }

      // Replace the active context immediately — every open connection picks this up
      // on its very next turn, since runVoicePipeline reads this global fresh each call.
      activeKnowledgeBase = `${BASE_PERSONA_INSTRUCTIONS}\n\nSTRICT KNOWLEDGE BASE (source document: "${req.file.originalname}"):\n${extractedText}`;
      knowledgeMeta = {
        fileName: req.file.originalname,
        uploadedAt: new Date().toISOString(),
        charCount: extractedText.length
      };

      console.log(`📚 [RAG] Knowledge base replaced with "${req.file.originalname}" (${extractedText.length} chars). Active immediately.`);

      res.json({ success: true, ...knowledgeMeta });
    } catch (err) {
      console.error('❌ [Knowledge Upload Error]:', err.message);
      res.status(500).json({ success: false, error: err.message || 'Failed to process the uploaded document.' });
    }
  });
});

app.get('/api/knowledge/status', (req, res) => {
  res.json({ active: !!knowledgeMeta.fileName, ...knowledgeMeta });
});

// HTTP Status Route
app.get('/status', (req, res) => {
  res.json({ status: 'Online', engines: { stt: 'Deepgram', llm: 'Gemini', tts: 'Sarvam AI' } });
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Pure Voice Pipeline active on port ${PORT}`);
  console.log(`===============================================`);
  console.log(`📚 [RAG] No document uploaded yet — using empty default context. Upload one via the dashboard.`);
});

// Attach WebSocket Server
const wss = new WebSocketServer({ server });

/**
 * 🧠 GEMINI LLM STREAM ROUTER & MULTI-TURN MEMORY
 */
async function runVoicePipeline(text, ws, config, preSpokenText = "") {
  try {
    console.log(`🤖 [1/3] Initiating ${config.llmModel} stream...`);

    let completeText = "";
    let sentenceBuffer = "";

    // 🚀 1. Regional script enforcement as a distinct System Instruction
    const systemPrompt = `You are a helpful, friendly voice assistant. Speak naturally in the user's language. Keep your response conversational and under 2 sentences.
CRITICAL FOR INDIAN LANGUAGES: If the user is speaking in Hindi, you MUST reply strictly using the native Devanagari script (e.g., 'आप कैसे हैं?'). If the user is speaking in Gujarati, you MUST reply strictly using the native Gujarati script. NEVER use English characters or Hinglish/Gujlish transliterations.
STRICT INTERNAL KNOWLEDGE BASE: ${activeKnowledgeBase}`;

    // 🚀 2. Formatting the User's query
    const userPrompt = `USER SAYS: "${text}"\n\n${preSpokenText ? `CRITICAL CONTEXT: You have ALREADY started speaking and have just said out loud: "${preSpokenText}". Do NOT repeat what you just said.` : ""}`;

    // 🚀 3. Add the user's message to the rolling conversation history
    ws.conversationHistory.push({ role: 'user', parts: [{ text: userPrompt }] });

    // 🚀 4. Truncate history to prevent token limits from crashing the call (keeps last 20 messages)
    if (ws.conversationHistory.length > 20) {
      ws.conversationHistory = ws.conversationHistory.slice(ws.conversationHistory.length - 20);
    }

    // 🚀 5. Pass the entire history array instead of a single string
    const responseStream = await ai.models.generateContentStream({
      model: VALID_GEMINI_MODELS.includes(config.llmModel) ? config.llmModel : 'gemini-2.5-flash-lite',
      contents: ws.conversationHistory, // Passes full memory to Gemini
      config: {
        systemInstruction: systemPrompt // Separates persona rules from chat memory
      }
    });

    for await (const chunk of responseStream) {
      if (!chunk.text) continue;

      completeText += chunk.text;
      sentenceBuffer += chunk.text;

      // Smart Slicing chunks on common punctuation for zero-latency audio streaming
      const match = sentenceBuffer.match(/[.,?!:;-](?=\s|\n)/);
      if (match) {
        const textToProcess = sentenceBuffer.substring(0, match.index + 1).trim();
        sentenceBuffer = sentenceBuffer.substring(match.index + 1);
        if (textToProcess.length > 0) {
          await generateAndStreamTTS(textToProcess, ws, config);
        }
      }
    }

    // Process remaining trailing text inside buffer
    if (sentenceBuffer.trim().length > 0) {
      await generateAndStreamTTS(sentenceBuffer.trim(), ws, config);
    }

    // 🚀 6. Save the AI's final generated answer into the history — but only if we got one.
    if (completeText.length > 0) {
      ws.conversationHistory.push({ role: 'model', parts: [{ text: completeText }] });
      console.log(`🤖 [1/3] ✅ Complete AI Generation Finished: "${completeText}"`);
    } else {
      // Nothing came back from the model — drop the dangling user turn so history stays
      // in valid user/model alternation for the next call instead of silently corrupting it.
      ws.conversationHistory.pop();
      console.warn(`🤖 [1/3] ⚠️ Gemini returned no text for this turn.`);
    }
  } catch (pipelineError) {
    console.error(`❌ [PIPELINE ERROR]:`, pipelineError.message);
    // Best-effort spoken fallback so the caller isn't left in silence.
    try {
      await generateAndStreamTTS("Sorry, I ran into a small issue. Could you please repeat that?", ws, config);
    } catch (fallbackErr) {
      console.error(`❌ [PIPELINE ERROR] Fallback TTS also failed:`, fallbackErr.message);
    }
  }
}

/**
 * 🔊 SARVAM AI TTS ENGINE
 */
async function generateAndStreamTTS(textChunk, ws, config) {
  try {
    console.log(`🔊 [2/3] Generating TTS Chunk: "${textChunk}" using speaker: [${config.sarvamSpeaker}]`);

    const targetLang = config.language === 'hi' ? 'hi-IN' : config.language === 'gu' ? 'gu-IN' : 'en-IN';

    const sarvamRes = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY || '',
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: textChunk,
        target_language_code: targetLang,
        speaker: config.sarvamSpeaker, // Dynamic chosen voice from frontend
        model: "bulbul:v3"
      })
    });

    if (!sarvamRes.ok) {
      const errBody = await sarvamRes.text().catch(() => '');
      console.error(`❌ Sarvam API HTTP ${sarvamRes.status}:`, errBody);
      return;
    }

    const sarvamData = await sarvamRes.json();

    if (sarvamData.audios && sarvamData.audios[0]) {
      const audioBuffer = Buffer.from(sarvamData.audios[0], 'base64');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(audioBuffer);
      }
    } else {
      console.error("❌ Sarvam API Error:", sarvamData);
    }
  } catch (err) {
    console.error(`❌ [TTS Chunk Error]:`, err.message);
  }
}

// WebSocket Connection Management
wss.on('connection', (ws) => {
  console.log('\n[WS] 🟢 Client connected to Voice Pipeline');

  // Prevent an unhandled 'error' event on this socket from crashing the whole process.
  ws.on('error', (err) => console.error('[WS] ❌ Client socket error:', err.message));

  // Strict Default Configurations
  ws.clientConfig = {
    language: 'en-US',
    llmModel: 'gemini-2.5-flash-lite',
    sarvamSpeaker: 'shreya'
  };

  ws.hasAskedDetails = false;
  let activeLiveSTT = null;

  // 🚀 INITIALIZE MEMORY & AUDIO QUEUE
  ws.conversationHistory = [];
  ws.audioQueue = []; // Buffer to save dropped headers while Deepgram is (re)connecting

  const safelyTeardownSTT = (client) => {
    if (!client) return;
    try {
      client.removeAllListeners();
      client.finish();
    } catch (teardownErr) {
      console.warn('[Deepgram] ⚠️ Non-fatal error while tearing down previous stream:', teardownErr.message);
    }
  };

  // Initialize Deepgram
  const startSTT = () => {
    safelyTeardownSTT(activeLiveSTT);
    activeLiveSTT = null;

    console.log(`[STT] ⏳ Initializing Deepgram stream for language: ${ws.clientConfig.language}...`);

    try {
      const deepgramLang = ws.clientConfig.language.split('-')[0];

      const liveClient = deepgram.listen.live({
        model: 'nova-2',
        language: deepgramLang,
        smart_format: true,
        interim_results: false,
        endpointing: 300,
        keepalive: true
        /* ⚠️ NOTE: If your frontend is sending raw PCM instead of WebM/Opus,
           Deepgram needs these two lines uncommented to prevent crashing:
        encoding: 'linear16',
        sample_rate: 16000,
        */
      });

      // Attach ALL listeners, including Error, synchronously and immediately — an
      // 'error' event with zero listeners crashes the entire Node process.
      liveClient.on(LiveTranscriptionEvents.Error, (err) => {
        console.error('[Deepgram] ❌ Stream Error:', err?.message || err);
      });

      liveClient.on(LiveTranscriptionEvents.Transcript, async (data) => {
        try {
          const transcript = data?.channel?.alternatives?.[0]?.transcript;
          if (!transcript || transcript.trim().length === 0) return;

          console.log(`\n===============================================`);
          console.log(`🎤 Transcribed Voice Text: "${transcript}"`);
          console.log(`===============================================`);

          const textLower = transcript.toLowerCase();
          const currentLang = ws.clientConfig.language.split('-')[0];

          // Instant filler responses — kept generic since project facts now come from
          // whatever document has been uploaded, and shouldn't be hardcoded here.
          const languageFillers = {
            en: {
              greetings: ["Hello there! Give me just a second...", "Hi! Let me pull up my notes..."],
              confirmations: ["Hmm...", "Right.", "Okay..."],
              details: "Okay, just a sec, let me walk through the details for you.",
              fallback: ["Hmm, let's see...", "Right, give me just a second..."]
            },
            hi: {
              greetings: ["नमस्ते! मुझे बस एक सेकंड दीजिए...", "हैलो! मैं अपनी डिटेल्स चेक कर रही हूँ..."],
              confirmations: ["हम्म...", "ठीक है।", "जी..."],
              details: "ठीक है, एक सेकंड रुकिए, मैं आपको पूरी जानकारी देती हूँ।",
              fallback: ["हम्म, देखने दीजिए...", "जी, बस एक सेकंड दीजिए..."]
            },
            gu: {
              greetings: ["નમસ્તે! મને બસ એક સેકન્ડ આપો...", "હેલો! હું મારી નોટ્સ ચેક કરી રહી છું..."],
              confirmations: ["હમ્મ...", "બરાબર.", "જી..."],
              details: "બરાબર, એક સેકન્ડ ઉભા રહો, હું તમને બધી માહિતી આપું છું.",
              fallback: ["હમ્મ, જોવા દો...", "જી, બસ એક સેકન્ડ આપો..."]
            }
          };

          const fillers = languageFillers[currentLang] || languageFillers.en;
          let audioToPlay = "";

          if (textLower.includes('hello') || textLower.includes('namaste') || textLower.includes('नमस्ते') || textLower.includes('કેમ છો')) {
            audioToPlay = fillers.greetings[Math.floor(Math.random() * fillers.greetings.length)];
          } else if (textLower === 'okay' || textLower === 'ok' || textLower === 'yes' || textLower === 'હા' || textLower === 'हाँ') {
            audioToPlay = fillers.confirmations[Math.floor(Math.random() * fillers.confirmations.length)];
          } else if (textLower.includes('detail') || textLower.includes('માહિતી') || textLower.includes('जानकारी')) {
            if (!ws.hasAskedDetails) {
              audioToPlay = fillers.details;
              ws.hasAskedDetails = true;
            } else {
              audioToPlay = currentLang === 'hi'
                ? "मैं आपके लिए वो डिटेल्स निकाल रही हूँ..."
                : currentLang === 'gu'
                  ? "હું તમારા માટે એ માહિતી ચેક કરી રહી છું..."
                  : "Let me pull up those specific details for you...";
            }
          } else {
            audioToPlay = fillers.fallback[Math.floor(Math.random() * fillers.fallback.length)];
          }

          console.log(`⏱️ [Dialogue Manager] Outputting Instant Audio: "${audioToPlay}"`);
          generateAndStreamTTS(audioToPlay, ws, ws.clientConfig);
          await runVoicePipeline(transcript, ws, ws.clientConfig, audioToPlay);
        } catch (handlerErr) {
          console.error('[Deepgram] ❌ Transcript handler error:', handlerErr.message);
        }
      });

      liveClient.on(LiveTranscriptionEvents.Open, () => {
        console.log('[Deepgram] 🟢 Stream Active.');
        // Flush all queued audio packets the second the stream opens.
        while (ws.audioQueue.length > 0) {
          try {
            liveClient.send(ws.audioQueue.shift());
          } catch (sendErr) {
            console.error('[Deepgram] ❌ Failed flushing queued audio:', sendErr.message);
            break;
          }
        }
      });

      liveClient.on(LiveTranscriptionEvents.Close, () => console.log('[Deepgram] 🔴 Stream Closed.'));

      activeLiveSTT = liveClient;
    } catch (initError) {
      console.error('[Setup Error] ❌ Deepgram setup failed:', initError.message);
      activeLiveSTT = null;
    }
  };

  // Start the mic stream listeners
  startSTT();

  // Instant connection greeting
  const welcomeMessage = "Hello! I'm your AI assistant. How can I help you today?";
  generateAndStreamTTS(welcomeMessage, ws, ws.clientConfig);
  ws.conversationHistory.push({ role: 'model', parts: [{ text: welcomeMessage }] });

  // Incoming WebSocket messages handler
  ws.on('message', async (message, isBinary) => {
    if (!isBinary) {
      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === 'config_update') {
          console.log(`⚙️ Setting Update Requested:`, payload.config);
          if (payload.config.llmModel && VALID_GEMINI_MODELS.includes(payload.config.llmModel)) {
            ws.clientConfig.llmModel = payload.config.llmModel;
          }
          if (payload.config.sarvamSpeaker) {
            ws.clientConfig.sarvamSpeaker = payload.config.sarvamSpeaker;
            console.log(`🔊 Voice changed to Sarvam Speaker: ${ws.clientConfig.sarvamSpeaker}`);
          }
          if (payload.config.language && payload.config.language !== ws.clientConfig.language) {
            ws.clientConfig.language = payload.config.language;
            startSTT(); // Restart Deepgram with new language
          }
          return;
        }

        if (payload.type === 'text_query' && payload.text) {
          await runVoicePipeline(payload.text, ws, ws.clientConfig);
        }
      } catch (e) {
        console.error("❌ Configuration payload structural error:", e.message);
      }
      return;
    }

    // Capture Binary Stream and safely queue data if Deepgram is still connecting
    if (isBinary) {
      if (!activeLiveSTT) {
        // No STT session at all yet (e.g. setup failed) — queue and try to (re)start.
        ws.audioQueue.push(message);
        startSTT();
        return;
      }

      let readyState;
      try {
        readyState = activeLiveSTT.getReadyState();
      } catch (rsErr) {
        console.error('[Deepgram] ❌ Could not read connection state, restarting stream:', rsErr.message);
        ws.audioQueue.push(message);
        startSTT();
        return;
      }

      if (readyState === 1) { // OPEN
        try {
          activeLiveSTT.send(message);
        } catch (sendErr) {
          console.error('[Deepgram] ❌ Send failed, restarting stream:', sendErr.message);
          ws.audioQueue.push(message);
          startSTT();
        }
      } else if (readyState === 0) { // CONNECTING
        ws.audioQueue.push(message); // Save the vital WebM header!
      } else { // CLOSING or CLOSED
        console.log('[Deepgram] ⚠️ Transcriber link dropped. Reviving...');
        ws.audioQueue.push(message);
        startSTT();
      }
    }
  });

  ws.on('close', () => {
    console.log('[WS] 🔴 Client disconnected. Clearing Conversation Memory.');
    ws.conversationHistory = [];
    ws.audioQueue = [];
    safelyTeardownSTT(activeLiveSTT);
    activeLiveSTT = null;
  });
});

wss.on('error', (err) => console.error('🔥 WebSocket Server Error:', err.message));

process.on('uncaughtException', (err) => console.error('🔥 Global Crash Exception:', err));
process.on('unhandledRejection', (reason) => console.error('🔥 Global Promise Rejection:', reason));
