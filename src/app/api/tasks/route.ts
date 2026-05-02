import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateTask } from '@/lib/ai';

// --- Balancing Constants ---

const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  EASY: 0.5,
  MODERATE: 1.0,
  HARD: 2.0,
};

const STAT_GAIN_CHANCES: Record<string, { chance: number; bonusChance: number }> = {
  EASY: { chance: 0.3, bonusChance: 0 },
  MODERATE: { chance: 0.6, bonusChance: 0 },
  HARD: { chance: 1.0, bonusChance: 0.2 },
};

const MAX_LEVEL = 100;

/** XP required to reach the next level: 80 * level^1.5 */
function xpForNextLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.5));
}

/** Calculate XP reward: 15 * severity * difficulty_multiplier */
function calculateXpReward(severity: number, difficulty: string): number {
  const multiplier = DIFFICULTY_MULTIPLIERS[difficulty] || 1.0;
  return Math.round(15 * severity * multiplier);
}

/** Determine rank from level */
function getRankFromLevel(level: number): string {
  if (level >= 91) return 'S';
  if (level >= 76) return 'A';
  if (level >= 61) return 'B+';
  if (level >= 41) return 'B';
  if (level >= 26) return 'C';
  if (level >= 11) return 'D';
  return 'E';
}

/** Roll for stat gain based on difficulty */
function rollStatGain(difficulty: string): number {
  const config = STAT_GAIN_CHANCES[difficulty] || STAT_GAIN_CHANCES.MODERATE;
  const roll = Math.random();
  if (roll > config.chance) return 0; // no stat gain
  // Got at least +1, check for bonus
  const bonusRoll = Math.random();
  if (bonusRoll < config.bonusChance) return 2; // +2 stat
  return 1;
}

/** Determine what proof type is needed for this task */
function getRequiredProofType(task: { statAlignment: string | null; type: string; category: string }): string {
  // Dailies are physical → photo
  if (task.type === 'DAILY') return 'PHOTO';
  // Penalty tasks → no verification needed (just survival)
  if (task.type === 'PENALTY') return 'NONE';

  // Based on stat alignment
  switch (task.statAlignment) {
    case 'STR': return 'PHOTO';
    case 'INT': return 'TRIVIA'; // Trivia or Git Link (user chooses in modal)
    case 'WIS': return 'REFLECTION';
    default: return 'REFLECTION';
  }
}

// --- API Handlers ---

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ tasks: [] });

    const tasks = await prisma.task.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { content, userId, priority: manualPriority, severity: manualSeverity, difficulty: manualDifficulty } = await request.json();

    if (!content || !userId) {
      return NextResponse.json({ error: "Missing task content or userId" }, { status: 400 });
    }

    const evaluation = await evaluateTask(content);

    const finalPriority = manualPriority !== undefined ? manualPriority : evaluation.priority;
    const finalSeverity = manualSeverity !== undefined ? manualSeverity : evaluation.severity;
    const finalDifficulty = manualDifficulty || evaluation.difficulty || 'MODERATE';

    const xpReward = calculateXpReward(finalSeverity, finalDifficulty);

    // Use AI-generated cleanTitle if available, otherwise fall back to user's raw input
    const taskContent = evaluation.cleanTitle || content;
    // Store the AI-generated actionable task description
    const taskDescription = evaluation.actionableTask || null;

    const task = await prisma.task.create({
      data: {
        userId: userId,
        content: taskContent,
        description: taskDescription,
        priority: finalPriority,
        severity: finalSeverity,
        statAlignment: evaluation.statAlignment,
        xpReward: xpReward,
        difficulty: finalDifficulty,
        category: evaluation.category || 'PERSONAL',
        status: 'PENDING'
      }
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { taskId, status, skipVerification } = await request.json();

    if (!taskId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Determine what verification is needed
    const requiredProof = getRequiredProofType(task);

    // If completing and verification is required but not yet done
    // skipVerification=true means the task was already verified via /api/verify
    if (status === "COMPLETED" && requiredProof !== 'NONE' && !task.verifiedAt && !skipVerification) {
      // Don't complete yet — return the proof requirement
      return NextResponse.json({
        task,
        requiresVerification: true,
        proofType: requiredProof,
      });
    }

    // Update the task status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { status }
    });

    // Award XP and stats on completion
    if (status === "COMPLETED") {
      const stat = await prisma.playerStat.findUnique({
        where: { userId: updatedTask.userId }
      });

      if (stat) {
        let newXp = stat.xp + updatedTask.xpReward;
        let newLevel = stat.level;
        let leveledUp = false;

        // Level-up loop (can level multiple times from big XP rewards)
        while (newLevel < MAX_LEVEL) {
          const required = xpForNextLevel(newLevel);
          if (newXp >= required) {
            newLevel += 1;
            newXp -= required;
            leveledUp = true;
          } else {
            break;
          }
        }

        // Cap at max level
        if (newLevel >= MAX_LEVEL) {
          newLevel = MAX_LEVEL;
        }

        // Probabilistic stat gain based on difficulty
        const statGain = rollStatGain(updatedTask.difficulty);
        const newRank = getRankFromLevel(newLevel);

        const updatedStat = await prisma.playerStat.update({
          where: { id: stat.id },
          data: {
            level: newLevel,
            xp: newXp,
            rank: newRank,
            str: updatedTask.statAlignment === "STR" ? stat.str + statGain : stat.str,
            int: updatedTask.statAlignment === "INT" ? stat.int + statGain : stat.int,
            wis: updatedTask.statAlignment === "WIS" ? stat.wis + statGain : stat.wis,
          }
        });

        return NextResponse.json({ task: updatedTask, stats: updatedStat, leveledUp, statGain });
      }
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id: taskId } });

    return NextResponse.json({ success: true, deletedId: taskId });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
