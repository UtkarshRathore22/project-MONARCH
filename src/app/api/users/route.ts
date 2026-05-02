import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        isPenalized: true,
        stats: {
          select: {
            level: true,
            rank: true
          }
        }
      }
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const totalUsers = await prisma.user.count();
    const newName = `PLAYER ${totalUsers + 1}`;

    const newUser = await prisma.user.create({
      data: {
        name: newName,
        stats: { create: {} }
      },
      include: { stats: true }
    });

    return NextResponse.json({ user: newUser });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
