import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MAX_LEVEL = 100;

function xpForNextLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.5));
}

function getRankFromLevel(level: number): string {
  if (level >= 91) return 'S';
  if (level >= 76) return 'A';
  if (level >= 61) return 'B+';
  if (level >= 41) return 'B';
  if (level >= 26) return 'C';
  if (level >= 11) return 'D';
  return 'E';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { stats: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // XP overflow fix: if XP exceeds the level-up threshold, recalculate
    if (user.stats) {
      let { xp, level } = user.stats;
      const required = xpForNextLevel(level);

      if (xp >= required && level < MAX_LEVEL) {
        // Run the level-up loop to correct overflow
        let newXp = xp;
        let newLevel = level;

        while (newLevel < MAX_LEVEL) {
          const req = xpForNextLevel(newLevel);
          if (newXp >= req) {
            newLevel += 1;
            newXp -= req;
          } else {
            break;
          }
        }

        if (newLevel >= MAX_LEVEL) {
          newLevel = MAX_LEVEL;
          newXp = 0;
        }

        const newRank = getRankFromLevel(newLevel);

        // Save the corrected values
        await prisma.playerStat.update({
          where: { id: user.stats.id },
          data: { xp: newXp, level: newLevel, rank: newRank }
        });

        // Return corrected user
        const correctedUser = await prisma.user.findUnique({
          where: { id: userId },
          include: { stats: true }
        });
        return NextResponse.json({ user: correctedUser });
      }
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId, name } = await request.json();

    if (!userId || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update the user's name
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name: name }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
