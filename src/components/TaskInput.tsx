import React, { useState } from 'react';
import { Plus, ListFilter, AlertCircle, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type TaskInputProps = {
  newTask: string;
  setNewTask: (task: string) => void;
  handleTaskSubmit: (e: React.FormEvent, priority?: number, severity?: number) => void;
  isProcessing: boolean;
  isPenalized: boolean;
};

export default function TaskInput({ newTask, setNewTask, handleTaskSubmit, isProcessing, isPenalized }: TaskInputProps) {
  const [priority, setPriority] = useState<number>(3);
  const [severity, setSeverity] = useState<number>(3);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTaskSubmit(e, priority, severity);
  };

  return (
    <div className="p-6 pb-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-bold text-[#8b949e] mb-1.5 flex items-center gap-1.5 tracking-wider uppercase">
              <Plus size={12} className="text-system-blue" />
              New Objective
            </label>
            <div className="relative group">
              <input 
                type="text" 
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Enter a new directive or quest..."
                className={cn(
                  "system-input w-full pl-10 pr-4 py-2.5 font-medium transition-all duration-300",
                  isPenalized && "border-system-danger/30 focus:border-system-danger/50 focus:shadow-system-danger/10"
                )}
                disabled={isProcessing || isPenalized}
              />
              <Plus size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b949e] group-focus-within:text-system-blue transition-colors" />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 w-full lg:w-auto">
            <div className="flex flex-col min-w-[100px] flex-1 lg:flex-initial">
              <label className="text-[10px] font-bold text-[#8b949e] mb-1.5 flex items-center gap-1.5 tracking-wider uppercase">
                <ListFilter size={12} />
                Priority
              </label>
              <div className="relative">
                <select 
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="system-input py-2.5 px-3 text-sm appearance-none cursor-pointer pr-10"
                  disabled={isProcessing || isPenalized}
                >
                  {[1, 2, 3, 4, 5].map(v => (
                    <option key={v} value={v} className="bg-[#161b22] text-[#c9d1d9]">
                      P{v} - {v === 1 ? 'Low' : v === 2 ? 'Normal' : v === 3 ? 'Standard' : v === 4 ? 'High' : 'Critical'}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#8b949e]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col min-w-[100px] flex-1 lg:flex-initial">
              <label className="text-[10px] font-bold text-[#8b949e] mb-1.5 flex items-center gap-1.5 tracking-wider uppercase">
                <AlertCircle size={12} />
                Severity
              </label>
              <div className="relative">
                <select 
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className="system-input py-2.5 px-3 text-sm appearance-none cursor-pointer pr-10"
                  disabled={isProcessing || isPenalized}
                >
                  {[1, 2, 3, 4, 5].map(v => (
                    <option key={v} value={v} className="bg-[#161b22] text-[#c9d1d9]">
                      S{v} - {v === 1 ? 'Minor' : v === 2 ? 'Low' : v === 3 ? 'Moderate' : v === 4 ? 'High' : 'Emergency'}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#8b949e]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-end w-full lg:w-auto">
              <button 
                type="submit" 
                className={cn(
                  "system-btn h-[42px] px-8 font-bold flex items-center justify-center gap-2 transition-all duration-300",
                  "bg-gradient-to-r from-system-accent to-[#2ea043] border-none text-white shadow-lg shadow-system-accent/20",
                  "hover:shadow-system-accent/40 hover:-translate-y-0.5 active:translate-y-0",
                  (isProcessing || isPenalized || !newTask.trim()) && "opacity-50 cursor-not-allowed transform-none shadow-none grayscale"
                )}
                disabled={isProcessing || isPenalized || !newTask.trim()}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    <span>Add Task</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
