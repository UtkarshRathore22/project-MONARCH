"use client";

import { useState, useEffect, useRef } from "react";
import ProfileCard from "@/components/ProfileCard";
import DirectivesPanel from "@/components/DirectivesPanel";
import QuestBoard from "@/components/QuestBoard";
import TaskInput from "@/components/TaskInput";
import VerificationModal from "@/components/VerificationModal";

type Stat = {
  level: number;
  rank: string;
  xp: number;
  str: number;
  int: number;
  wis: number;
};

type Task = {
  id: string;
  content: string;
  description: string | null;
  status: string;
  type: string;
  priority: number;
  severity: number;
  statAlignment: string;
  xpReward: number;
  difficulty: string;
  category: string;
  verifiedAt: string | null;
};

type Goal = {
  id: string;
  slot: number;
  content: string;
};

type UserAccount = {
  id: string;
  name: string;
  isPenalized: boolean;
  stats: { level: number; rank: string } | null;
};

export default function Home() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState("PLAYER");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isPenalized, setIsPenalized] = useState(false);
  
  const [stats, setStats] = useState<Stat | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<string[]>(['', '', '', '', '']);
  
  const [newTask, setNewTask] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState('MODERATE');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Verification modal state
  const [verifyingTask, setVerifyingTask] = useState<Task | null>(null);
  const [verifyProofType, setVerifyProofType] = useState<string>('');

  // AI status
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  const loadUserData = (userId: string) => {
    setStats(null);
    setTasks([]);
    setGoals(['', '', '', '', '']);
    setIsPenalized(false);

    fetch(`/api/dailies?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setPlayerName(data.user.name);
          setIsPenalized(data.user.isPenalized);
          if (data.user.isPenalized) {
             showNotification("⚠️ YOU HAVE FAILED TO COMPLETE DAILY QUESTS. PENALTY ZONE ACTIVATED.");
          } else if (data.isNewDay) {
             showNotification("Daily Quests Refreshed.");
          }
        }
      })
      .then(() => {
         fetch(`/api/tasks?userId=${userId}`)
           .then(res => res.json())
           .then(data => {
             if (data.tasks) setTasks(data.tasks);
           })
           .catch(err => console.error("Failed to load tasks", err));
      })
      .catch(err => console.error("Failed to load dailies", err));

    fetch(`/api/user?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.user && data.user.stats) {
          setStats(data.user.stats);
        } else {
          setStats({ level: 1, rank: "E", xp: 0, str: 10, int: 10, wis: 10 });
        }
      })
      .catch(() => setStats({ level: 1, rank: "E", xp: 0, str: 10, int: 10, wis: 10 }));
    
    fetch(`/api/goals?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.goals) {
          const newGoals = ['', '', '', '', ''];
          data.goals.forEach((g: Goal) => {
            if (g.slot >= 1 && g.slot <= 5) {
              newGoals[g.slot - 1] = g.content;
            }
          });
          setGoals(newGoals);
        }
      })
      .catch(err => console.error("Failed to load goals", err));
  };

  useEffect(() => {
    fetch("/api/users")
      .then(res => res.json())
      .then(data => {
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
          
          const savedUserId = localStorage.getItem("monarch_current_user");
          let targetUserId = data.users[0].id;
          
          if (savedUserId && data.users.some((u: UserAccount) => u.id === savedUserId)) {
            targetUserId = savedUserId;
          }
          
          setCurrentUserId(targetUserId);
          localStorage.setItem("monarch_current_user", targetUserId);
          loadUserData(targetUserId);
        } else {
          fetch("/api/users", { method: "POST" })
            .then(res => res.json())
            .then(newData => {
              if (newData.user) {
                setUsers([newData.user]);
                setCurrentUserId(newData.user.id);
                localStorage.setItem("monarch_current_user", newData.user.id);
                loadUserData(newData.user.id);
              }
            });
        }
      });
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccountDropdown(false);
      }
    }
    if (showAccountDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountDropdown]);

  // Check if Ollama AI is online
  useEffect(() => {
    fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      .then(res => {
        setAiOnline(res.ok);
      })
      .catch(() => setAiOnline(false));
  }, []);

  const handleSwitchAccount = (userId: string) => {
    setCurrentUserId(userId);
    localStorage.setItem("monarch_current_user", userId);
    setShowAccountDropdown(false);
    
    // Find the user object to get the name
    const selectedUser = users.find(u => u.id === userId);
    if (selectedUser) {
      showNotification(`Switched to workspace: ${selectedUser.name}`);
    }
    
    loadUserData(userId);
  };

  const handleCreateAccount = async () => {
    try {
      const res = await fetch("/api/users", { method: "POST" });
      const data = await res.json();
      if (data.user) {
        setUsers([...users, data.user]);
        handleSwitchAccount(data.user.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNameChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim() || !currentUserId) {
      setIsEditingName(false);
      return;
    }
    
    setPlayerName(tempName);
    setIsEditingName(false);
    
    try {
      await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, name: tempName })
      });
      
      setUsers(users.map(u => u.id === currentUserId ? { ...u, name: tempName } : u));
      showNotification(`Profile updated: ${tempName}`);
    } catch (err) {
      console.error(err);
    }
  };

  const showNotification = (msg: string) => {
    setSystemNotification(msg);
    setTimeout(() => setSystemNotification(null), 5000);
  };

  const handleGoalChange = (index: number, value: string) => {
    const newGoals = [...goals];
    newGoals[index] = value;
    setGoals(newGoals);
  };

  const saveGoal = async (index: number) => {
    if (!currentUserId) return;
    const content = goals[index];
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, slot: index + 1, content })
      });
    } catch (err) {
      console.error("Failed to save goal", err);
    }
  };

  const generateAutoQuests = async (difficulty: string) => {
    if (!currentUserId) return;
    setIsGenerating(true);
    showNotification(`Architect AI is generating ${difficulty} quests...`);

    try {
      const res = await fetch("/api/auto-quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, difficulty })
      });

      const data = await res.json();
      
      if (data.error) {
        showNotification(`Error: ${data.error}`);
      } else if (data.tasks) {
        setTasks([...data.tasks, ...tasks]);
        showNotification(`Generated ${data.tasks.length} ${difficulty} quests.`);
      }
    } catch (err) {
      console.error(err);
      showNotification("Error: Failed to connect to Architect AI.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTaskSubmit = async (e: React.FormEvent, priority: number = 3, severity: number = 3) => {
    e.preventDefault();
    if (!newTask.trim() || !currentUserId) return;

    setIsProcessing(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, content: newTask, priority, severity })
      });

      const data = await res.json();
      if (data.task) {
        setTasks([data.task, ...tasks]);
        setNewTask("");
        showNotification(`Task added. Alignment: ${data.task.statAlignment} | Difficulty: ${data.task.difficulty}`);
      }
    } catch (err) {
      console.error(err);
      showNotification("Error: Failed to add task.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?taskId=${taskId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setTasks(tasks.filter(t => t.id !== taskId));
        showNotification("Task removed.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!currentUserId) return;
    
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: "COMPLETED" })
      });

      const data = await res.json();

      // If verification is required, show the modal
      if (data.requiresVerification) {
        const taskToVerify = tasks.find(t => t.id === taskId);
        if (taskToVerify) {
          setVerifyingTask(taskToVerify);
          setVerifyProofType(data.proofType);
        }
        return;
      }

      if (data.task) {
        setTasks(tasks.map(t => t.id === taskId ? data.task : t));
        
        if (data.task.type === "PENALTY") {
           setIsPenalized(false);
           showNotification("Penalty cleared. Systems restored.");
        }

        if (data.stats) {
          setStats(data.stats);
          const statGainMsg = data.statGain > 0 ? ` +${data.statGain} ${data.task.statAlignment}` : '';
          if (data.leveledUp) {
             showNotification(`Level Up! You reached Level ${data.stats.level} 🌟${statGainMsg}`);
          } else if (data.task.type !== "PENALTY") {
             showNotification(`+${data.task.xpReward} XP earned.${statGainMsg}`);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerificationComplete = async () => {
    if (!verifyingTask) return;

    // Task has been verified via /api/verify — now complete it
    // Pass skipVerification to prevent the API from re-requesting proof
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: verifyingTask.id, status: "COMPLETED", skipVerification: true })
      });

      const data = await res.json();
      if (data.task) {
        setTasks(tasks.map(t => t.id === verifyingTask.id ? data.task : t));

        if (data.stats) {
          setStats(data.stats);
          const statGainMsg = data.statGain > 0 ? ` +${data.statGain} ${data.task.statAlignment}` : '';
          if (data.leveledUp) {
            showNotification(`Level Up! Level ${data.stats.level} 🌟${statGainMsg}`);
          } else {
            showNotification(`+${data.task.xpReward} XP earned.${statGainMsg}`);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }

    setVerifyingTask(null);
    setVerifyProofType('');
  };

  return (
    <>
      {isPenalized && <div className="penalty-overlay"></div>}
      
      <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] flex flex-col items-center px-4 py-6">
        
        {/* Top Navigation Bar - always horizontal, compact */}
        <header className="w-full max-w-5xl grid grid-cols-3 items-center mb-8 relative z-20">
          
          {/* Account Switcher - compact inline button (Left) */}
          <div className="relative justify-self-start" ref={dropdownRef}>
            <button 
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] hover:border-[#8b949e] transition-all text-sm shadow-sm"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#8957e5] to-[#58a6ff] flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white shadow-inner">
                {playerName ? playerName.charAt(0).toUpperCase() : 'P'}
              </div>
              <span className="font-medium max-w-[120px] truncate text-[#c9d1d9]">{playerName || 'Player'}</span>
              <svg className={`transition-transform duration-200 ${showAccountDropdown ? 'rotate-180' : ''}`} style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showAccountDropdown && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-md border border-[#30363d] bg-[#161b22] shadow-xl z-50 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8957e5] to-[#58a6ff] flex items-center justify-center text-white font-bold shadow-inner">
                    {playerName ? playerName.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-bold text-[#c9d1d9] truncate">{playerName}</span>
                    {stats && <span className="text-xs text-[#8b949e]">Level {stats.level}</span>}
                  </div>
                </div>
                <div className="px-3 py-2 mt-1 text-[10px] font-semibold text-[#8b949e] tracking-widest uppercase">Workspaces</div>
                <div className="py-1 max-h-48 overflow-y-auto custom-scrollbar bg-[#161b22]">
                  {users.map(u => (
                    <button 
                      key={u.id}
                      onClick={() => handleSwitchAccount(u.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${u.id === currentUserId ? 'bg-[#1f2428] text-[#58a6ff] font-bold' : 'text-[#c9d1d9] hover:bg-[#1f2428]'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${u.isPenalized ? 'bg-[#f85149]' : 'bg-[#2ea043]'}`}></div>
                        <span className="truncate">{u.name}</span>
                      </div>
                      {u.stats && <span className="text-xs text-[#8b949e] flex-shrink-0 ml-2">Lv.{u.stats.level}</span>}
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#30363d] bg-[#0d1117]/80 py-1">
                  <button 
                    onClick={handleCreateAccount}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#2ea043] font-semibold hover:bg-[#238636]/10 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New workspace
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Project Monarch Title (Center) */}
          <div className="flex items-center justify-center gap-3 justify-self-center">
            <div className={`w-3 h-3 rounded-full ${isPenalized ? 'bg-[#f85149] animate-pulse' : 'bg-[#58a6ff]'}`}></div>
            <span className="text-3xl font-black bg-gradient-to-r from-[#58a6ff] to-[#8957e5] bg-clip-text text-transparent" style={{ fontSize: 'clamp(24px, 4vw, 40px)', lineHeight: '1.2', fontFamily: 'var(--font-orbitron), sans-serif' }}>
              project-MONARCH
            </span>
          </div>

          {/* Empty Right Column — AI Status */}
          <div className="flex justify-end items-center">
            {aiOnline !== null && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide border ${aiOnline ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${aiOnline ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}></div>
                {aiOnline ? 'AI ONLINE' : 'AI OFFLINE'}
              </div>
            )}
          </div>

        </header>

        {/* Main 2-column grid */}
        <main
          className="w-full max-w-5xl"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1.5rem', alignItems: 'start' }}
        >
          
          {/* Left: Quest Feed - takes 2/3 */}
          <div className="system-panel flex flex-col">
            <TaskInput 
              newTask={newTask}
              setNewTask={setNewTask}
              handleTaskSubmit={handleTaskSubmit}
              isProcessing={isProcessing}
              isPenalized={isPenalized}
            />
            
            <div className="mx-6 h-px bg-[#30363d]"></div>
            
            <QuestBoard 
              tasks={tasks}
              handleCompleteTask={handleCompleteTask}
              handleDeleteTask={handleDeleteTask}
              isPenalized={isPenalized}
            />
          </div>

          {/* Right: Sidebar - takes 1/3 */}
          <div className="space-y-4">
            <ProfileCard 
              stats={stats}
              playerName={playerName}
              isEditingName={isEditingName}
              tempName={tempName}
              setTempName={setTempName}
              setIsEditingName={setIsEditingName}
              handleNameChange={handleNameChange}
              isPenalized={isPenalized}
            />
            <DirectivesPanel 
              goals={goals}
              handleGoalChange={handleGoalChange}
              saveGoal={saveGoal}
              generateAutoQuests={generateAutoQuests}
              isGenerating={isGenerating}
              isPenalized={isPenalized}
              selectedDifficulty={selectedDifficulty}
              setSelectedDifficulty={setSelectedDifficulty}
            />
          </div>
          
        </main>

        {/* Toast notification */}
        {systemNotification && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#161b22] border border-[#30363d] shadow-2xl px-5 py-2.5 rounded-full flex items-center gap-3 z-50 text-sm">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPenalized ? 'bg-[#f85149]' : 'bg-[#58a6ff]'}`}></div>
            <span className="text-[#c9d1d9]">{systemNotification}</span>
          </div>
        )}

        {/* Verification Modal */}
        {verifyingTask && (
          <VerificationModal
            isOpen={!!verifyingTask}
            onClose={() => { setVerifyingTask(null); setVerifyProofType(''); }}
            onVerified={handleVerificationComplete}
            task={verifyingTask}
            proofType={verifyProofType}
          />
        )}
      </div>
    </>
  );
}


