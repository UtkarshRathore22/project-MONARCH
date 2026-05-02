import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  EASY: 0.5,
  MODERATE: 1.0,
  HARD: 2.0,
};

function calculateXpReward(severity: number, difficulty: string): number {
  const multiplier = DIFFICULTY_MULTIPLIERS[difficulty] || 1.0;
  return Math.round(15 * severity * multiplier);
}

// Fallback quest templates when AI fails
function generateFallbackQuests(goals: { slot: number; content: string }[], difficulty: string) {
  const templates: Record<string, { prefix: string; statAlignment: string; category: string }[]> = {
    EASY: [
      { prefix: "Research basics of", statAlignment: "INT", category: "LEARNING" },
      { prefix: "Spend 15 minutes on", statAlignment: "WIS", category: "PERSONAL" },
      { prefix: "Write a short plan for", statAlignment: "INT", category: "WORK" },
      { prefix: "Read an article about", statAlignment: "INT", category: "LEARNING" },
      { prefix: "Take notes on", statAlignment: "WIS", category: "LEARNING" },
    ],
    MODERATE: [
      { prefix: "Complete a 1-hour session of", statAlignment: "STR", category: "HEALTH" },
      { prefix: "Build a practice project for", statAlignment: "INT", category: "WORK" },
      { prefix: "Study and summarize", statAlignment: "INT", category: "LEARNING" },
      { prefix: "Create a detailed plan for", statAlignment: "WIS", category: "PERSONAL" },
      { prefix: "Practice and apply", statAlignment: "STR", category: "HEALTH" },
    ],
    HARD: [
      { prefix: "Deep dive: 3-hour focused session on", statAlignment: "INT", category: "LEARNING" },
      { prefix: "Complete an advanced challenge in", statAlignment: "STR", category: "HEALTH" },
      { prefix: "Build and ship a deliverable for", statAlignment: "INT", category: "WORK" },
      { prefix: "Teach someone about", statAlignment: "WIS", category: "LEARNING" },
      { prefix: "Master a new technique in", statAlignment: "STR", category: "HEALTH" },
    ],
  };

  const selected = templates[difficulty] || templates.MODERATE;
  return selected.map((tmpl, i) => {
    const goal = goals[i % goals.length];
    return {
      cleanTitle: `${tmpl.prefix} ${goal.content}`,
      statAlignment: tmpl.statAlignment,
      category: tmpl.category,
      priority: difficulty === 'HARD' ? 4 : difficulty === 'EASY' ? 2 : 3,
      severity: difficulty === 'HARD' ? 4 : difficulty === 'EASY' ? 2 : 3,
    };
  });
}

export async function POST(request: Request) {
  try {
    const { userId, difficulty = 'MODERATE' } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const validDifficulties = ['EASY', 'MODERATE', 'HARD'];
    const selectedDifficulty = validDifficulties.includes(difficulty) ? difficulty : 'MODERATE';

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user) throw new Error("User not found");

    // 1. Fetch user's active goals
    const goals = await prisma.goal.findMany({
      where: { userId: user.id, content: { not: "" } },
      orderBy: { slot: 'asc' }
    });

    if (goals.length === 0) {
      return NextResponse.json({ error: "No active goals found. Please set your goals first." }, { status: 400 });
    }

    const goalsText = goals.map(g => `- ${g.content}`).join("\n");

    const difficultyGuidelines: Record<string, string> = {
      EASY: "Tasks should be simple, quick (under 30 minutes), and easy to accomplish.",
      MODERATE: "Tasks should take 30 minutes to 2 hours. Clear and actionable.",
      HARD: "Tasks should be challenging, multi-step, and take 2+ hours.",
    };
    
    // Prompt the model to generate tasks
    const prompt = `You are a productivity assistant. Generate exactly 5 practical tasks based on these goals:

${goalsText}

Difficulty: ${selectedDifficulty} - ${difficultyGuidelines[selectedDifficulty]}

Return a JSON object with a "tasks" array containing exactly 5 objects. Each object must have:
- "cleanTitle": short task title (3-8 words)
- "actionableTask": clear 1-sentence description of what to do
- "category": one of WORK, HEALTH, LEARNING, PERSONAL, FINANCE, CREATIVE
- "statAlignment": STR for physical, INT for mental/technical, WIS for planning/creative
- "priority": number 1-5
- "severity": number 1-5

Example format:
{"tasks": [{"cleanTitle": "Run 5 kilometers", "actionableTask": "Go for a 5km run at moderate pace", "category": "HEALTH", "statAlignment": "STR", "priority": 3, "severity": 3}]}`;

    let generatedTasks: Array<{
      cleanTitle?: string; title?: string; content?: string;
      actionableTask?: string; category?: string; statAlignment?: string;
      priority?: number; severity?: number;
    }> = [];

    // 2. Try querying Ollama (use phi3.5 for better multi-task generation)
    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "phi3.5",
          prompt: prompt,
          format: "json",
          stream: false,
          options: { temperature: 0.7 }
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const result = await response.json();
        let text = result.response || '';
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
          const parsed = JSON.parse(text);
          
          // Handle different possible response structures
          if (Array.isArray(parsed)) {
            generatedTasks = parsed;
          } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
            generatedTasks = parsed.tasks;
          } else if (parsed.quests && Array.isArray(parsed.quests)) {
            generatedTasks = parsed.quests;
          } else {
            // Single object response — not useful
            generatedTasks = [];
          }
        } catch {
          console.error("Failed to parse AI response:", text);
        }
      }
    } catch (err) {
      console.error("Ollama query failed:", err);
    }

    // 3. Filter out tasks with empty titles
    generatedTasks = generatedTasks.filter(t => {
      const title = t.cleanTitle || t.title || t.content;
      return title && title.trim().length > 0;
    });

    // 4. If AI returned nothing useful, use the fallback template system
    if (generatedTasks.length === 0) {
      console.log("AI returned no valid tasks — using fallback templates");
      generatedTasks = generateFallbackQuests(goals, selectedDifficulty);
    }

    const tasksToProcess = generatedTasks.slice(0, 5);

    // 5. Save generated tasks to the database
    const savedTasks = [];
    for (const t of tasksToProcess) {
      const content = t.cleanTitle || t.title || t.content;
      if (!content) continue;

      const severity = Math.min(Math.max(t.severity || 3, 1), 5);
      const xpReward = calculateXpReward(severity, selectedDifficulty);
      
      const task = await prisma.task.create({
        data: {
          userId: user.id,
          content: content,
          description: t.actionableTask || null,
          priority: Math.min(Math.max(t.priority || 3, 1), 5),
          severity: severity,
          statAlignment: t.statAlignment || "STR",
          xpReward: xpReward,
          difficulty: selectedDifficulty,
          category: t.category || "PERSONAL",
          status: 'PENDING'
        }
      });
      savedTasks.push(task);
    }

    return NextResponse.json({ tasks: savedTasks });
  } catch (error) {
    console.error("Auto Quest Generation failed:", error);
    return NextResponse.json({ error: "Failed to generate auto quests. Is Ollama running?" }, { status: 500 });
  }
}
