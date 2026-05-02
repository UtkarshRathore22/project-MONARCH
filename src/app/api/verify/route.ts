import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTrivia, evaluateAnswer, checkCodeRelevance } from '@/lib/ai';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle photo upload (multipart/form-data)
    if (contentType.includes('multipart/form-data')) {
      return handlePhotoVerification(request);
    }

    // Handle JSON-based verification (trivia, reflection, git link)
    const body = await request.json();
    const { taskId, proofType, proofData } = body;

    if (!taskId || !proofType) {
      return NextResponse.json({ error: "Missing taskId or proofType" }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    switch (proofType) {
      case 'TRIVIA':
        return handleTriviaVerification(task, body);
      case 'REFLECTION':
        return handleReflectionVerification(task, proofData);
      case 'GIT_LINK':
        return handleGitLinkVerification(task, proofData);
      default:
        return NextResponse.json({ error: "Invalid proof type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}

// --- Generate trivia question for a task ---
export async function GET(request: Request) {
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

    // Generate a trivia question based on the task content
    const trivia = await generateTrivia(task.content, task.description || '');

    return NextResponse.json({ trivia });
  } catch (error) {
    console.error("Trivia generation error:", error);
    return NextResponse.json({ error: "Failed to generate trivia" }, { status: 500 });
  }
}

// --- Trivia Verification ---
async function handleTriviaVerification(
  task: { id: string; content: string; description: string | null },
  body: { answer: string; question: string; expectedAnswer: string }
) {
  const { answer, question, expectedAnswer } = body;

  if (!answer || !question) {
    return NextResponse.json({ error: "Missing answer or question" }, { status: 400 });
  }

  // Use AI to evaluate the answer
  const evaluation = await evaluateAnswer(question, expectedAnswer, answer);

  if (evaluation.verdict === 'CORRECT') {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        verifiedAt: new Date(),
        proofType: 'TRIVIA',
        proofData: JSON.stringify({ question, userAnswer: answer, verdict: 'CORRECT' }),
      }
    });

    return NextResponse.json({
      verified: true,
      message: evaluation.reason || "Correct! Quest verified.",
    });
  }

  return NextResponse.json({
    verified: false,
    message: evaluation.reason || "Incorrect answer.",
    hint: evaluation.hint || null,
  });
}

// --- Photo Verification ---
async function handlePhotoVerification(request: Request) {
  try {
    const formData = await request.formData();
    const taskId = formData.get('taskId') as string;
    const file = formData.get('photo') as File;
    const taskContent = formData.get('taskContent') as string;

    if (!taskId || !file) {
      return NextResponse.json({ error: "Missing taskId or photo" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Upload JPEG, PNG, or WebP." }, { status: 400 });
    }

    // Validate minimum file size (reject blank/tiny images — must be at least 10KB)
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength < 10240) {
      return NextResponse.json({
        verified: false,
        message: "Photo is too small. Please upload a clear, meaningful photo as proof.",
      });
    }

    // Save the photo to public/proofs/
    const proofsDir = path.join(process.cwd(), 'public', 'proofs');
    await mkdir(proofsDir, { recursive: true });

    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const fileName = `${taskId}_${Date.now()}.${ext}`;
    const filePath = path.join(proofsDir, fileName);

    await writeFile(filePath, Buffer.from(bytes));

    const publicPath = `/proofs/${fileName}`;

    // Verify with vision model — this is REQUIRED, not optional
    let aiVerified = false;
    let aiMessage = "";

    const taskDesc = taskContent || 'a productive activity';

    try {
      const imageBase64 = Buffer.from(bytes).toString('base64');

      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "llava-phi3",
          prompt: `You are a strict photo verification system. The user claims they completed this task: "${taskDesc}".

Look at this photo carefully and answer these questions:
1. What do you actually see in this photo? Describe it briefly.
2. Does the photo show evidence that the person is doing or has done "${taskDesc}"?
3. Is the photo relevant to the claimed task, or is it something completely unrelated?

IMPORTANT: Be STRICT. If the photo shows something unrelated to the task (e.g., a photo of studying submitted for a cooking task, or a random screenshot for an exercise task), you MUST reject it.

Respond in this exact format:
VERDICT: VERIFIED or REJECTED
SEEN: [what you see in the photo]
REASON: [why you verified or rejected it]`,
          images: [imageBase64],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (response.ok) {
        const result = await response.json();
        const text = (result.response || '').trim();
        console.log('[Vision Model Response]', text);

        // Parse the verdict from the response
        const verdictMatch = text.match(/VERDICT:\s*(VERIFIED|REJECTED)/i);
        if (verdictMatch) {
          aiVerified = verdictMatch[1].toUpperCase() === 'VERIFIED';
        } else {
          // Fallback: check if the response starts with or contains VERIFIED
          aiVerified = text.toUpperCase().includes('VERIFIED') && !text.toUpperCase().includes('REJECTED');
        }

        // Extract the reason for user feedback
        const reasonMatch = text.match(/REASON:\s*(.+)/i);
        const seenMatch = text.match(/SEEN:\s*(.+)/i);
        if (aiVerified) {
          aiMessage = reasonMatch ? reasonMatch[1].trim() : "Photo verified — content matches the task.";
        } else {
          const seen = seenMatch ? seenMatch[1].trim() : "unrelated content";
          const reason = reasonMatch ? reasonMatch[1].trim() : "Photo does not match the claimed task.";
          aiMessage = `Rejected: I see ${seen}. ${reason}`;
        }
      } else {
        // Ollama returned an error (e.g., model not loaded)
        const errBody = await response.text().catch(() => 'Unknown error');
        console.error('[Vision Model Error]', response.status, errBody);
        return NextResponse.json({
          verified: false,
          message: "Vision verification model returned an error. Please try again in a moment.",
          photoPath: publicPath,
        });
      }
    } catch (err) {
      // Vision model is completely unavailable (connection refused, timeout, etc.)
      console.error('[Vision Model Unavailable]', err);
      return NextResponse.json({
        verified: false,
        message: "Photo verification is currently unavailable — the vision AI model (llava-phi3) is not running. Please ensure Ollama is running with the llava-phi3 model loaded, then try again.",
        photoPath: publicPath,
      });
    }

    if (aiVerified) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          verifiedAt: new Date(),
          proofType: 'PHOTO',
          proofData: publicPath,
        }
      });
    }

    return NextResponse.json({
      verified: aiVerified,
      message: aiMessage,
      photoPath: publicPath,
    });
  } catch (error) {
    console.error("Photo verification error:", error);
    return NextResponse.json({ error: "Photo upload failed" }, { status: 500 });
  }
}

// --- Reflection Verification ---
async function handleReflectionVerification(
  task: { id: string; content: string; description: string | null },
  reflection: string
) {
  if (!reflection || reflection.trim().length < 20) {
    return NextResponse.json({
      verified: false,
      message: "Reflection must be at least 20 characters. Take a moment to write something meaningful.",
    });
  }

  // Use AI to verify the reflection is actually relevant to the task
  let isRelevant = false;
  let aiMessage = '';

  try {
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'phi3.5',
        prompt: `Task: "${task.content}"${task.description ? ` — ${task.description}` : ''}

The user submitted this reflection as proof of completion:
"${reflection.trim()}"

Does this reflection demonstrate that the user actually completed or engaged with the task? Be strict:
- The reflection must reference specific details related to the task
- Generic text like "it was good" or "I learned a lot" without specifics should be REJECTED
- Completely unrelated reflections must be REJECTED
- The reflection should show genuine engagement with the task topic

Respond in JSON: {"verdict": "RELEVANT" or "NOT_RELEVANT", "reason": "brief explanation"}`,
        format: 'json',
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const result = await response.json();
      let parsed;
      try {
        parsed = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
      } catch {
        parsed = { verdict: 'NOT_RELEVANT', reason: 'Could not parse AI response.' };
      }
      isRelevant = parsed.verdict === 'RELEVANT';
      aiMessage = parsed.reason || '';
    }
  } catch (err) {
    console.error('[Reflection AI Check Failed]', err);
    // If AI is unavailable, reject — don't auto-accept
    return NextResponse.json({
      verified: false,
      message: "Verification AI is currently unavailable. Please try again in a moment.",
    });
  }

  if (!isRelevant) {
    return NextResponse.json({
      verified: false,
      message: aiMessage || "Your reflection doesn't appear to be related to the task. Please write about what you actually did or learned.",
    });
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      verifiedAt: new Date(),
      proofType: 'REFLECTION',
      proofData: reflection.trim(),
    }
  });

  return NextResponse.json({
    verified: true,
    message: "Reflection verified — your response demonstrates genuine task engagement.",
  });
}

// --- Git Link Verification ---
async function handleGitLinkVerification(
  task: { id: string; content: string; description: string | null },
  gitUrl: string
) {
  if (!gitUrl || !gitUrl.trim()) {
    return NextResponse.json({ verified: false, message: "Please provide a Git URL." });
  }

  // Validate URL format — must be a proper git hosting URL
  const gitUrlPattern = /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/i;
  if (!gitUrlPattern.test(gitUrl.trim())) {
    return NextResponse.json({
      verified: false,
      message: "Invalid URL. Must be a GitHub, GitLab, or Bitbucket link.",
    });
  }

  // Must be a specific commit URL, PR URL, or issue URL — not just a repo link
  const commitPattern = /\/(commit|pull|merge_requests|issues)\/[a-f0-9]+/i;
  const isSpecificLink = commitPattern.test(gitUrl.trim());

  if (!isSpecificLink) {
    return NextResponse.json({
      verified: false,
      message: "Please submit a specific commit, pull request, or issue URL — not a general repo link. Example: https://github.com/user/repo/commit/abc123",
    });
  }

  // Try to fetch commit info from GitHub API
  let commitMessage = '';
  let filesChanged: string[] = [];
  let fetchedCommitData = false;

  const githubCommitMatch = gitUrl.match(/github\.com\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]+)/i);
  if (githubCommitMatch) {
    try {
      const [, owner, repo, sha] = githubCommitMatch;
      const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Monarch-App' },
        signal: AbortSignal.timeout(10000),
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        commitMessage = data.commit?.message || '';
        filesChanged = (data.files || []).map((f: { filename: string }) => f.filename);
        fetchedCommitData = true;
      } else if (apiRes.status === 404) {
        return NextResponse.json({
          verified: false,
          message: "Commit not found. The repository may be private or the commit hash is invalid.",
        });
      }
    } catch {
      // GitHub API failed — we'll still try AI verification below
    }
  }

  // Verify relevance with AI
  if (fetchedCommitData && commitMessage) {
    const relevance = await checkCodeRelevance(task.content, task.description || '', commitMessage, filesChanged);

    if (relevance.verdict === 'NOT_RELEVANT') {
      return NextResponse.json({
        verified: false,
        message: relevance.reason || "This commit doesn't appear related to the task.",
        commitMessage,
        filesChanged,
      });
    }

    // AI confirmed it's relevant
    await prisma.task.update({
      where: { id: task.id },
      data: {
        verifiedAt: new Date(),
        proofType: 'GIT_LINK',
        proofData: gitUrl.trim(),
      }
    });

    return NextResponse.json({
      verified: true,
      message: `Git commit verified: "${commitMessage.substring(0, 80)}"`,
      commitMessage,
      filesChanged,
    });
  }

  // Could not fetch commit data — don't auto-accept, reject instead
  return NextResponse.json({
    verified: false,
    message: "Could not verify this link. Please ensure the repository is public and the URL is a valid commit link.",
  });
}
