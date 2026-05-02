"use client";

import React from 'react';
import { Radar, RadarChart as RechartsRadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

type RadarChartProps = {
  str: number;
  int: number;
  wis: number;
  isPenalized: boolean;
};

export default function RadarChart({ str, int, wis, isPenalized }: RadarChartProps) {
  const data = [
    { subject: 'STR', A: str, fullMark: Math.max(str, int, wis, 20) },
    { subject: 'INT', A: int, fullMark: Math.max(str, int, wis, 20) },
    { subject: 'WIS', A: wis, fullMark: Math.max(str, int, wis, 20) },
  ];

  const strokeColor = isPenalized ? '#ff0055' : '#00e5ff';
  const fillColor = isPenalized ? 'rgba(255, 0, 85, 0.5)' : 'rgba(0, 229, 255, 0.5)';

  return (
    <div className="w-full mt-4 flex justify-center" style={{ height: 220, minWidth: 200 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
        <RechartsRadarChart cx="50%" cy="50%" outerRadius={70} data={data}>
          <PolarGrid stroke="rgba(255, 255, 255, 0.2)" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: strokeColor, fontSize: 12, fontWeight: 'bold' }} 
          />
          <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
          <Radar 
            name="Player Stats" 
            dataKey="A" 
            stroke={strokeColor} 
            fill={fillColor} 
            fillOpacity={0.6} 
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
