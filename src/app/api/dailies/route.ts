import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ message: "No userId provided." });
    }

    let user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return NextResponse.json({ message: "No user found." });

    const now = new Date();
    const lastLogin = new Date(user.lastLogin);
    
    // Check if it's a new day (ignoring time)
    const isNewDay = now.getFullYear() > lastLogin.getFullYear() ||
                     now.getMonth() > lastLogin.getMonth() ||
                     now.getDate() > lastLogin.getDate();

    // Use a separate Date for todayStart to avoid mutating `now`
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // === PENALTY CHECK (runs EVERY request, not just on new days) ===
    // This prevents the deadlock where penalty persists across days
    if (user.isPenalized) {
      const pendingPenalty = await prisma.task.findFirst({
        where: { userId: user.id, type: "PENALTY", status: "PENDING" }
      });
      
      if (!pendingPenalty) {
        // Check if they completed a penalty quest (status=COMPLETED exists)
        const completedPenalty = await prisma.task.findFirst({
          where: { userId: user.id, type: "PENALTY", status: "COMPLETED" }
        });
        
        if (completedPenalty) {
          // Penalty cleared — they completed it
          user = await prisma.user.update({
            where: { id: user.id },
            data: { isPenalized: false }
          });
        } else {
          // Penalized but no penalty quest exists at all — create one so they can escape
          await prisma.task.create({
            data: {
              userId: user.id,
              content: "SURVIVE THE PENALTY ZONE: Complete 100 Push-ups",
              priority: 5,
              severity: 5,
              statAlignment: "STR",
              xpReward: 0,
              type: "PENALTY",
              status: "PENDING"
            }
          });
        }
      }
    }

    // Re-fetch user in case penalty status changed
    user = await prisma.user.findUnique({ where: { id: userId } }) || user;
    
    // Check if they have ANY daily quests for today
    const todaysDailies = await prisma.task.findMany({
      where: {
        userId: user.id,
        type: 'DAILY',
        createdAt: { gte: todayStart }
      }
    });

    if (isNewDay || todaysDailies.length === 0) {
      // 1. Check if they had DAILY quests from yesterday (only unfailed ones)
      const yesterdayDailies = await prisma.task.findMany({
        where: {
          userId: user.id,
          type: 'DAILY',
          createdAt: { lt: todayStart },
          status: { not: 'FAILED' } // Only check ones not already marked
        }
      });

      const failedDailies = yesterdayDailies.filter(task => task.status !== 'COMPLETED');

      // 2. Determine Penalty
      let applyPenalty = false;
      if (isNewDay && yesterdayDailies.length > 0 && failedDailies.length > 0) {
        applyPenalty = true;
      }

      // Mark uncompleted dailies as FAILED
      if (failedDailies.length > 0) {
        await prisma.task.updateMany({
          where: { id: { in: failedDailies.map(t => t.id) } },
          data: { status: 'FAILED' }
        });
      }

      // 3. Apply Penalty Quest if they failed (and aren't already penalized)
      if (applyPenalty && !user.isPenalized) {
        await prisma.task.create({
          data: {
            userId: user.id,
            content: "SURVIVE THE PENALTY ZONE: Complete 100 Push-ups",
            priority: 5,
            severity: 5,
            statAlignment: "STR",
            xpReward: 0,
            type: "PENALTY",
            status: "PENDING"
          }
        });
      }

      // 4. Update user status
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isPenalized: applyPenalty || user.isPenalized,
          lastLogin: new Date()
        }
      });

      // 5. Generate NEW Daily Quests if not penalized and they don't have any for today
      if (!applyPenalty && !user.isPenalized && todaysDailies.length === 0) {
        const standardDailies = [
          { content: "Complete 100 Push-ups", statAlignment: "STR", category: "HEALTH" },
          { content: "Complete 100 Sit-ups", statAlignment: "STR", category: "HEALTH" },
          { content: "Complete 100 Squats", statAlignment: "STR", category: "HEALTH" },
          { content: "Run 10 Kilometers", statAlignment: "STR", category: "HEALTH" }
        ];

        for (const daily of standardDailies) {
          await prisma.task.create({
            data: {
              userId: user.id,
              content: daily.content,
              priority: 5,
              severity: 3,
              statAlignment: daily.statAlignment,
              xpReward: 45,
              difficulty: "MODERATE",
              category: daily.category,
              type: "DAILY",
              status: "PENDING"
            }
          });
        }
      }
    }

    return NextResponse.json({ user, isNewDay });
  } catch (error) {
    console.error("Error processing dailies:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
