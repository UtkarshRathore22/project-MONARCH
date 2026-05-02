import React, { useState, useRef, useEffect } from 'react';

type VerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  task: {
    id: string;
    content: string;
    description: string | null;
    statAlignment: string;
    type: string;
    category: string;
  };
  proofType: string; // TRIVIA, PHOTO, REFLECTION, GIT_LINK
};

export default function VerificationModal({
  isOpen,
  onClose,
  onVerified,
  task,
  proofType,
}: VerificationModalProps) {
  const [phase, setPhase] = useState<'choose' | 'trivia' | 'photo' | 'reflection' | 'git'>('choose');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [retriesLeft, setRetriesLeft] = useState(3);
  const [initialized, setInitialized] = useState(false);

  // Trivia state
  const [triviaQuestion, setTriviaQuestion] = useState('');
  const [triviaExpectedAnswer, setTriviaExpectedAnswer] = useState('');
  const [triviaAnswer, setTriviaAnswer] = useState('');
  const [triviaHint, setTriviaHint] = useState<string | null>(null);

  // Photo state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reflection state
  const [reflection, setReflection] = useState('');

  // Git state
  const [gitUrl, setGitUrl] = useState('');

  // Initialize the correct phase based on proofType when the modal opens
  useEffect(() => {
    if (isOpen && !initialized) {
      if (proofType === 'PHOTO') {
        setPhase('photo');
      } else if (proofType === 'REFLECTION') {
        setPhase('reflection');
      } else if (proofType === 'TRIVIA') {
        setPhase('choose'); // INT users choose between trivia and git
      } else {
        setPhase('choose');
      }
      setInitialized(true);
    }
    if (!isOpen) {
      // Reset state when modal closes
      setInitialized(false);
    }
  }, [isOpen, proofType, initialized]);

  if (!isOpen) return null;

  const startPhase = (p: 'trivia' | 'photo' | 'reflection' | 'git') => {
    setPhase(p);
    setMessage(null);
    setIsSuccess(false);

    if (p === 'trivia') {
      loadTrivia();
    }
  };

  const loadTrivia = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/verify?taskId=${task.id}`);
      const data = await res.json();
      if (data.trivia) {
        setTriviaQuestion(data.trivia.question);
        setTriviaExpectedAnswer(data.trivia.expectedAnswer);
      }
    } catch {
      setTriviaQuestion(`Explain what you learned or accomplished for: "${task.content}"`);
    } finally {
      setIsLoading(false);
    }
  };

  const submitTrivia = async () => {
    if (!triviaAnswer.trim()) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          proofType: 'TRIVIA',
          answer: triviaAnswer,
          question: triviaQuestion,
          expectedAnswer: triviaExpectedAnswer,
        }),
      });

      const data = await res.json();
      if (data.verified) {
        setIsSuccess(true);
        setMessage(data.message || "Correct! Quest verified.");
        setTimeout(() => onVerified(), 1500);
      } else {
        setRetriesLeft(r => r - 1);
        setTriviaHint(data.hint || null);
        setMessage(data.message || "Incorrect. Try again.");
        if (retriesLeft <= 1) {
          setMessage("No retries left. Try again later.");
        }
      }
    } catch {
      setMessage("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitPhoto = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('taskId', task.id);
      formData.append('photo', selectedFile);
      formData.append('taskContent', task.content);

      const res = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.verified) {
        setIsSuccess(true);
        setMessage(data.message || "Photo verified!");
        setTimeout(() => onVerified(), 1500);
      } else {
        setMessage(data.message || "Photo verification failed. Try a different photo.");
      }
    } catch {
      setMessage("Upload failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitReflection = async () => {
    if (reflection.trim().length < 20) {
      setMessage("Write at least 20 characters.");
      return;
    }
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          proofType: 'REFLECTION',
          proofData: reflection,
        }),
      });

      const data = await res.json();
      if (data.verified) {
        setIsSuccess(true);
        setMessage("Reflection recorded. Quest verified.");
        setTimeout(() => onVerified(), 1500);
      } else {
        setMessage(data.message || "Please write a more detailed reflection.");
      }
    } catch {
      setMessage("Submission failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitGitLink = async () => {
    if (!gitUrl.trim()) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          proofType: 'GIT_LINK',
          proofData: gitUrl,
        }),
      });

      const data = await res.json();
      if (data.verified) {
        setIsSuccess(true);
        setMessage(data.message || "Git link verified!");
        setTimeout(() => onVerified(), 1500);
      } else {
        setMessage(data.message || "This commit doesn't seem related to the task.");
      }
    } catch {
      setMessage("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const showChoiceScreen = phase === 'choose';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#c9d1d9] tracking-wide uppercase">Quest Verification</h3>
              <p className="text-xs text-[#8b949e] mt-0.5 truncate max-w-[300px]">{task.content}</p>
            </div>
            <button onClick={onClose} className="text-[#8b949e] hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Success banner */}
        {isSuccess && (
          <div className="px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium text-emerald-400">Verified!</span>
          </div>
        )}

        {/* Body */}
        <div className="p-5">
          {/* Choice screen for INT tasks */}
          {showChoiceScreen && (
            <div className="space-y-3">
              <p className="text-sm text-[#8b949e] mb-4">Choose your verification method:</p>
              <button
                onClick={() => startPhase('trivia')}
                className="w-full p-4 rounded-md border border-[#30363d] bg-[#0d1117] hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#c9d1d9]">Answer a Trivia Question</div>
                    <div className="text-xs text-[#8b949e]">AI generates a question about your task</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => startPhase('git')}
                className="w-full p-4 rounded-md border border-[#30363d] bg-[#0d1117] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#c9d1d9]">Submit a Git Link</div>
                    <div className="text-xs text-[#8b949e]">Paste a commit URL as proof</div>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Trivia Phase */}
          {phase === 'trivia' && (
            <div className="space-y-4">
              {isLoading && !triviaQuestion ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span className="ml-3 text-sm text-[#8b949e]">Generating question...</span>
                </div>
              ) : (
                <>
                  <div className="bg-[#0d1117] rounded-md p-4 border border-blue-500/20">
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Question</div>
                    <p className="text-sm text-[#c9d1d9]">{triviaQuestion}</p>
                  </div>

                  {triviaHint && (
                    <div className="bg-amber-500/5 rounded-md p-3 border border-amber-500/20">
                      <p className="text-xs text-amber-400">💡 Hint: {triviaHint}</p>
                    </div>
                  )}

                  <textarea
                    value={triviaAnswer}
                    onChange={(e) => setTriviaAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    className="w-full system-input py-3 px-4 min-h-[80px] resize-none text-sm"
                    disabled={isSuccess || retriesLeft <= 0}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8b949e]">
                      {retriesLeft > 0 ? `${retriesLeft} attempts remaining` : 'No attempts left'}
                    </span>
                    <button
                      onClick={submitTrivia}
                      disabled={isLoading || isSuccess || !triviaAnswer.trim() || retriesLeft <= 0}
                      className="system-btn px-6 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Checking...' : 'Submit Answer'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Photo Phase */}
          {phase === 'photo' && (
            <div className="space-y-4">
              <p className="text-sm text-[#8b949e]">Upload a photo as proof of completing this task.</p>

              {photoPreview ? (
                <div className="relative rounded-md overflow-hidden border border-[#30363d]">
                  <img src={photoPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={() => { setSelectedFile(null); setPhotoPreview(null); }}
                    className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black/90 transition-colors"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-36 rounded-md border-2 border-dashed border-[#30363d] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all flex flex-col items-center justify-center gap-2 group"
                >
                  <svg className="w-8 h-8 text-[#8b949e] group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs text-[#8b949e] group-hover:text-emerald-400 transition-colors">
                    Click to upload photo
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              <button
                onClick={submitPhoto}
                disabled={isLoading || isSuccess || !selectedFile}
                className="w-full system-btn py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Verifying...' : 'Submit Photo'}
              </button>
            </div>
          )}

          {/* Reflection Phase */}
          {phase === 'reflection' && (
            <div className="space-y-4">
              <p className="text-sm text-[#8b949e]">Write a brief reflection on what you gained from this task.</p>

              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="What did you learn or experience? How did it help you grow?"
                className="w-full system-input py-3 px-4 min-h-[100px] resize-none text-sm"
                disabled={isSuccess}
              />

              <div className="flex items-center justify-between">
                <span className={`text-xs ${reflection.length >= 20 ? 'text-emerald-400' : 'text-[#8b949e]'}`}>
                  {reflection.length}/20 min characters
                </span>
                <button
                  onClick={submitReflection}
                  disabled={isLoading || isSuccess || reflection.trim().length < 20}
                  className="system-btn px-6 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Saving...' : 'Submit Reflection'}
                </button>
              </div>
            </div>
          )}

          {/* Git Link Phase */}
          {phase === 'git' && (
            <div className="space-y-4">
              <p className="text-sm text-[#8b949e]">Paste a Git commit URL as proof of your work.</p>

              <input
                type="url"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/user/repo/commit/abc123"
                className="w-full system-input py-2.5 px-4 text-sm"
                disabled={isSuccess}
              />

              <p className="text-[10px] text-[#8b949e]">
                Supports GitHub, GitLab, and Bitbucket links. Commit URLs get auto-verified against your task.
              </p>

              <button
                onClick={submitGitLink}
                disabled={isLoading || isSuccess || !gitUrl.trim()}
                className="w-full system-btn py-2.5 text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Verifying...' : 'Submit Git Link'}
              </button>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`mt-4 p-3 rounded-md text-sm ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
