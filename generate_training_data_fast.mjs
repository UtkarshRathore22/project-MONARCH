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
const groqKey = process.env.GROQ_API_KEY;
if (!groqKey) {
    console.error("GROQ_API_KEY is required in .env");
    process.exit(1);
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

// --- SPEED CONFIG ---
// Groq free tier for llama-3.1-8b-instant: 6K tokens/min, 14,400 req/day
// Each 5-item batch uses ~300 tokens
const BATCH_SIZE = 5;         // 5 examples per call to safely avoid 413 context limit
const CONCURRENCY = 1;        // Sequential to stay under 6K TPM
const PRE_DELAY = 1000;       // 1s before each round
const POST_DELAY = 1000;      // 1s after — ~2s/round = 30 rounds/min ≈ ~9K TPM (slightly over, might rate limit but will recover)
const RATE_LIMIT_WAIT = 65000; // 65s on 429
const MAX_RETRIES = 10;

// --- Layer Configuration (adjusted for 25 per batch) ---
const LAYERS = {
    CORE:       { target: 2000, file: "train_core.jsonl" },
    MESSY:      { target: 1000, file: "train_messy.jsonl" },
    DPO:        { target: 1000, file: "train_dpo.jsonl" },
    EDGE:       { target: 500,  file: "train_edge.jsonl" },
    DIFFICULTY: { target: 500,  file: "train_difficulty.jsonl" },
    VERIFY:     { target: 500,  file: "train_verify.jsonl" },
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
Generate a JSON array of exactly ${BATCH_SIZE} training examples. Each entry MUST have two fields:
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

const SCHEMA_SNIPPET = `
{
  "cleanTitle": "Short practical title (2-6 words)",
  "actionableTask": "Clear 1-sentence action",
  "category": "WORK|HEALTH|LEARNING|PERSONAL|FINANCE|CREATIVE",
  "statAlignment": "STR|INT|WIS",
  "priority": 1-5,
  "severity": 1-5,
  "difficulty": "EASY|MODERATE|HARD",
  "xpReward": Number,
  "estimatedTime": "Quick|Medium|Long|Ongoing",
  "architectReasoning": "Brief explanation"
}`;

const ONE_SHOT = `
Example:
{
  "rawInput": "Need to fix the broken login auth by Friday",
  "task": {
    "cleanTitle": "Fix Login Authentication",
    "actionableTask": "Identify and resolve the bug in the login authentication flow.",
    "category": "WORK",
    "statAlignment": "INT",
    "priority": 5,
    "severity": 4,
    "difficulty": "HARD",
    "xpReward": 450,
    "estimatedTime": "Medium",
    "architectReasoning": "Critical infrastructure fix requiring logical analysis."
  }
}`;

function messyPrompt(domain) {
    return `Generate ${BATCH_SIZE} training examples with MESSY, INFORMAL raw inputs.
The "task" MUST follow this EXACT schema: ${SCHEMA_SNIPPET}
${ONE_SHOT}

Input styles: typos ("gotta finsih"), slang ("ngl need 2 hit gym"), emoji ("💪 leg day!!"), ALL CAPS, single words ("run"), stream of consciousness.
Domain: ${domain}
Return ONLY a JSON array of objects with "rawInput" and "task" fields.`;
}

function dpoPrompt(domain, type) {
    if (type === "quest") {
        return `Generate ${BATCH_SIZE} DPO training pairs for task structuring. Each entry has: prompt (raw input), chosen (correct output), rejected (wrong output).
Wrong outputs should have: fantasy names ("Arms of Oakhaven"), wrong categories, wrong stat alignment, inflated severity, vague actionableTask.
Domain: ${domain}. Return JSON array of {prompt, chosen, rejected} objects.`;
    }
    return `Generate ${BATCH_SIZE} DPO training pairs for VERIFICATION tasks. Types:
- Wrong trivia answers marked CORRECT (should be INCORRECT)
- Correct trivia answers marked INCORRECT (should be CORRECT)  
- Irrelevant code commits marked RELEVANT (should be NOT_RELEVANT)
- Relevant code commits marked NOT_RELEVANT (should be RELEVANT)
Each: {prompt, chosen, rejected}. Domain: ${domain}. Return JSON array.`;
}

function edgePrompt() {
    return `Generate ${BATCH_SIZE} EDGE CASE training examples (ambiguous, sarcastic, or nonsensical).
The "task" MUST follow this EXACT schema: ${SCHEMA_SNIPPET}
${ONE_SHOT}

Case Types: Sarcasm, Nonsense (asdfgh), ambiguous categories, tasks with debatable stats.
Return ONLY a JSON array of objects with "rawInput" and "task" fields.`;
}

function difficultyPrompt(domain) {
    return `Generate ${BATCH_SIZE} examples showing CORRECT difficulty calibration.
The "task" MUST follow this EXACT schema: ${SCHEMA_SNIPPET}
${ONE_SHOT}

Include triplets of similar tasks at different difficulties: EASY, MODERATE, HARD.
Domain: ${domain}
Return ONLY a JSON array of objects with "rawInput" and "task" fields.`;
}

function verifyPrompt(type) {
    if (type === "trivia") {
        return `Generate ${BATCH_SIZE} trivia generation+evaluation training examples. Mix of:
1. Trivia generation: system asks to generate question, user provides task, assistant returns {question, expectedAnswer, difficulty}
2. Answer evaluation (CORRECT): user gives right answer, assistant returns {verdict:"CORRECT", reason, hint:null}
3. Answer evaluation (INCORRECT): user gives wrong answer, assistant returns {verdict:"INCORRECT", reason, hint}
Cover coding, algorithms, networking, databases, security, math, science topics. Return JSON array of {messages:[{role,content},...]} objects.`;
    }
    return `Generate ${BATCH_SIZE} code relevance checking training examples. Format: {messages:[{role,content},...]}
Mix of RELEVANT and NOT_RELEVANT verdicts. Include:
- Direct matches (fix auth → auth commit = RELEVANT)
- Tangential (fix auth → update CSS = NOT_RELEVANT)
- Partial (right file, wrong function = NOT_RELEVANT)
- Close but different (add migration vs optimize queries)
Cover various programming domains. Return JSON array.`;
}

// --- Generation Logic ---

let consecutiveRateLimits = 0;
let rateLimitStart = null;

async function generateBatch(prompt, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch(GROQ_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${groqKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.8,
                    max_tokens: 4000,
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                if (res.status === 429) {
                    consecutiveRateLimits++;
                    if (!rateLimitStart) rateLimitStart = Date.now();
                    const elapsed = (Date.now() - rateLimitStart) / 1000;
                    console.error(`  ⚠️ 429 Rate Limited (consecutive: ${consecutiveRateLimits}, elapsed: ${elapsed.toFixed(0)}s)`);
                    
                    if (elapsed > 120) {
                        console.error(`\n  🚨🚨🚨 RATE LIMIT EXCEEDED 2 MINUTES — NEEDS ATTENTION 🚨🚨🚨\n`);
                    }
                    
                    await sleep(RATE_LIMIT_WAIT);
                    continue;
                }
                throw new Error(`API ${res.status}: ${errText.substring(0, 100)}`);
            }

            // Reset rate limit tracking on success
            consecutiveRateLimits = 0;
            rateLimitStart = null;

            const json = await res.json();
            let text = json.choices[0].message.content;

            // Strip markdown fences if present
            text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const data = JSON.parse(text);
            
            if (Array.isArray(data)) return data;
            
            if (typeof data === "object" && data !== null) {
                for (const key of Object.keys(data)) {
                    if (Array.isArray(data[key])) return data[key];
                }
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
            
            if (!is429 && attempt < retries - 1) {
                await sleep(3000);
            }
        }
    }
    return [];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toSftJsonl(item, systemPrompt) {
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

// --- Parallel batch runner ---
async function runParallelBatches(prompts, converter, filepath) {
    const results = await Promise.all(prompts.map(p => generateBatch(p)));
    let totalLines = 0;
    for (const batch of results) {
        const lines = batch.map(item => converter(item)).filter(Boolean);
        await appendLines(filepath, lines);
        totalLines += lines.length;
    }
    return totalLines;
}

async function main() {
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  MONARCH Training Data Generator v5 (TURBO MODE)          ║`);
    console.log(`║  Target: ~5,500 examples across 6 layers                  ║`);
    console.log(`║  ${BATCH_SIZE} per batch × ${CONCURRENCY} parallel = ${BATCH_SIZE * CONCURRENCY} examples/round           ║`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
    console.log(`  🔑 API: Groq ${MODEL}`);
    console.log(`  ⚡ Speed: ${BATCH_SIZE}/batch, ${CONCURRENCY} concurrent, ${PRE_DELAY}ms/${POST_DELAY}ms delays\n`);

    const stats = { total: 0, failed: 0, generated: 0 };

    // --- Layer 1: Core Gold ---
    console.log("\n📦 LAYER 1: Core Gold Examples (target: 2000)");
    let coreExisting = countExistingLines(LAYERS.CORE.file);
    console.log(`  📊 Found ${coreExisting} existing entries`);
    
    let roundNum = 0;
    while (coreExisting < LAYERS.CORE.target) {
        roundNum++;
        const remaining = LAYERS.CORE.target - coreExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            const domainIdx = (Math.floor(coreExisting / BATCH_SIZE) + j) % domainFocuses.length;
            prompts.push(corePrompt(domainFocuses[domainIdx], Math.floor(coreExisting / BATCH_SIZE) + j));
        }
        
        const domains = prompts.map((_, j) => {
            const idx = (Math.floor(coreExisting / BATCH_SIZE) + j) % domainFocuses.length;
            return domainFocuses[idx].substring(0, 30);
        });
        console.log(`  [Round ${roundNum}] ${coreExisting}/${LAYERS.CORE.target} — ${batchCount}x parallel [${domains.join(", ")}]`);
        
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => toSftJsonl(item, SYSTEM_PROMPT), LAYERS.CORE.file);
        stats.generated += added;
        stats.total += added;
        coreExisting += added;
        console.log(`    ✓ +${added} examples (total: ${coreExisting})`);
        
        if (added === 0) { stats.failed++; console.log("    ❌ All batches failed"); }
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 1 complete: ${countExistingLines(LAYERS.CORE.file)} examples`);

    // --- Layer 2: Messy Input ---
    console.log("\n📦 LAYER 2: Messy Input Examples (target: 1000)");
    let messyExisting = countExistingLines(LAYERS.MESSY.file);
    console.log(`  📊 Found ${messyExisting} existing entries`);
    
    roundNum = 0;
    while (messyExisting < LAYERS.MESSY.target) {
        roundNum++;
        const remaining = LAYERS.MESSY.target - messyExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            const domainIdx = (Math.floor(messyExisting / BATCH_SIZE) + j) % domainFocuses.length;
            prompts.push(messyPrompt(domainFocuses[domainIdx]));
        }
        
        console.log(`  [Round ${roundNum}] ${messyExisting}/${LAYERS.MESSY.target} — ${batchCount}x parallel`);
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => toSftJsonl(item, SYSTEM_PROMPT), LAYERS.MESSY.file);
        stats.generated += added;
        stats.total += added;
        messyExisting += added;
        console.log(`    ✓ +${added} examples (total: ${messyExisting})`);
        if (added === 0) stats.failed++;
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 2 complete: ${countExistingLines(LAYERS.MESSY.file)} examples`);

    // --- Layer 3: DPO ---
    console.log("\n📦 LAYER 3: Contrastive (DPO) Pairs (target: 1000)");
    let dpoExisting = countExistingLines(LAYERS.DPO.file);
    console.log(`  📊 Found ${dpoExisting} existing entries`);
    
    roundNum = 0;
    while (dpoExisting < LAYERS.DPO.target) {
        roundNum++;
        const remaining = LAYERS.DPO.target - dpoExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            const domainIdx = (Math.floor(dpoExisting / BATCH_SIZE) + j) % domainFocuses.length;
            const type = dpoExisting < 500 ? "quest" : "verify";
            prompts.push(dpoPrompt(domainFocuses[domainIdx], type));
        }
        
        console.log(`  [Round ${roundNum}] ${dpoExisting}/${LAYERS.DPO.target} — ${batchCount}x parallel`);
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => toDpoJsonl(item), LAYERS.DPO.file);
        stats.generated += added;
        stats.total += added;
        dpoExisting += added;
        console.log(`    ✓ +${added} DPO pairs (total: ${dpoExisting})`);
        if (added === 0) stats.failed++;
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 3 complete: ${countExistingLines(LAYERS.DPO.file)} DPO pairs`);

    // --- Layer 4: Edge Cases ---
    console.log("\n📦 LAYER 4: Edge Cases (target: 500)");
    let edgeExisting = countExistingLines(LAYERS.EDGE.file);
    console.log(`  📊 Found ${edgeExisting} existing entries`);
    
    roundNum = 0;
    while (edgeExisting < LAYERS.EDGE.target) {
        roundNum++;
        const remaining = LAYERS.EDGE.target - edgeExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            prompts.push(edgePrompt());
        }
        
        console.log(`  [Round ${roundNum}] ${edgeExisting}/${LAYERS.EDGE.target} — ${batchCount}x parallel`);
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => toSftJsonl(item, SYSTEM_PROMPT), LAYERS.EDGE.file);
        stats.generated += added;
        stats.total += added;
        edgeExisting += added;
        console.log(`    ✓ +${added} examples (total: ${edgeExisting})`);
        if (added === 0) stats.failed++;
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 4 complete: ${countExistingLines(LAYERS.EDGE.file)} examples`);

    // --- Layer 5: Difficulty Calibration ---
    console.log("\n📦 LAYER 5: Difficulty Calibration (target: 500)");
    let diffExisting = countExistingLines(LAYERS.DIFFICULTY.file);
    console.log(`  📊 Found ${diffExisting} existing entries`);
    
    roundNum = 0;
    while (diffExisting < LAYERS.DIFFICULTY.target) {
        roundNum++;
        const remaining = LAYERS.DIFFICULTY.target - diffExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            const domainIdx = (Math.floor(diffExisting / BATCH_SIZE) + j) % domainFocuses.length;
            prompts.push(difficultyPrompt(domainFocuses[domainIdx]));
        }
        
        console.log(`  [Round ${roundNum}] ${diffExisting}/${LAYERS.DIFFICULTY.target} — ${batchCount}x parallel`);
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => toSftJsonl(item, SYSTEM_PROMPT), LAYERS.DIFFICULTY.file);
        stats.generated += added;
        stats.total += added;
        diffExisting += added;
        console.log(`    ✓ +${added} examples (total: ${diffExisting})`);
        if (added === 0) stats.failed++;
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 5 complete: ${countExistingLines(LAYERS.DIFFICULTY.file)} examples`);

    // --- Layer 6: Verification ---
    console.log("\n📦 LAYER 6: Verification Tasks (target: 500)");
    let verifyExisting = countExistingLines(LAYERS.VERIFY.file);
    console.log(`  📊 Found ${verifyExisting} existing entries`);
    
    roundNum = 0;
    while (verifyExisting < LAYERS.VERIFY.target) {
        roundNum++;
        const remaining = LAYERS.VERIFY.target - verifyExisting;
        const batchCount = Math.min(CONCURRENCY, Math.ceil(remaining / BATCH_SIZE));
        
        const prompts = [];
        for (let j = 0; j < batchCount; j++) {
            const type = verifyExisting < 250 ? "trivia" : "code";
            prompts.push(verifyPrompt(type));
        }
        
        console.log(`  [Round ${roundNum}] ${verifyExisting}/${LAYERS.VERIFY.target} — ${batchCount}x parallel`);
        await sleep(PRE_DELAY);
        const added = await runParallelBatches(prompts, item => {
            if (item.messages) return JSON.stringify(item);
            return toSftJsonl(item, SYSTEM_PROMPT);
        }, LAYERS.VERIFY.file);
        stats.generated += added;
        stats.total += added;
        verifyExisting += added;
        console.log(`    ✓ +${added} examples (total: ${verifyExisting})`);
        if (added === 0) stats.failed++;
        await sleep(POST_DELAY);
    }
    console.log(`  ✅ Layer 6 complete: ${countExistingLines(LAYERS.VERIFY.file)} examples`);

    // --- Combine SFT layers ---
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
    const coreTotal = countExistingLines(LAYERS.CORE.file);
    const messyTotal = countExistingLines(LAYERS.MESSY.file);
    const dpoTotal = countExistingLines(LAYERS.DPO.file);
    const edgeTotal = countExistingLines(LAYERS.EDGE.file);
    const diffTotal = countExistingLines(LAYERS.DIFFICULTY.file);
    const verifyTotal = countExistingLines(LAYERS.VERIFY.file);

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
    console.log(`  Failed rounds:        ${stats.failed}`);
    console.log(`${'═'.repeat(60)}\n`);
}

main();
