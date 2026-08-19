import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Mic2,
  Music,
  Sparkles,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import { AnalysisResult, AnalysisStatus, DocxTemplateId, MediaFile, MeetingDetails, OutputLanguage, UsageMetrics } from './types';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { TokenTracker } from './components/TokenTracker';
import { analyzeMeetingVideo } from './services/geminiService';
import { generateAndDownloadDocx } from './services/docxService';

const ACCENT = {
  violet: '#635BFF', violetDeep: '#4F46E5', violetLight: '#8B7DFF', pageBg: '#F8F9FF',
  text: '#1A1A1A', border: '#E5E7EB', emerald: '#10b981',
};

const TEMPLATES = [
  { id: 'briefing' as DocxTemplateId, name: 'Anthropic', gradient: 'from-[#f3efe6] via-[#eee4d6] to-[#b9402d]' },
  { id: 'corporate' as DocxTemplateId, name: 'Corporate', gradient: 'from-slate-700 to-slate-800' },
  { id: 'modern' as DocxTemplateId, name: 'Modern', gradient: 'from-cyan-600 to-blue-700' },
  { id: 'executive' as DocxTemplateId, name: 'Executive', gradient: 'from-slate-800 to-black' },
];

const isProcessingStatus = (status: AnalysisStatus) =>
  status !== AnalysisStatus.IDLE && status !== AnalysisStatus.ERROR && status !== AnalysisStatus.COMPLETED;

const PipelineStepper: React.FC<{ status: AnalysisStatus }> = ({ status }) => {
  const order = [AnalysisStatus.EXTRACTING_AUDIO, AnalysisStatus.UPLOADING, AnalysisStatus.TRANSCRIBING, AnalysisStatus.PROCESSING];
  const current = order.indexOf(status);
  const labels = ['Audio', 'Upload', 'Transcription', 'Analyse'];
  const icons = [Clock, UploadCloud, Mic2, BrainCircuit];
  return (
    <div className="flex items-center">
      {labels.map((label, idx) => {
        const Icon = icons[idx];
        const done = current > idx;
        const active = current === idx;
        return <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-1 px-2 sm:px-3 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: `1.5px solid ${done ? ACCENT.emerald : active ? ACCENT.violet : '#E5E7EB'}` }}>
              {done ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: ACCENT.emerald }} /> : <Icon className="w-3.5 h-3.5" style={{ color: active ? ACCENT.violet : '#9CA3AF' }} />}
            </div>
            <span className="text-[10px] font-semibold" style={{ color: active ? ACCENT.violet : done ? ACCENT.emerald : '#6B7280' }}>{label}</span>
          </div>
          {idx < labels.length - 1 && <div className="flex-1 h-px bg-stone-200 mb-4" />}
        </React.Fragment>;
      })}
    </div>
  );
};

const TemplatePicker: React.FC<{ selected: DocxTemplateId; onChange: (id: DocxTemplateId) => void }> = ({ selected, onChange }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {TEMPLATES.map(tpl => <button key={tpl.id} type="button" onClick={() => onChange(tpl.id)} className="p-2 rounded-2xl border transition-all" style={{ borderColor: selected === tpl.id ? ACCENT.violet : ACCENT.border, background: selected === tpl.id ? `${ACCENT.violet}0D` : '#F9FAFB' }}>
      <div className={`h-7 rounded-lg bg-gradient-to-br ${tpl.gradient}`} />
      <span className="block mt-1.5 text-[11px] font-semibold text-stone-600">{tpl.name}</span>
    </button>)}
  </div>
);

const LanguageToggle: React.FC<{ value: OutputLanguage; onChange: (value: OutputLanguage) => void; disabled: boolean }> = ({ value, onChange, disabled }) => (
  <div className="rounded-full p-1 flex gap-1 bg-slate-100 border border-slate-200">
    {(['fr', 'en'] as OutputLanguage[]).map(lang => <button key={lang} type="button" disabled={disabled} onClick={() => onChange(lang)} className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase disabled:opacity-50" style={{ background: value === lang ? '#fff' : 'transparent', color: value === lang ? ACCENT.violet : '#6B7280' }}>{lang}</button>)}
  </div>
);

const FilePreview: React.FC<{ mediaFile: MediaFile; onClear: () => void; disabled: boolean }> = ({ mediaFile, onClear, disabled }) => (
  <div className="relative rounded-2xl overflow-hidden border bg-slate-50" style={{ borderColor: `${ACCENT.violet}40` }}>
    {mediaFile.isAudioOnly ? (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${ACCENT.violet}12` }}><Music className="w-7 h-7" style={{ color: ACCENT.violet }} /></div>
        <audio src={mediaFile.previewUrl} className="w-full" controls />
      </div>
    ) : <video src={mediaFile.previewUrl} className="w-full max-h-56 object-contain bg-black" controls />}
    <button type="button" onClick={onClear} disabled={disabled} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70"><X className="w-3.5 h-3.5 text-white" /></button>
    <div className="px-3 py-2 text-[11px] text-stone-500 truncate">{mediaFile.file.name}</div>
  </div>
);

const formatUiDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const App: React.FC = () => {
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails>({ title: '', date: new Date().toISOString().split('T')[0] });
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocxTemplateId>('briefing');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('fr');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (mediaFile?.previewUrl) URL.revokeObjectURL(mediaFile.previewUrl); }, [mediaFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isVideo = file.type.startsWith('video/') || name.endsWith('.mp4');
    const isAudio = file.type.startsWith('audio/') || name.endsWith('.m4a');
    if (!isVideo && !isAudio) { setError('Format non supporté. Utilisez un fichier MP4 ou M4A.'); return; }
    setError(null);
    setMediaFile({ file, previewUrl: URL.createObjectURL(file), isAudioOnly: isAudio && !isVideo });
    setResult(null); setUsage(null); setStatus(AnalysisStatus.IDLE);
  };

  const clearFile = () => {
    if (mediaFile?.previewUrl) URL.revokeObjectURL(mediaFile.previewUrl);
    setMediaFile(null); setResult(null); setUsage(null); setError(null); setStatus(AnalysisStatus.IDLE);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mediaFile || !meetingDetails.title || !meetingDetails.date) return;
    setError(null);
    try {
      const analysis = await analyzeMeetingVideo(mediaFile.file, meetingDetails.title, meetingDetails.date, outputLanguage, value => setStatus(value as AnalysisStatus));
      setResult(analysis); setUsage(analysis.usage || null); setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) { setError(err?.message || "Erreur lors de l'analyse."); setStatus(AnalysisStatus.ERROR); }
  };

  const handleExport = async () => {
    if (!result) return;
    setIsExporting(true);
    try { await generateAndDownloadDocx(result, meetingDetails, selectedTemplate); }
    finally { setIsExporting(false); }
  };

  const isProcessing = isProcessingStatus(status);
  const isDisabled = isProcessing;
  const statusLabel = status === AnalysisStatus.EXTRACTING_AUDIO ? 'Extraction audio…' : status === AnalysisStatus.UPLOADING ? 'Préparation…' : status === AnalysisStatus.TRANSCRIBING ? 'Transcription…' : status === AnalysisStatus.PROCESSING ? 'Analyse en cours…' : status === AnalysisStatus.COMPLETED ? 'Analyse terminée' : status === AnalysisStatus.ERROR ? 'Erreur' : 'Prêt';

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: ACCENT.pageBg, color: ACCENT.text }}>
      <header className="border-b bg-white/90 backdrop-blur-xl" style={{ borderColor: ACCENT.border }}>
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-white" style={{ borderColor: ACCENT.border }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg,${ACCENT.violet},${ACCENT.violetLight})` }}><Video className="w-4 h-4 text-white" /></div>
            <span className="text-sm font-bold">MeetingMind</span>
          </div>
          <TokenTracker usage={usage} status={status} />
        </div>
      </header>

      {isProcessing && <div className="border-b bg-white/90 py-3 px-5" style={{ borderColor: ACCENT.border }}><div className="max-w-3xl mx-auto"><div className="flex justify-between mb-2"><span className="text-xs font-semibold" style={{ color: ACCENT.violet }}>{statusLabel}</span><span className="text-[10px] text-stone-500">{meetingDetails.title}</span></div><PipelineStepper status={status} /></div></div>}

      <main className="flex-1 max-w-7xl mx-auto px-5 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-4 xl:col-span-3 space-y-4">
            <div className="rounded-3xl p-6 bg-white border shadow-sm" style={{ borderColor: ACCENT.border }}>
              <div className="flex items-center justify-between gap-3 mb-5"><h2 className="text-sm font-black uppercase tracking-wider">Nouvelle réunion</h2><LanguageToggle value={outputLanguage} onChange={setOutputLanguage} disabled={isDisabled} /></div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">Titre</label><input name="title" value={meetingDetails.title} onChange={e => setMeetingDetails(prev => ({ ...prev, title: e.target.value }))} required disabled={isDisabled} placeholder="Planification du lancement - Projet Orion" className="w-full rounded-2xl border px-4 py-3 text-sm bg-slate-50 outline-none focus:ring-1" style={{ borderColor: ACCENT.border }} /></div>
                <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">Date</label><input type="date" value={meetingDetails.date} onChange={e => setMeetingDetails(prev => ({ ...prev, date: e.target.value }))} required disabled={isDisabled} className="w-full rounded-2xl border px-4 py-3 text-sm bg-slate-50 outline-none" style={{ borderColor: ACCENT.border }} /></div>
                <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">Enregistrement</label>{!mediaFile ? <div onClick={() => !isDisabled && fileInputRef.current?.click()} className="rounded-2xl border-2 border-dashed p-7 text-center cursor-pointer bg-slate-50" style={{ borderColor: `${ACCENT.violet}55` }}><input ref={fileInputRef} type="file" onChange={handleFileChange} accept="video/mp4,.mp4,audio/x-m4a,audio/mp4,audio/m4a,.m4a" className="hidden" /><UploadCloud className="w-6 h-6 mx-auto mb-3" style={{ color: ACCENT.violet }} /><p className="text-sm font-bold">Glisser-déposer ou cliquer</p><p className="text-[10px] font-semibold uppercase text-stone-400 mt-1">MP4 ou M4A</p></div> : <FilePreview mediaFile={mediaFile} onClear={clearFile} disabled={isDisabled} />}</div>
                {error && <div className="p-3 rounded-2xl flex gap-2 text-xs bg-red-50 border border-red-100 text-red-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                <button type="submit" disabled={!mediaFile || !meetingDetails.title || !meetingDetails.date || isProcessing} className="w-full px-4 py-3.5 rounded-full text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: `linear-gradient(135deg,${ACCENT.violet},${ACCENT.violetDeep})` }}>{isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}{isProcessing ? 'Analyse en cours…' : 'Générer le compte rendu'}</button>
              </form>
            </div>
          </section>

          <section className="lg:col-span-8 xl:col-span-9 min-h-[560px]">
            {result ? <div className="rounded-3xl overflow-hidden bg-white border shadow-sm" style={{ borderColor: ACCENT.border }}>
              <div className="px-6 py-5 border-b space-y-4" style={{ borderColor: ACCENT.border }}>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div><div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full" style={{ background: ACCENT.emerald }} /><h2 className="text-lg font-black">{meetingDetails.title}</h2></div><div className="flex items-center gap-1.5 text-xs text-stone-500 ml-4"><Calendar className="w-3 h-3" />{formatUiDate(meetingDetails.date)}</div></div>
                  <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase text-white" style={{ background: `linear-gradient(135deg,${ACCENT.violet},${ACCENT.violetDeep})` }}>{isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{isExporting ? 'Export…' : 'Exporter DOCX'}</button>
                </div>
                <TemplatePicker selected={selectedTemplate} onChange={setSelectedTemplate} />
              </div>
              <div className="p-6 sm:p-8 overflow-auto custom-scrollbar"><div className="flex items-center gap-2 mb-5 text-stone-500"><FileText className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest font-bold">Compte rendu</span></div><MarkdownRenderer content={result.minutes} template={selectedTemplate} /></div>
            </div> : <div className="h-full min-h-[560px] rounded-3xl bg-white border shadow-sm flex items-center justify-center p-8 text-center" style={{ borderColor: ACCENT.border }}><div className="max-w-md"><div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: `linear-gradient(135deg,${ACCENT.violet},${ACCENT.violetLight})` }}>{isProcessing ? <Loader2 className="w-8 h-8 animate-spin text-white" /> : <Sparkles className="w-8 h-8 text-white" />}</div><h3 className="text-3xl font-black mb-3">{isProcessing ? statusLabel : 'Prêt à analyser'}</h3><p className="text-sm text-stone-500">Importez un fichier MP4 ou M4A pour générer une transcription et un compte rendu structuré.</p></div></div>}
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
