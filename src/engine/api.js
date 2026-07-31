const { GoogleGenAI } = require('@google/genai');
const { buildDebriefPrompt } = require('./prompts/debrief');

// Initialize the Google Gen AI client explicitly passing the API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// We'll use the cost-effective 3.6 Flash for both turns and debriefs
const MODEL = 'gemini-3.6-flash';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 90_000;

// The core rules you want permanently embedded in every scenario
const EMS_SYSTEM_RULES = `
For EMS Scenarios, in addition to provided instructions, I always want you to:
1: Keep scenarios varied and unpredictable
2: Never provide suggestions or information I did not ask for
3: Remember that a Level 1 trauma center is 20 mins away and other hospitals are 12-15 mins away.
4: Serious dispatches get an automatic engine backup, and benign sounding dispatches get just an ambulance.
5: Remember that my regular partner is a fire EMT named Brayden who is new and aggressive but loves EMS.
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
      // Look for Too Many Requests (429) or Service Unavailable (503)
      const isRateLimit = errorString.includes('429') || errorString.includes('503') || errorString.includes('quota') || errorString.includes('too many requests');
      
      if (isRateLimit && attempt < maxRetries) {
        const waitTime = attempt * 2000; // Wait 2s, then 4s...
        console.warn(`[API] Rate limit hit. Retrying attempt ${attempt} in ${waitTime}ms...`);
        await delay(waitTime);
      } else {
        throw error; // If it's a real error, or we ran out of retries, crash as normal
      }
    }
  }
}

/**
 * Send a turn in an active scenario.
 *
 * @param {string} systemPrompt The assembled seed block
 * @param {Array} messages Full conversation history [{ role, content }]
 * @returns {string} Gemini's response text
 */
async function sendTurn(systemPrompt, messages) {
  // Combine the dynamic scenario prompt with your permanent rules
  const fullInstruction = `${EMS_SYSTEM_RULES}\n\n${systemPrompt}`;

  // Adapt the messages array to Gemini's format if needed (usually just ensuring 'user' or 'model' roles)
  const formattedMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role, 
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  try {
    // Replaced ai.models.generateContent with our new retry wrapper
    const response = await generateContentWithRetry({
      model: MODEL,
      contents: formattedMessages,
      config: {
        systemInstruction: fullInstruction, 
        maxOutputTokens: MAX_TOKENS,
      }
    });

    return extractText(response);

  } catch (error) {
     console.error("Gemini API Error (Turn):", error);
     throw new Error("Failed to connect to the Gemini API during turn.");
  }
}

/**
 * Pull the text out of a Gemini response defensively.
 */
function extractText(response) {
   if (response && response.text) {
       return response.text;
   }
   throw new Error('The model returned an empty response — please retry your last action.');
}

/**
 * Send the debrief request after scenario close.
 *
 * @param {string} debriefContext Output of buildDebriefContext()
 * @param {string} providerLevel 'ALS' | 'BLS'
 * @returns {string} Debrief text
 */
async function sendDebrief(debriefContext, providerLevel) {
  const dynamicDebriefInstruction = buildDebriefPrompt(providerLevel);
  // Combine rules for the debrief as well so it understands context like Brayden's role
  const fullInstruction = `${EMS_SYSTEM_RULES}\n\n${dynamicDebriefInstruction}`;

  try {
     // Replaced ai.models.generateContent with our new retry wrapper
     const response = await generateContentWithRetry({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: debriefContext }]}],
      config: {
        systemInstruction: fullInstruction,
        maxOutputTokens: 3000, 
      }
    });

    return extractText(response);

  } catch (error) {
      console.error("Gemini API Error (Debrief):", error);
      throw new Error("Failed to connect to the Gemini API during debrief.");
  }
}

module.exports = { sendTurn, sendDebrief };