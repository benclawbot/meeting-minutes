import React from 'react';
import { DocxTemplateId } from '../types';
import { TEMPLATE_COLORS } from '../services/docxColors';

interface MarkdownRendererProps {
  content: string;
  template: DocxTemplateId;
}

const inline = (value: string): React.ReactNode[] => value.split(/(\*\*.*?\*\*|\*.*?\*)/g).filter(Boolean).map((part, index) => {
  if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
  if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
  return part;
});

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, template }) => {
  const colors = TEMPLATE_COLORS[template];
  const lines = content.split(/##\s*Transcription Résumée/i)[0].split('\n');
  const out: React.ReactNode[] = [];

  for (let i = 0; i < lines.length;) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i += 1; continue; }
    const next = lines[i + 1]?.trim() || '';

    if (line.includes('|') && next.includes('|') && next.includes('---')) {
      const headers = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|')) { rows.push(cells(lines[i])); i += 1; }
      out.push(
        <div key={`table-${i}`} className="my-6 overflow-x-auto rounded-lg border" style={{ borderColor: `#${colors.border}` }}>
          <table className="w-full text-sm border-collapse">
            <thead style={{ backgroundColor: `#${colors.headerBg}`, color: `#${colors.headerText}` }}><tr>{headers.map((h, idx) => <th key={idx} className="text-left px-3 py-2 border" style={{ borderColor: `#${colors.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, ridx) => <tr key={ridx} style={{ backgroundColor: ridx % 2 ? `#${colors.rowEvenBg}` : `#${colors.pageBg}` }}>{row.map((cell, cidx) => <td key={cidx} className="px-3 py-2 border align-top" style={{ borderColor: `#${colors.border}`, color: `#${colors.rowText}` }}>{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith('# ')) out.push(<h1 key={i} className="text-4xl font-bold mb-6" style={{ color: `#${colors.title}` }}>{line.slice(2)}</h1>);
    else if (line.startsWith('## ')) out.push(<h2 key={i} className="text-2xl font-bold mt-8 mb-3 pb-2 border-b" style={{ color: `#${colors.subtitle}`, borderColor: `#${colors.border}` }}>{line.slice(3)}</h2>);
    else if (line.startsWith('### ')) out.push(<h3 key={i} className="text-lg font-semibold mt-5 mb-2" style={{ color: `#${colors.subtitle}` }}>{line.slice(4)}</h3>);
    else if (line.startsWith('- ') || line.startsWith('* ')) out.push(<div key={i} className="flex gap-2 mb-2" style={{ color: `#${colors.bodyText}` }}><span>•</span><span>{inline(line.slice(2))}</span></div>);
    else out.push(<p key={i} className="mb-4 leading-relaxed" style={{ color: `#${colors.bodyText}` }}>{inline(line)}</p>);
    i += 1;
  }

  return <div className="w-full max-w-[21cm] mx-auto p-10 min-h-[29.7cm] shadow-xl" style={{ backgroundColor: `#${colors.pageBg}` }}>{out}</div>;
};
