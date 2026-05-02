// Using Local Ollama instance running the monarch-architect model
// monarch-architect = fine-tuned for task structuring (evaluateTask only)
// phi3.5 = general-purpose model used for verification judgments (trivia, relevance, etc.)

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const MODEL_NAME = 'monarch-architect';
const VERIFICATION_MODEL = 'phi3.5';

// Query monarch-architect for task structuring
async function queryOllama(prompt: string, systemPrompt?: string) {
  const body: Record<string, unknown> = {
    model: MODEL_NAME,
    prompt: prompt,
    format: "json",
    stream: false,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const result = await response.json();
  let text = result.response;

  // Clean up if it includes markdown blocks
  if (text.startsWith('```json')) {
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  } else if (text.startsWith('```')) {
    text = text.replace(/```/g, '').trim();
  }

  return JSON.parse(text);
}

// Query phi3.5 for verification judgments (trivia eval, code relevance, etc.)
async function queryVerificationModel(prompt: string, systemPrompt?: string) {
  const body: Record<string, unknown> = {
    model: VERIFICATION_MODEL,
    prompt: prompt,
    format: "json",
    stream: false,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Verification model error: ${response.statusText}`);
  }

  const result = await response.json();
  let text = result.response;

  if (text.startsWith('```json')) {
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
  } else if (text.startsWith('```')) {
    text = text.replace(/```/g, '').trim();
  }

  return JSON.parse(text);
}

// --- Content-based heuristic fallback ---

function inferFromContent(content: string) {
  const lower = content.toLowerCase();

  // Category inference
  let category = 'PERSONAL';
  if (/\b(code|bug|deploy|api|server|database|pr|merge|sprint|jira|standup|meeting|report|email|client|project|deadline)\b/.test(lower)) category = 'WORK';
  else if (/\b(gym|run|workout|exercise|pushup|squat|walk|swim|yoga|diet|weight|health|sleep|meditat)\b/.test(lower)) category = 'HEALTH';
  else if (/\b(study|learn|read|course|tutorial|exam|quiz|practice|research|homework|lecture|book|chapter)\b/.test(lower)) category = 'LEARNING';
  else if (/\b(budget|save|invest|tax|bill|payment|expense|salary|finance|bank)\b/.test(lower)) category = 'FINANCE';
  else if (/\b(draw|paint|write|design|music|art|compose|sketch|photo|video|blog|create|build)\b/.test(lower)) category = 'CREATIVE';

  // Stat alignment inference
  let statAlignment = 'WIS';
  if (category === 'HEALTH') statAlignment = 'STR';
  else if (category === 'WORK' || category === 'LEARNING') statAlignment = 'INT';
  else if (category === 'CREATIVE' || category === 'FINANCE' || category === 'PERSONAL') statAlignment = 'WIS';

  // Difficulty inference
  let difficulty = 'MODERATE';
  if (/\b(quick|simple|easy|small|minor|short|brief|5 min|10 min|15 min)\b/.test(lower)) difficulty = 'EASY';
  else if (/\b(hard|complex|difficult|major|big|full|intensive|deep|complete|entire|whole|rebuild|refactor)\b/.test(lower)) difficulty = 'HARD';

  return { category, statAlignment, difficulty };
}

// --- Task Evaluation ---

export async function evaluateTask(taskContent: string) {
  try {
    const prompt = `Process the following task input and return structured task data:\n"${taskContent}"`;
    const evaluation = await queryOllama(prompt);

    const xpReward = evaluation.xpReward
      ? parseInt(evaluation.xpReward)
      : Math.round(15 * (evaluation.severity || 1));

    // Use AI values but validate them against known enums
    const validCategories = ['WORK', 'HEALTH', 'LEARNING', 'PERSONAL', 'FINANCE', 'CREATIVE'];
    const validStats = ['STR', 'INT', 'WIS'];
    const validDifficulty = ['EASY', 'MODERATE', 'HARD'];

    const heuristic = inferFromContent(taskContent);

    return {
      cleanTitle: evaluation.cleanTitle || null,
      actionableTask: evaluation.actionableTask || null,
      category: validCategories.includes(evaluation.category) ? evaluation.category : heuristic.category,
      statAlignment: validStats.includes(evaluation.statAlignment) ? evaluation.statAlignment : heuristic.statAlignment,
      priority: evaluation.priority || 1,
      severity: evaluation.severity || 1,
      difficulty: validDifficulty.includes(evaluation.difficulty) ? evaluation.difficulty : heuristic.difficulty,
      xpReward: xpReward,
      estimatedTime: evaluation.estimatedTime || "Medium",
    };
  } catch (error) {
    console.error("AI Evaluation failed:", error);
    // Smart fallback using content analysis instead of static defaults
    const heuristic = inferFromContent(taskContent);
    return {
      cleanTitle: null,
      actionableTask: null,
      category: heuristic.category,
      statAlignment: heuristic.statAlignment,
      priority: 3,
      severity: 3,
      difficulty: heuristic.difficulty,
      xpReward: 45,
      estimatedTime: "Medium",
    };
  }
}

// --- Trivia Generation ---

export async function generateTrivia(taskTitle: string, taskDescription: string) {
  try {
    const prompt = `Task completed: '${taskTitle}'${taskDescription ? ` — ${taskDescription}` : ''}`;
    const systemPrompt = `Generate a trivia question to verify the user completed a learning/coding task. The question should test understanding, not just recall. Respond in JSON with fields: question (string), expectedAnswer (string), difficulty (EASY|MODERATE|HARD).`;

    const result = await queryVerificationModel(prompt, systemPrompt);

    return {
      question: result.question || "What did you learn from this task?",
      expectedAnswer: result.expectedAnswer || "",
      difficulty: result.difficulty || "MODERATE",
    };
  } catch (error) {
    console.error("Trivia generation failed:", error);
    // Fallback: generic question
    return {
      question: `Explain in your own words what you accomplished for: "${taskTitle}"`,
      expectedAnswer: "",
      difficulty: "MODERATE",
    };
  }
}

// --- Answer Evaluation ---

export async function evaluateAnswer(question: string, expectedAnswer: string, userAnswer: string) {
  try {
    const prompt = `Question: '${question}'\nExpected: '${expectedAnswer}'\nUser answered: '${userAnswer}'`;
    const systemPrompt = `Evaluate if the user's answer demonstrates understanding. Be fair but rigorous. Accept informal language if the core concept is correct. Respond in JSON with fields: verdict (CORRECT|INCORRECT), reason (string), hint (string or null).`;

    const result = await queryVerificationModel(prompt, systemPrompt);

    return {
      verdict: result.verdict === 'CORRECT' ? 'CORRECT' : 'INCORRECT',
      reason: result.reason || (result.verdict === 'CORRECT' ? 'Answer accepted.' : 'Answer not sufficient.'),
      hint: result.hint || null,
    };
  } catch (error) {
    console.error("Answer evaluation failed:", error);
    // If AI fails, reject — don't give free passes
    return {
      verdict: 'INCORRECT' as const,
      reason: "Verification AI is temporarily unavailable. Please try again in a moment.",
      hint: null,
    };
  }
}

// --- Code Relevance Check ---

export async function checkCodeRelevance(
  taskTitle: string,
  taskDescription: string,
  commitMessage: string,
  filesChanged: string[]
) {
  try {
    const filesStr = filesChanged.length > 0
      ? `Files changed: ${filesChanged.slice(0, 10).join(', ')}`
      : 'No file info available';

    const prompt = `Task: '${taskTitle}'${taskDescription ? ` — ${taskDescription}` : ''}\nCommit message: '${commitMessage}'\n${filesStr}\nIs this commit relevant to the task?`;
    const systemPrompt = `Check if a git commit is genuinely relevant to the claimed task. Be strict — tangentially related commits should be rejected. Respond in JSON with fields: verdict (RELEVANT|NOT_RELEVANT), reason (string).`;

    const result = await queryVerificationModel(prompt, systemPrompt);

    return {
      verdict: result.verdict === 'RELEVANT' ? 'RELEVANT' : 'NOT_RELEVANT',
      reason: result.reason || 'Unable to determine relevance.',
    };
  } catch (error) {
    console.error("Code relevance check failed:", error);
    // If AI fails, reject — don't accept unverified links
    return {
      verdict: 'NOT_RELEVANT' as const,
      reason: "Verification AI is temporarily unavailable. Please try again in a moment.",
    };
  }
}
