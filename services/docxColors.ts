import { DocxTemplateId } from "../types";

export interface TemplateColors {
  headerBg: string;
  headerText: string;
  rowText: string;
  border: string;
  title: string;
  subtitle: string;
  rowEvenBg: string;
  accent: string;
  accentLight: string;
  bodyText: string;
  listBullet: string;
  pageBg: string;
}

export const TEMPLATE_COLORS: Record<DocxTemplateId, TemplateColors> = {
  corporate: { headerBg: "dbeafe", headerText: "0f172a", rowText: "1e293b", border: "bfdbfe", title: "1e3a8a", subtitle: "1d4ed8", rowEvenBg: "f8fafc", accent: "2563eb", accentLight: "dbeafe", bodyText: "334155", listBullet: "2563eb", pageBg: "ffffff" },
  modern: { headerBg: "ccfbf1", headerText: "042f2e", rowText: "064e3b", border: "99f6e4", title: "047857", subtitle: "0f766e", rowEvenBg: "f0fdfa", accent: "0d9488", accentLight: "ccfbf1", bodyText: "134e4a", listBullet: "0d9488", pageBg: "ffffff" },
  executive: { headerBg: "ffedd5", headerText: "431407", rowText: "292524", border: "fed7aa", title: "7c2d12", subtitle: "92400e", rowEvenBg: "fff7ed", accent: "c2410c", accentLight: "ffedd5", bodyText: "44403c", listBullet: "c2410c", pageBg: "ffffff" },
  briefing: { headerBg: "eee4d6", headerText: "1d1b16", rowText: "23211c", border: "cdbfaa", title: "1d1b16", subtitle: "1d1b16", rowEvenBg: "f8f1e8", accent: "b9402d", accentLight: "ead8ca", bodyText: "2b2923", listBullet: "b9402d", pageBg: "f3efe6" },
};
