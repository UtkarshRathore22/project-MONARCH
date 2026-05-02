import React from 'react';

type DirectivesPanelProps = {
  goals: string[];
  handleGoalChange: (index: number, value: string) => void;
  saveGoal: (index: number) => void;
  generateAutoQuests: (difficulty: string) => void;
  isGenerating: boolean;
  isPenalized: boolean;
  selectedDifficulty: string;
  setSelectedDifficulty: (d: string) => void;
};

export default function DirectivesPanel({
  goals,
  handleGoalChange,
  saveGoal,
  generateAutoQuests,
  isGenerating,
  isPenalized,
  selectedDifficulty,
  setSelectedDifficulty,
}: DirectivesPanelProps) {
  const difficulties = [
    { value: 'EASY', label: 'Easy', color: 'text-green-400 border-green-500/30 bg-green-500/5', xp: '×0.5' },
    { value: 'MODERATE', label: 'Moderate', color: 'text-amber-400 border-amber-500/30 bg-amber-500/5', xp: '×1.0' },
    { value: 'HARD', label: 'Hard', color: 'text-red-400 border-red-500/30 bg-red-500/5', xp: '×2.0' },
  ];

  return (
    <div className="system-panel p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold text-[#c9d1d9] mb-1">
          PRIMARY DIRECTIVES
        </h2>
        <p className="text-xs text-gray-500">Set 5 core goals to guide the Architect's quest generation.</p>
      </div>
      
      <div className="space-y-4 mb-6">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400">Goal 0{index + 1}</label>
            <input
              type="text"
              value={goals[index]}
              onChange={(e) => handleGoalChange(index, e.target.value)}
              onBlur={() => saveGoal(index)}
              placeholder={`Define Goal ${index + 1}...`}
              className="system-input py-2"
            />
          </div>
        ))}
      </div>

      {/* Difficulty Selector */}
      <div className="mb-4">
        <label className="text-[10px] font-bold text-[#8b949e] mb-2 flex items-center gap-1.5 tracking-wider uppercase">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Quest Difficulty
        </label>
        <div className="grid grid-cols-3 gap-2">
          {difficulties.map(d => (
            <button
              key={d.value}
              onClick={() => setSelectedDifficulty(d.value)}
              disabled={isPenalized}
              className={`p-2 rounded-md border text-center transition-all ${
                selectedDifficulty === d.value
                  ? `${d.color} ring-1 ring-current`
                  : 'border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:bg-[#161b22]'
              } disabled:opacity-50`}
            >
              <div className="text-xs font-bold">{d.label}</div>
              <div className="text-[10px] opacity-70">XP {d.xp}</div>
            </button>
          ))}
        </div>
      </div>

      <button 
        onClick={() => generateAutoQuests(selectedDifficulty)}
        disabled={isGenerating || goals.every(g => !g.trim()) || isPenalized}
        className="w-full system-btn flex justify-center items-center gap-2 py-2 !bg-[#238636] hover:!bg-[#2ea043] !text-white !border-[rgba(240,246,252,0.1)]"
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating Quests...
          </>
        ) : isPenalized ? (
          "System Locked"
        ) : (
          `Generate ${selectedDifficulty} Quests`
        )}
      </button>
    </div>
  );
}
