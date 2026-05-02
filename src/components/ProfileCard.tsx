import React from 'react';
import RadarChart from './RadarChart';

type Stat = {
  level: number;
  rank: string;
  xp: number;
  str: number;
  int: number;
  wis: number;
};

type ProfileCardProps = {
  stats: Stat | null;
  playerName: string;
  isEditingName: boolean;
  tempName: string;
  setTempName: (name: string) => void;
  setIsEditingName: (isEditing: boolean) => void;
  handleNameChange: (e: React.FormEvent) => void;
  isPenalized: boolean;
};

export default function ProfileCard({
  stats,
  playerName,
  isEditingName,
  tempName,
  setTempName,
  setIsEditingName,
  handleNameChange,
  isPenalized
}: ProfileCardProps) {
  const mainColor = isPenalized ? "var(--system-danger)" : "var(--system-blue)";

  if (!stats) {
    return (
      <div className="system-panel p-6 animate-pulse">
        <div className="h-6 w-32 bg-white/5 rounded mb-6"></div>
        <div className="space-y-4">
          <div className="h-10 bg-white/5 rounded"></div>
          <div className="h-32 bg-white/5 rounded"></div>
          <div className="h-48 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  // Exponential XP curve: 80 * level^1.5
  const xpForNextLevel = Math.round(80 * Math.pow(stats.level, 1.5));
  const xpPercentage = stats.level >= 100 ? 100 : Math.min((stats.xp / xpForNextLevel) * 100, 100);
  const isMaxLevel = stats.level >= 100;

  return (
    <div className="system-panel p-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-[#c9d1d9] text-center mb-6">
        PLAYER PROFILE
      </h2>
      
      <div className="space-y-6">
        {/* Identity */}
        <div className="flex justify-between items-center bg-black/20 p-4 rounded-md border border-white/5">
          <div className="flex-1">
            <span className="text-[10px] font-bold text-gray-500 tracking-wider block mb-1">IDENTITY</span>
            {isEditingName ? (
              <form onSubmit={handleNameChange} className="flex gap-2">
                <input 
                  type="text" 
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  autoFocus
                  className="bg-transparent border-b border-indigo-500/50 outline-none font-semibold w-full"
                  placeholder="Enter Name"
                />
                <button type="submit" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Save</button>
              </form>
            ) : (
              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setIsEditingName(true); setTempName(playerName); }}>
                <span className="text-xl font-bold text-white transition-colors">{playerName}</span>
                <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">EDIT</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-gray-500 tracking-wider block mb-1">RANK</span>
            <span className="text-2xl font-black" style={{ color: "var(--system-warning)" }}>{stats.rank}</span>
          </div>
        </div>

        {/* Level & XP */}
        <div>
          <div className="flex justify-between items-end mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-gray-400">Level</span>
              <span className="text-3xl font-bold text-white">{stats.level}</span>
            </div>
            <span className="text-xs font-medium text-gray-500">
              {isMaxLevel ? 'MAX LEVEL' : `${stats.xp} / ${xpForNextLevel} XP`}
            </span>
          </div>
          <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full transition-all duration-1000 ease-out rounded-full"
              style={{ 
                width: `${xpPercentage}%`,
                backgroundColor: mainColor,
                boxShadow: `0 0 10px ${mainColor}`
              }}
            ></div>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-black/10 rounded-md p-4 border border-white/5">
          <RadarChart str={stats.str} int={stats.int} wis={stats.wis} isPenalized={isPenalized} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-red-500/5 border border-red-500/10 rounded-md p-3">
            <div className="text-[10px] font-semibold text-red-400/70 tracking-wider mb-1">STR</div>
            <div className="font-bold text-lg text-red-400">{stats.str}</div>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-md p-3">
            <div className="text-[10px] font-semibold text-blue-400/70 tracking-wider mb-1">INT</div>
            <div className="font-bold text-lg text-blue-400">{stats.int}</div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-md p-3">
            <div className="text-[10px] font-semibold text-emerald-400/70 tracking-wider mb-1">WIS</div>
            <div className="font-bold text-lg text-emerald-400">{stats.wis}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
