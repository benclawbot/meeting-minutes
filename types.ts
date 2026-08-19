export interface MeetingDetails {
  title: string;
  date: string;
}

export type OutputLanguage = 'fr' | 'en';

export interface UsageMetrics {
  audioSeconds: number;
  charCount: number;
  segmentCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AnalysisResult {
  minutes: string;
  languageIssues?: string[];
  usage?: UsageMetrics;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  EXTRACTING_AUDIO = 'EXTRACTING_AUDIO',
  UPLOADING = 'UPLOADING',
  TRANSCRIBING = 'TRANSCRIBING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface MediaFile {
  file: File;
  previewUrl: string;
  isAudioOnly: boolean;
}

export type DocxTemplateId = 'corporate' | 'modern' | 'executive' | 'briefing';
