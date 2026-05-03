import "dotenv/config";

const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GROQ_KEY) {
  console.error("❌ GROQ_API_KEY is required in .env");
  process.exit(1);
}

const prompt = `Generate a JSON array of 3 productivity tasks. Each must have: cleanTitle (2-6 words), actionableTask (1 sentence), category (one of WORK, HEALTH, LEARNING), statAlignment (one of STR, INT, WIS), priority (1-5), severity (1-5), difficulty (one of EASY, MODERATE, HARD). Return ONLY a valid JSON array.`;

const models = [
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "openai/gpt-oss-120b",
];

async function testModel(model) {
  const start = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    const data = await res.json();
    const ms = Date.now() - start;

    if (data.error) {
      console.log(`\n=== ${model} === FAILED: ${data.error.message}`);
      return;
    }

    const tok = data.usage;
    console.log(`\n=== ${model} === (${ms}ms)`);
    console.log(`  Tokens: ${tok.prompt_tokens} in / ${tok.completion_tokens} out / total ${tok.total_tokens}`);

    const txt = data.choices[0].message.content;
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed) ? parsed : Object.values(parsed).find(v => Array.isArray(v));
    
    if (arr) {
      console.log(`  Items: ${arr.length}`);
      console.log(`  Fields present:`, Object.keys(arr[0]).join(", "));
      console.log(`  Sample:`, JSON.stringify(arr[0]).substring(0, 250));
    } else {
      console.log(`  PARSE ISSUE — keys: ${Object.keys(parsed).join(", ")}`);
      console.log(`  Raw:`, txt.substring(0, 300));
    }
  } catch (e) {
    console.log(`\n=== ${model} === ERROR: ${e.message}`);
  }
}

(async () => {
  console.log("Testing Groq models for structured JSON generation...\n");
  for (const m of models) {
    await testModel(m);
    await new Promise(r => setTimeout(r, 2000)); // avoid rate limit
  }
  console.log("\n✅ Done");
})();
