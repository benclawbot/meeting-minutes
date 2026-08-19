import React, { useState } from 'react';
import { CheckCircle2, Zap } from 'lucide-react';
import { AnalysisStatus, UsageMetrics } from '../types';

interface TokenTrackerProps {
  usage: UsageMetrics | null;
  status: AnalysisStatus;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

export const TokenTracker: React.FC<TokenTrackerProps> = ({ usage, status }) => {
  const [expanded, setExpanded] = useState(false);
  if (status !== AnalysisStatus.COMPLETED || !usage) return null;

  return (
    <div className="relative z-50">
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <Zap className="w-3.5 h-3.5" />
        <span>Usage</span>
      </button>
      {expanded && (
        <div className="absolute right-0 top-10 w-64 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden text-xs text-slate-700">
          <div className="px-3 py-2 font-semibold border-b">Transcription</div>
          <div className="px-3 py-2 space-y-1">
            <div className="flex justify-between"><span>Audio</span><span>{formatDuration(usage.audioSeconds)}</span></div>
            <div className="flex justify-between"><span>Characters</span><span>{usage.charCount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Segments</span><span>{usage.segmentCount}</span></div>
          </div>
          <div className="px-3 py-2 font-semibold border-y">Analysis</div>
          <div className="px-3 py-2 space-y-1">
            <div className="flex justify-between"><span>Input tokens</span><span>{usage.inputTokens.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Output tokens</span><span>{usage.outputTokens.toLocaleString()}</span></div>
          </div>
        </div>
      )}
    </div>
  );
};
