import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";

// --- Load .env ---
function loadEnv() {
    try {
        const envPath = path.resolve("./.env");
        const content = readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch (e) {
        // .env not found, rely on system env
    }
}
loadEnv();

// --- API Configuration ---
// Try Gemini first, fall back to Groq
const geminiKey = process.env.GEMINI_API_KEY;
const groqKey = process.env.GROQ_API_KEY;

if (!geminiKey && !groqKey) {
    console.error("Either GEMINI_API_KEY or GROQ_API_KEY is required in .env");
    process.exit(1);
}

const USE_GEMINI = !!geminiKey;
const apiKey = geminiKey || groqKey;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

console.log(`  🔑 Using API: ${USE_GEMINI ? 'Gemini 2.0 Flash' : 'Groq Llama 3.3 70B'}`);

// --- Layer Configuration ---
const BATCH_SIZE = 10;
const LAYERS = {
    CORE: { batches: 200, file: "train_core.jsonl" },
    MESSY: { batches: 100, file: "train_messy.jsonl" },
    DPO: { batches: 100, file: "train_dpo.jsonl" },
    EDGE: { batches: 50, file: "train_edge.jsonl" },
    DIFFICULTY: { batches: 50, file: "train_difficulty.jsonl" },
    VERIFY: { batches: 50, file: "train_verify.jsonl" },
};

const domainFocuses = [
    "software engineering (coding, debugging, code reviews, architecture, testing, deployment)",
    "cybersecurity (pentesting, vulnerability scanning, log analysis, incident response)",
    "fitness and health (weightlifting, cardio, stretching, meal prep, sleep, sports)",
    "personal development (reading, journaling, meditation, therapy, habit tracking)",
    "career growth (resume, networking, interview prep, certifications, public speaking)",
    "financial management (budgeting, investing, expense tracking, savings, debt payoff)",
    "creative projects (writing, music, art, photography, video editing, design)",
    "household and daily life (cleaning, organizing, grocery shopping, cooking, errands)",
    "academic and learning (online courses, research, studying, flashcards, languages)",
    "sysadmin and DevOps (server setup, monitoring, backups, CI/CD, containers, cloud)",
    "data science (data cleaning, model training, visualization, SQL, A/B testing)",
    "mobile and web development (UI design, responsive layouts, API integration)",
    "health and wellness (doctor appointments, mental health, hydration, vitamins)",
    "team and project management (sprint planning, standup prep, docs, mentoring)",
    "communication and relationships (calling family, planning dates, thank-you notes)",
    "time management (calendar blocking, weekly reviews, inbox zero, pomodoro)",
    "side projects and entrepreneurship (market research, MVP building, pitch decks)",
    "outdoor and adventure (hiking, camping, trail research, outdoor workouts)",
    "mixed everyday tasks with typos and informal language",
    "mixed advanced tasks (system programming, reverse engineering, CTF, performance)"
];

const SYSTEM_PROMPT = [
    "You are 'The Architect', a productivity-focused task processing system.",
    "You transform raw, informal human input into structured, actionable tasks.",
    "You also generate trivia questions and evaluate answers for task verification.",
    "",
    "RULES:",
    "1. cleanTitle must be short (2-6 words), practical, actionable.",
    "2. actionableTask must be a clear 1-sentence real-world action.",
    "3. NEVER use fantasy/RPG-style names. Be direct and professional.",
    "4. Match category and statAlignment accurately.",
    "5. Assess difficulty honestly.",
    "",
    "Output Schema:",
    "{",
    '  "cleanTitle": "String",',
    '  "actionableTask": "String",',
    '  "category": "WORK|HEALTH|LEARNING|PERSONAL|FINANCE|CREATIVE",',
    '  "statAlignment": "STR|INT|WIS",',
    '  "priority": 1-5,',
    '  "severity": 1-5,',
    '  "difficulty": "EASY|MODERATE|HARD",',
    '  "xpReward": Number,',
    '  "estimatedTime": "Quick|Medium|Long|Ongoing",',
    '  "architectReasoning": "String"',
    "}"
].join("\\n");

// --- Prompt Templates ---

function corePrompt(domain, batchIndex) {
    return `Act as a Data Synthesis Engine for a productivity task management system.
Generate a JSON array of exactly 10 training examples. Each entry MUST have two fields:
- "rawInput": a casual user input string
- "task": a structured JSON object with all schema fields filled

TONE: This is a PRODUCTIVITY tool, NOT a fantasy RPG. Titles like "Bench Press Session", "Debug Login Auth", "Weekly Budget Review".
RAW INPUT STYLE: 30% short (3-8 words), 40% medium (8-15 words), 30% long (15+ words). Include casual language.
DOMAIN FOCUS: ${domain}
DIFFICULTY MIX: ~33% EASY, ~34% MODERATE, ~33% HARD

Output Schema per task: { cleanTitle, actionableTask, category (WORK|HEALTH|LEARNING|PERSONAL|FINANCE|CREATIVE), statAlignment (STR|INT|WIS), priority (1-5), severity (1-5), difficulty (EASY|MODERATE|HARD), xpReward (Number), estimatedTime (Quick|Medium|Long|Ongoing), architectReasoning }

CRITICAL: Every "task" object MUST have ALL fields populated. Do NOT leave any field empty.
ANTI-BIAS: NOT all HEALTH=STR (yoga=WIS, nutrition research=INT). NOT all WORK=INT (manual labor=STR, leadership=WIS).
Batch ${batchIndex + 1}. Ensure unique examples. Return ONLY a JSON array.`;
}

function messyPrompt(domain) {
    return `Generate 10 training examples with MESSY, INFORMAL raw inputs that map to clean structured outputs.
Each entry MUST have "rawInput" and "task" fields. The "task" MUST have ALL schema fields populated.
Input styles: typos ("gotta finsih"), slang ("ngl need 2 hit gym"), emoji ("💪 leg day!!"), ALL CAPS, single words ("run"), stream of consciousness, mixed language.
Domain: ${domain}
Same output schema as standard tasks. Return ONLY a JSON array.`;
}

function dpoPrompt(domain, type) {
    if (type === "quest") {
        return `Generate 10 DPO training pairs for task structuring. Each entry has: prompt (raw input), chosen (correct output), rejected (wrong output).
Wrong outputs should have: fantasy names ("Arms of Oakhaven"), wrong categories, wrong stat alignment, inflated severity, vague actionableTask.
Domain: ${domain}. Return JSON array of {prompt, chosen, rejected} objects.`;
    }
    return `Generate 10 DPO training pairs for VERIFICATION tasks. Types:
- Wrong trivia answers marked CORRECT (should be INCORRECT)
- Correct trivia answers marked INCORRECT (should be CORRECT)  
- Irrelevant code commits marked RELEVANT (should be NOT_RELEVANT)
- Relevant code commits marked NOT_RELEVANT (should be RELEVANT)
Each: {prompt, chosen, rejected}. Domain: ${domain}. Return JSON array.`;
}

function edgePrompt() {
    return `Generate 10 EDGE CASE training examples. Each entry MUST have "rawInput" and "task" fields with ALL schema fields populated. Include:
- Ambiguous tasks spanning 2+ categories
- Sarcasm ("ugh guess I'll exercise")
- Nonsensical inputs ("asdfgh", "test", ".")
- Tasks with debatable stat alignment
- Numbers ("do 50 pushups" vs "read 50 pages")
Same output schema. For nonsense, set low priority/severity. Return JSON array.`;
}

function difficultyPrompt(domain) {
    return `Generate 10 examples showing CORRECT difficulty calibration. Each entry MUST have "rawInput" and "task" fields with ALL schema fields populated. Include triplets of similar tasks at different difficulties:
- EASY: "quick stretch" (severity 1-2, estimatedTime Quick)
- MODERATE: "full yoga session" (severity 3, estimatedTime Medium)  
- HARD: "yoga instructor certification prep" (severity 4-5, estimatedTime Long)
Domain: ${domain}. Return JSON array.`;
}

function verifyPrompt(type) {
    if (type === "trivia") {
        return `Generate 10 trivia generation+evaluation training examples. Mix of:
1. Trivia generation: system asks to generate question, user provides task, assistant returns {question, expectedAnswer, difficulty}
2. Answer evaluation (CORRECT): user gives right answer, assistant returns {verdict:"CORRECT", reason, hint:null}
3. Answer evaluation (INCORRECT): user gives wrong answer, assistant returns {verdict:"INCORRECT", reason, hint}
Cover coding, algorithms, networking, databases, security, math, science topics. Return JSON array of {messages:[{role,content},...]} objects.`;
    }
    return `Generate 10 code relevance checking training examples. Format: {messages:[{role,content},...]}
Mix of RELEVANT and NOT_RELEVANT verdicts. Include:
- Direct matches (fix auth → auth commit = RELEVANT)
- Tangential (fix auth → update CSS = NOT_RELEVANT)
- Partial (right file, wrong function = NOT_RELEVANT)
- Close but different (add migration vs optimize queries)
Cover various programming domains. Return JSON array.`;
}

// --- Generation Logic ---

async function generateBatch(prompt, retries = 8) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            let text;

            if (USE_GEMINI) {
                // --- Gemini API ---
                const res = await fetch(GEMINI_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt + "\n\nRespond ONLY with a valid JSON array. No markdown, no explanation." }] }],
                        generationConfig: {
                            temperature: 0.8,
                            maxOutputTokens: 8192,
                            responseMimeType: "application/json",
                        },
                    }),
                });

                if (!res.ok) {
                    const errText = await res.text();
                    if (res.status === 429) {
                        console.error(`  [Gemini 429 detail]: ${errText.substring(0, 200)}`);
                        throw new Error("429 Rate Limited");
                    }
                    throw new Error(`Gemini ${res.status}: ${errText.substring(0, 120)}`);
                }

                const json = await res.json();
                text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) {
                    const reason = json.candidates?.[0]?.finishReason || "unknown";
                    throw new Error(`Gemini returned no text (finishReason: ${reason})`);
                }
            } else {
                // --- Groq API ---
                const res = await fetch(GROQ_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: "user", content: prompt }],
                        response_format: { type: "json_object" },
                        temperature: 0.8,
                        max_tokens: 8000,
                    }),
                });

                if (!res.ok) {
                    const errText = await res.text();
                    if (res.status === 429) throw new Error("429 Rate Limited");
                    throw new Error(`API ${res.status}: ${errText.substring(0, 100)}`);
                }

                const json = await res.json();
                text = json.choices[0].message.content;
            }

            // --- Parse response (shared logic) ---
            // Strip markdown fences if present
            text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const data = JSON.parse(text);
            
            // Handle both direct arrays and wrapped objects
            if (Array.isArray(data)) return data;
            
            // Search all values for the first array
            if (typeof data === "object" && data !== null) {
                for (const key of Object.keys(data)) {
                    if (Array.isArray(data[key])) return data[key];
                }
                // Try nested one level deeper
                for (const key of Object.keys(data)) {
                    if (typeof data[key] === "object" && data[key] !== null) {
                        for (const subKey of Object.keys(data[key])) {
                            if (Array.isArray(data[key][subKey])) return data[key][subKey];
                        }
                    }
                }
            }
            console.error(`  ⚠️ Could not find array in response. Keys: ${Object.keys(data).join(", ")}`);
            throw new Error("Response is not an array");
        } catch (err) {
            const is429 = err.message && err.message.includes("429");
            console.error(`  Attempt ${attempt + 1} failed: ${is429 ? '429 Rate Limited' : err.message.substring(0, 80)}`);
            
            if (is429) {
                const waitTime = USE_GEMINI ? 15000 : 90000;
                console.log(`  ⏳ Waiting ${waitTime / 1000}s for rate limit reset...`);
                await sleep(waitTime);
            } else if (attempt < retries - 1) {
                await sleep(5000);
            }
        }
    }
    return [];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toSftJsonl(item, systemPrompt) {
    // Validate that the assistant content is not empty
    const assistantContent = item.task ? JSON.stringify(item.task) : null;
    if (!assistantContent || !item.rawInput) return null;
    
    return JSON.stringify({
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: item.rawInput },
            { role: "assistant", content: assistantContent }
        ]
    });
}

function toDpoJsonl(item) {
    return JSON.stringify({
        prompt: item.prompt,
        chosen: typeof item.chosen === "string" ? item.chosen : JSON.stringify(item.chosen),
        rejected: typeof item.rejected === "string" ? item.rejected : JSON.stringify(item.rejected)
    });
}

// --- Resume Support ---
function countExistingLines(filepath) {
    try {
        if (!existsSync(filepath)) return 0;
        const content = readFileSync(filepath, "utf8");
        return content.split("\n").filter(l => l.trim()).length;
    } catch {
        return 0;
    }
}

async function appendLines(filepath, lines) {
    if (lines.length === 0) return;
    const resolved = path.resolve(filepath);
    // Ensure existing file ends with newline before appending
    let prefix = "";
    if (existsSync(resolved)) {
        const existing = readFileSync(resolved, "utf8");
        if (existing.length > 0 && !existing.endsWith("\n")) {
            prefix = "\n";
        }
    }
    const content = prefix + lines.join("\n") + "\n";
    await fs.appendFile(resolved, content);
}

async function main() {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  MONARCH Training Data Generator v4 (Resume Support)       ║`);
    console.log(`║  Target: ~5,500 examples across 6 layers                   ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    const stats = { total: 0, skipped: 0, failed: 0, generated: 0 };

    // Gemini has 15 RPM free tier — much faster pacing
    const PRE_DELAY = USE_GEMINI ? 2000 : 5000;
    const POST_DELAY = USE_GEMINI ? 5000 : 15000;

    // --- Layer 1: Core Gold (2000) ---
    console.log("\n📦 LAYER 1: Core Gold Examples");
    const coreExisting = countExistingLines(LAYERS.CORE.file);
    const coreStartBatch = Math.floor(coreExisting / BATCH_SIZE);
    console.log(`  📊 Found ${coreExisting} existing entries, resuming from batch ${coreStartBatch + 1}/${LAYERS.CORE.batches}`);
    
    for (let i = coreStartBatch; i < LAYERS.CORE.batches; i++) {
        const domain = domainFocuses[i % domainFocuses.length];
        console.log(`  [${i + 1}/${LAYERS.CORE.batches}] ${domain.substring(0, 50)}...`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(corePrompt(domain, i));
        const lines = batch.map(item => toSftJsonl(item, SYSTEM_PROMPT)).filter(Boolean);
        await appendLines(LAYERS.CORE.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} valid examples appended`);
        await sleep(POST_DELAY);
    }
    const coreTotal = countExistingLines(LAYERS.CORE.file);
    console.log(`  ✅ Layer 1 total: ${coreTotal} examples`);

    // --- Layer 2: Messy Input (1000) ---
    console.log("\n📦 LAYER 2: Messy Input Examples");
    const messyExisting = countExistingLines(LAYERS.MESSY.file);
    const messyStartBatch = Math.floor(messyExisting / BATCH_SIZE);
    console.log(`  📊 Found ${messyExisting} existing entries, resuming from batch ${messyStartBatch + 1}/${LAYERS.MESSY.batches}`);
    
    for (let i = messyStartBatch; i < LAYERS.MESSY.batches; i++) {
        const domain = domainFocuses[i % domainFocuses.length];
        console.log(`  [${i + 1}/${LAYERS.MESSY.batches}] ${domain.substring(0, 50)}...`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(messyPrompt(domain));
        const lines = batch.map(item => toSftJsonl(item, SYSTEM_PROMPT)).filter(Boolean);
        await appendLines(LAYERS.MESSY.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} valid examples appended`);
        await sleep(POST_DELAY);
    }
    const messyTotal = countExistingLines(LAYERS.MESSY.file);
    console.log(`  ✅ Layer 2 total: ${messyTotal} examples`);

    // --- Layer 3: DPO Contrastive (1000) ---
    console.log("\n📦 LAYER 3: Contrastive (DPO) Pairs");
    const dpoExisting = countExistingLines(LAYERS.DPO.file);
    const dpoStartBatch = Math.floor(dpoExisting / BATCH_SIZE);
    console.log(`  📊 Found ${dpoExisting} existing entries, resuming from batch ${dpoStartBatch + 1}/${LAYERS.DPO.batches}`);
    
    for (let i = dpoStartBatch; i < LAYERS.DPO.batches; i++) {
        const domain = domainFocuses[i % domainFocuses.length];
        const type = i < 50 ? "quest" : "verify";
        console.log(`  [${i + 1}/${LAYERS.DPO.batches}] ${type} — ${domain.substring(0, 40)}...`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(dpoPrompt(domain, type));
        const lines = batch.map(item => toDpoJsonl(item)).filter(Boolean);
        await appendLines(LAYERS.DPO.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} DPO pairs appended`);
        await sleep(POST_DELAY);
    }
    const dpoTotal = countExistingLines(LAYERS.DPO.file);
    console.log(`  ✅ Layer 3 total: ${dpoTotal} DPO pairs`);

    // --- Layer 4: Edge Cases (500) ---
    console.log("\n📦 LAYER 4: Edge Cases");
    const edgeExisting = countExistingLines(LAYERS.EDGE.file);
    const edgeStartBatch = Math.floor(edgeExisting / BATCH_SIZE);
    console.log(`  📊 Found ${edgeExisting} existing entries, resuming from batch ${edgeStartBatch + 1}/${LAYERS.EDGE.batches}`);
    
    for (let i = edgeStartBatch; i < LAYERS.EDGE.batches; i++) {
        console.log(`  [${i + 1}/${LAYERS.EDGE.batches}]`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(edgePrompt());
        const lines = batch.map(item => toSftJsonl(item, SYSTEM_PROMPT)).filter(Boolean);
        await appendLines(LAYERS.EDGE.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} valid examples appended`);
        await sleep(POST_DELAY);
    }
    const edgeTotal = countExistingLines(LAYERS.EDGE.file);
    console.log(`  ✅ Layer 4 total: ${edgeTotal} examples`);

    // --- Layer 5: Difficulty Calibration (500) ---
    console.log("\n📦 LAYER 5: Difficulty Calibration");
    const diffExisting = countExistingLines(LAYERS.DIFFICULTY.file);
    const diffStartBatch = Math.floor(diffExisting / BATCH_SIZE);
    console.log(`  📊 Found ${diffExisting} existing entries, resuming from batch ${diffStartBatch + 1}/${LAYERS.DIFFICULTY.batches}`);
    
    for (let i = diffStartBatch; i < LAYERS.DIFFICULTY.batches; i++) {
        const domain = domainFocuses[i % domainFocuses.length];
        console.log(`  [${i + 1}/${LAYERS.DIFFICULTY.batches}] ${domain.substring(0, 50)}...`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(difficultyPrompt(domain));
        const lines = batch.map(item => toSftJsonl(item, SYSTEM_PROMPT)).filter(Boolean);
        await appendLines(LAYERS.DIFFICULTY.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} valid examples appended`);
        await sleep(POST_DELAY);
    }
    const diffTotal = countExistingLines(LAYERS.DIFFICULTY.file);
    console.log(`  ✅ Layer 5 total: ${diffTotal} examples`);

    // --- Layer 6: Verification Training (500) ---
    console.log("\n📦 LAYER 6: Verification Tasks");
    const verifyExisting = countExistingLines(LAYERS.VERIFY.file);
    const verifyStartBatch = Math.floor(verifyExisting / BATCH_SIZE);
    console.log(`  📊 Found ${verifyExisting} existing entries, resuming from batch ${verifyStartBatch + 1}/${LAYERS.VERIFY.batches}`);
    
    for (let i = verifyStartBatch; i < LAYERS.VERIFY.batches; i++) {
        const type = i < 25 ? "trivia" : "code";
        console.log(`  [${i + 1}/${LAYERS.VERIFY.batches}] ${type}`);
        await sleep(PRE_DELAY);
        const batch = await generateBatch(verifyPrompt(type));
        const lines = batch.map(item => {
            if (item.messages) return JSON.stringify(item);
            return toSftJsonl(item, SYSTEM_PROMPT);
        }).filter(Boolean);
        await appendLines(LAYERS.VERIFY.file, lines);
        stats.generated += lines.length;
        stats.total += lines.length;
        if (batch.length === 0) stats.failed++;
        console.log(`    ✓ ${lines.length} valid examples appended`);
        await sleep(POST_DELAY);
    }
    const verifyTotal = countExistingLines(LAYERS.VERIFY.file);
    console.log(`  ✅ Layer 6 total: ${verifyTotal} examples`);

    // --- Combine SFT layers (1+2+4+5+6) ---
    console.log("\n📦 Combining SFT layers...");
    const sftFiles = [LAYERS.CORE.file, LAYERS.MESSY.file, LAYERS.EDGE.file, LAYERS.DIFFICULTY.file, LAYERS.VERIFY.file];
    let combinedContent = "";
    for (const f of sftFiles) {
        if (existsSync(f)) {
            const content = readFileSync(f, "utf8").trim();
            if (content) combinedContent += content + "\n";
        }
    }
    await fs.writeFile(path.resolve("./train_sft_combined.jsonl"), combinedContent);
    const combinedTotal = combinedContent.split("\n").filter(l => l.trim()).length;

    // --- Summary ---
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Generation complete!`);
    console.log(`  Layer 1 (Core):       ${coreTotal}`);
    console.log(`  Layer 2 (Messy):      ${messyTotal}`);
    console.log(`  Layer 3 (DPO):        ${dpoTotal}`);
    console.log(`  Layer 4 (Edge):       ${edgeTotal}`);
    console.log(`  Layer 5 (Difficulty):  ${diffTotal}`);
    console.log(`  Layer 6 (Verify):     ${verifyTotal}`);
    console.log(`  Combined SFT:         ${combinedTotal}`);
    console.log(`  New examples:         ${stats.generated}`);
    console.log(`  Failed batches:       ${stats.failed}`);
    console.log(`${'═'.repeat(60)}\n`);
}

main();
