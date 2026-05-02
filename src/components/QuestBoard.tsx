import React, { useState } from 'react';

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

type QuestBoardProps = {
  tasks: Task[];
  handleCompleteTask: (taskId: string) => void;
  handleDeleteTask: (taskId: string) => void;
  isPenalized: boolean;
};

export default function QuestBoard({ tasks, handleCompleteTask, handleDeleteTask, isPenalized }: QuestBoardProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'DAILY' | 'MAIN' | 'PENALTY'>('ALL');
  const [showCompleted, setShowCompleted] = useState(false);

  const activeTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'FAILED');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');

  const filteredTasks = activeTasks.filter(t => {
    if (activeTab === 'ALL') return true;
    return t.type === activeTab;
  });

  const getStatColor = (stat: string) => {
    switch (stat) {
      case 'STR': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'INT': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'WIS': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'EASY': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'MODERATE': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'HARD': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'WORK': return '💼';
      case 'HEALTH': return '💪';
      case 'LEARNING': return '📚';
      case 'PERSONAL': return '🏠';
      case 'FINANCE': return '💰';
      case 'CREATIVE': return '🎨';
      default: return '📋';
    }
  };

  const getTaskStyle = (task: Task) => {
    if (task.type === 'PENALTY') return 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    if (task.type === 'DAILY') return 'border-amber-500/30';
    if (task.difficulty === 'HARD') return 'border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]';
    if (task.severity > 3) return 'border-indigo-500/30';
    return 'border-white/5';
  };

  const renderTask = (task: Task, isCompleted: boolean = false) => (
    <div 
      key={task.id} 
      className={`relative p-4 rounded-md bg-black/20 border transition-all flex flex-col md:flex-row gap-4 justify-between items-start md:items-center hover:bg-black/40 ${getTaskStyle(task)} ${isCompleted ? 'opacity-50' : ''} ${(isPenalized && task.type !== 'PENALTY') ? 'opacity-30 grayscale pointer-events-none' : ''}`}
    >
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {task.type === 'DAILY' && (
             <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
               DAILY
             </span>
          )}
          {task.type === 'PENALTY' && (
             <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
               URGENT: PENALTY
             </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 font-bold rounded border ${getStatColor(task.statAlignment)}`}>
            {task.statAlignment}
          </span>

          {/* Difficulty Badge */}
          {task.type !== 'PENALTY' && (
            <span className={`text-[10px] px-2 py-0.5 font-bold rounded border ${getDifficultyColor(task.difficulty || 'MODERATE')}`}>
              {task.difficulty || 'MODERATE'}
            </span>
          )}

          {/* Category Badge */}
          {task.category && task.type !== 'PENALTY' && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#8b949e]">
              {getCategoryIcon(task.category)} {task.category}
            </span>
          )}
          
          {task.type !== 'DAILY' && task.type !== 'PENALTY' && (
            <div className="flex gap-2 opacity-80">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${task.severity >= 4 ? 'border-red-400/30 text-red-400' : 'border-white/10 text-gray-400'}`}>
                SEV: {task.severity}/5
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 text-gray-400">
                PRI: {task.priority}/5
              </span>
            </div>
          )}

          {/* Verified indicator */}
          {task.verifiedAt && (
            <span className="text-[10px] px-2 py-0.5 font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✓ VERIFIED
            </span>
          )}
        </div>
        
        <p className={`text-sm md:text-base font-medium ${isCompleted ? 'line-through text-gray-500' : task.type === 'PENALTY' ? 'text-red-400 font-bold' : 'text-gray-200'}`}>
          {task.content}
        </p>
        {task.description && (
          <p className={`text-xs mt-1 ${isCompleted ? 'text-gray-600' : 'text-gray-400'}`}>
            {task.description}
          </p>
        )}
      </div>
      
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        <div className="text-right">
          <div className="text-[10px] text-gray-500 font-medium mb-0.5">REWARD</div>
          <div className={`font-bold text-sm ${task.type === 'PENALTY' ? 'text-red-400' : 'text-emerald-400'}`}>
             {task.type === 'PENALTY' ? 'SURVIVAL' : `+${task.xpReward} XP`}
          </div>
        </div>
        
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleCompleteTask(task.id)}
              disabled={isPenalized && task.type !== 'PENALTY'}
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 hover:bg-emerald-500 hover:border-emerald-500 group disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-transparent"
              style={{ borderColor: task.type === 'PENALTY' ? 'var(--system-danger)' : 'var(--system-success)' }}
              title="Complete task"
            >
              <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 text-white transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteTask(task.id)}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
              title="Delete task"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 pt-2 flex flex-col min-h-[500px] animate-fade-in" style={{ animationDelay: '0.3s' }}>
      <div className="flex flex-col mb-6 gap-4 border-b border-[#30363d] pb-6">
        <div className="text-center w-full">
          <h2 className="text-lg font-semibold text-[#c9d1d9] mb-1">
            QUEST BOARD
          </h2>
          <p className="text-xs text-gray-500">Track and complete active objectives.</p>
        </div>
        
        {/* Tabs */}
        <div className="flex justify-center gap-4 bg-[#161b22] p-1.5 rounded-md border border-[#30363d] mx-auto">
          {['ALL', 'DAILY', 'MAIN', 'PENALTY'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`px-5 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === tab ? 'bg-[#1f6feb] text-white shadow-sm' : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d]/50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filteredTasks.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-md bg-black/10">
            <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-sm font-medium text-gray-400">No active quests found.</div>
            <div className="text-xs text-gray-500 mt-1">Generate auto-quests or add one manually.</div>
          </div>
        ) : (
          filteredTasks.map(task => renderTask(task, false))
        )}

        {/* Completed Tasks Section */}
        {completedTasks.length > 0 && (
          <div className="mt-8 pt-6 border-t border-white/5">
            <button 
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              COMPLETED QUESTS ({completedTasks.length})
            </button>
            
            {showCompleted && (
              <div className="space-y-3 mt-4">
                {completedTasks.map(task => renderTask(task, true))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
