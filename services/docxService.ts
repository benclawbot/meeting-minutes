import { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import FileSaver from "file-saver";
import { AnalysisResult, DocxTemplateId, MeetingDetails } from "../types";
import { TEMPLATE_COLORS } from "./docxColors";

const hex = (value: string) => value.replace("#", "").toUpperCase();
const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 };

const template = (id: DocxTemplateId) => {
  const colors = TEMPLATE_COLORS[id] || TEMPLATE_COLORS.briefing;
  return {
    colors,
    bodyFont: id === "briefing" || id === "executive" ? "Aptos" : "Calibri",
    headingFont: id === "briefing" || id === "executive" ? "Georgia" : "Calibri",
    pageBg: hex(colors.pageBg), border: hex(colors.border), headerBg: hex(colors.headerBg), rowBg: hex(colors.pageBg), rowAltBg: hex(colors.rowEvenBg),
  };
};

const runs = (text: string, font: string, color: string, size: number, bold = false) => text.split(/(\*\*.*?\*\*|\*.*?\*)/g).filter(Boolean).map(part => {
  if (part.startsWith("**") && part.endsWith("**")) return new TextRun({ text: part.slice(2, -2), font, color: hex(color), size, bold: true });
  if (part.startsWith("*") && part.endsWith("*")) return new TextRun({ text: part.slice(1, -1), font, color: hex(color), size, italics: true });
  return new TextRun({ text: part, font, color: hex(color), size, bold });
});

const splitCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
const normalized = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const widthsFor = (headers: string[]) => {
  const joined = headers.map(normalized).join(" ");
  if (joined.includes("action") && (joined.includes("responsable") || joined.includes("owner"))) return [38, 18, 15, 13, 16];
  return headers.map(() => Math.floor(100 / Math.max(headers.length, 1)));
};

const tableFromMarkdown = (headers: string[], rows: string[][], t: ReturnType<typeof template>) => {
  const border = { style: BorderStyle.SINGLE, size: 4, color: t.border };
  const widths = widthsFor(headers);
  const makeCell = (value: string, col: number, fill: string, header = false) => new TableCell({
    width: { size: widths[col] || 20, type: WidthType.PERCENTAGE }, margins: cellMargins, verticalAlign: VerticalAlign.TOP,
    shading: { fill, type: ShadingType.CLEAR }, borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({ children: runs(value, t.bodyFont, header ? t.colors.headerText : t.colors.rowText, 16, header), alignment: AlignmentType.LEFT, spacing: { before: 30, after: 30 } })],
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: headers.map((cell, idx) => makeCell(cell, idx, t.headerBg, true)) }), ...rows.map((row, rowIdx) => new TableRow({ children: row.map((cell, idx) => makeCell(cell, idx, rowIdx % 2 === 0 ? t.rowBg : t.rowAltBg)) }))] });
};

const markdownToDocx = (markdown: string, styleId: DocxTemplateId) => {
  const t = template(styleId);
  const lines = markdown.split(/##\s*Transcription Résumée/i)[0].split("\n");
  const children: Array<Paragraph | Table> = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]; const line = raw.trim();
    if (!line) { i += 1; continue; }
    const next = lines[i + 1]?.trim() || "";
    if (line.includes("|") && next.includes("|") && next.includes("---")) {
      const headers = splitCells(line); const rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) { const row = splitCells(lines[i]); if (row.some(Boolean)) rows.push(row); i += 1; }
      children.push(tableFromMarkdown(headers, rows, t)); continue;
    }
    if (line.startsWith("# ")) children.push(new Paragraph({ children: runs(line.slice(2), t.headingFont, t.colors.title, styleId === "briefing" ? 46 : 40, true), alignment: styleId === "briefing" ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { before: 80, after: 180 } }));
    else if (line.startsWith("## ")) children.push(new Paragraph({ children: runs(line.slice(3), t.headingFont, t.colors.subtitle, styleId === "briefing" ? 28 : 26, true), spacing: { before: 260, after: 120 }, border: { bottom: { color: t.border, space: 8, style: BorderStyle.SINGLE, size: 4 } } }));
    else if (line.startsWith("### ")) children.push(new Paragraph({ children: runs(line.slice(4), t.bodyFont, t.colors.bodyText, 20, true), spacing: { before: 120, after: 50 } }));
    else if (line.startsWith("- ") || line.startsWith("* ")) children.push(new Paragraph({ children: [new TextRun({ text: "•  ", font: t.bodyFont, color: hex(t.colors.listBullet), size: 19, bold: true }), ...runs(line.slice(2), t.bodyFont, t.colors.bodyText, 19)], indent: { left: 420, hanging: 220 }, spacing: { after: 55 } }));
    else children.push(new Paragraph({ children: runs(line, t.bodyFont, t.colors.bodyText, 19), spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED }));
    i += 1;
  }
  return children;
};

export const generateAndDownloadDocx = async (result: AnalysisResult, details: MeetingDetails, templateId: DocxTemplateId = "briefing") => {
  const style = template(templateId);
  const dateParts = details.date.split("-");
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : details.date;
  const safeTitle = details.title.split("/").join("_").split("\\").join("_").split(":").join("_");
  const filename = `${safeTitle} - ${formattedDate}.docx`;
  try {
    const doc = new Document({ background: { color: style.pageBg }, sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children: markdownToDocx(result.minutes, templateId) }] });
    const blob = await Packer.toBlob(doc); FileSaver.saveAs(blob, filename); return true;
  } catch (error) { console.error("DOCX Export Error:", error); return false; }
};
