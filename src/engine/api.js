'use strict';
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const { buildDebriefPrompt, debriefEvidenceIssues } = require('./prompts/debrief');

// Initialize the Google Gen AI client explicitly passing the API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-3.7-flash';
const { requestModel, REQUEST_TIMEOUT_MS } = require('./modelRequest');
const { operationError } = require('./operations');

// Output budgets for simulation turns and debriefs.
const TURN_MAX_TOKENS = 4000; 
const DEBRIEF_MAX_TOKENS = 4000; 

// Lower safety thresholds so trauma/clinical content isn't dropped mid-stream
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// The core rules permanently embedded ONLY in active scenario simulation turns
const EMS_SYSTEM_RULES = `For EMS Scenarios, in addition to provided instructions, I always want you to:
1: Keep scenarios varied and unpredictable
2: Keep narrator guidance off; named crew follow the CREW BEHAVIOR CONTRACT in the scenario seed
3: Serious dispatches get an automatic engine backup, and benign sounding dispatches get just an ambulance.
4: Keep narrative updates brief, concise, and focused strictly on the immediate clinical scene.`;

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
    throw new Error('The model returned an empty response please retry your last action.');
}

/**
* Send a turn in an active scenario.
*/
async function sendTurn(systemPrompt, messages, options = {}) {
    const fullInstruction = `${EMS_SYSTEM_RULES}\n\n${systemPrompt}`;
    const formattedMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));
    
    try {
        const response = await requestModel(params => ai.models.generateContent(params), {
            model: MODEL,
            contents: formattedMessages,
            config: {
                systemInstruction: fullInstruction,
                maxOutputTokens: TURN_MAX_TOKENS,
                safetySettings: SAFETY_SETTINGS,
            }
        }, options);
        return extractText(response);
    } catch (error) {
        if (options.signal?.aborted || error.code === 'model_timeout') throw error;
        console.error("Gemini API Error (Turn):", error);
        throw new Error("Failed to connect to the Gemini API during turn.");
    }
}

/**
* Send the debrief request after scenario close.
*/
async function sendDebrief(debriefContext, providerLevel, options = {}) {
    // Uses clean debrief instructions without EMS_SYSTEM_RULES contamination
    const dynamicDebriefInstruction = buildDebriefPrompt(providerLevel);
    
    try {
        const started = Date.now();
        const params = {
            model: MODEL,
            contents: [{ role: 'user', parts: [{ text: debriefContext }] }],
            config: {
                systemInstruction: dynamicDebriefInstruction,
                maxOutputTokens: DEBRIEF_MAX_TOKENS,
                temperature: 0.15, 
                topP: 0.8,
                safetySettings: SAFETY_SETTINGS,
            }
        };
        let draft = extractText(await requestModel(p => ai.models.generateContent(p), params, options));
        const issues = debriefEvidenceIssues(draft);
        if (issues.length) {
            const repair = 'EVIDENCE CHECK: The draft below makes unsupported guarantees about downstream outcomes or hospital events. Rewrite the complete five-section debrief using the original recorded evidence. Explain possible benefits without claiming guaranteed survival, treatment, preparation or recovery. Retain supported care gaps and the separate likely PATIENT_OUTCOME line.\nFlagged claims:\n' + issues.join('\n');
            params.contents.push({ role: 'model', parts: [{ text: draft }] }, { role: 'user', parts: [{ text: repair }] });
            draft = extractText(await requestModel(p => ai.models.generateContent(p), params, {
                ...options, timeoutMs: Math.max(1, (options.timeoutMs ?? REQUEST_TIMEOUT_MS) - (Date.now() - started)),
            }));
            if (debriefEvidenceIssues(draft).length) {
                throw operationError('invalid_debrief_evidence', 'The debrief made unsupported outcome claims. No review was saved; please retry.', 502);
            }
        }
        return draft;
    } catch (error) {
        if (options.signal?.aborted || error.code === 'model_timeout' || error.code === 'invalid_debrief_evidence') throw error;
        console.error("Gemini API Error (Debrief):", error);
        throw new Error("Failed to connect to the Gemini API during debrief.");
    }
}

module.exports = { sendTurn, sendDebrief };
