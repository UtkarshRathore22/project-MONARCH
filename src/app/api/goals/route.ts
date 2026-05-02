import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ goals: [] });
    }

    const goals = await prisma.goal.findMany({
      where: { userId: userId },
      orderBy: { slot: 'asc' }
    });

    return NextResponse.json({ goals });
  } catch (error) {
    console.error("Error fetching goals:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { slot, content, userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const existingGoal = await prisma.goal.findFirst({
      where: { userId: userId, slot }
    });

    let goal;
    if (existingGoal) {
      goal = await prisma.goal.update({
        where: { id: existingGoal.id },
        data: { content }
      });
    } else {
      goal = await prisma.goal.create({
        data: {
          userId: userId,
          slot,
          content
        }
      });
    }

    return NextResponse.json({ goal });
  } catch (error) {
    console.error("Error updating goal:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
