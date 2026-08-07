const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const { buildDebriefPrompt } = require('./prompts/debrief');

// Initialize the Google Gen AI client explicitly passing the API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// We'll use the cost-effective 3.6 Flash for both turns and debriefs
const MODEL = 'gemini-3.6-flash';
const MAX_TOKENS = 2048; // Bumped to prevent max-token cutoffs
const REQUEST_TIMEOUT_MS = 90_000;

// Lower safety thresholds so trauma/clinical content isn't dropped mid-stream
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// The core rules permanently embedded in every scenario
const EMS_SYSTEM_RULES = `
For EMS Scenarios, in addition to provided instructions, I always want you to:
1: Keep scenarios varied and unpredictable
2: Never provide suggestions or information I did not ask for
3: Serious dispatches get an automatic engine backup, and benign sounding dispatches get just an ambulance.
`;

/**
 * Helper to pause execution
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wrap the Gemini API call in an automatic retry system for rate limits.
 */
async function generateContentWithRetry(requestParams, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(requestParams);
    } catch (error) {
      attempt++;
      const errorString = error.toString().toLowerCase();
      const isRateLimit = errorString.includes('429') || errorString.includes('503') || errorString.includes('quota') || errorString.includes('too many requests');
      
      if (isRateLimit && attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.warn(`[API] Rate limit hit. Retrying attempt ${attempt} in ${waitTime}ms...`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Send a turn in an active scenario.
 */
async function sendTurn(systemPrompt, messages) {
  const fullInstruction = `${EMS_SYSTEM_RULES}\n\n${systemPrompt}`;

  const formattedMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role, 
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  try {
    const response = await generateContentWithRetry({
      model: MODEL,
      contents: formattedMessages,
      config: {
        systemInstruction: fullInstruction, 
        maxOutputTokens: MAX_TOKENS,
        safetySettings: SAFETY_SETTINGS, // Applied safety override
      }
    });

    return extractText(response);

  } catch (error) {
     console.error("Gemini API Error (Turn):", error);
     throw new Error("Failed to connect to the Gemini API during turn.");
  }
}

/**
 * Pull the text out of a Gemini response defensively and log finish reason.
 */
function extractText(response) {
   const candidate = response?.candidates?.[0];

   // Warn in console if output was cut short by API safety or token caps
   if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
       console.warn(`[API Warning] Generation stopped early. finishReason: ${candidate.finishReason}`);
   }

   if (response && response.text) {
       return response.text;
   }
   throw new Error('The model returned an empty response — please retry your last action.');
}

/**
 * Send the debrief request after scenario close.
 */
async function sendDebrief(debriefContext, providerLevel) {
  const dynamicDebriefInstruction = buildDebriefPrompt(providerLevel);
  const fullInstruction = `${EMS_SYSTEM_RULES}\n\n${dynamicDebriefInstruction}`;

  try {
     const response = await generateContentWithRetry({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: debriefContext }]}],
      config: {
        systemInstruction: fullInstruction,
        maxOutputTokens: 3000, 
        safetySettings: SAFETY_SETTINGS,
      }
    });

    return extractText(response);

  } catch (error) {
      console.error("Gemini API Error (Debrief):", error);
      throw new Error("Failed to connect to the Gemini API during debrief.");
  }
}

module.exports = { sendTurn, sendDebrief };