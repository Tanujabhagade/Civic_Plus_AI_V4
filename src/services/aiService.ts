import type { CivicIssue } from "@/lib/civic-data";

export type AIAnalysis = {
  category: string;
  severity: CivicIssue["priority"];
  impact: string;
  department: string;
  confidence: number;
  summary: string;
  detectedProblem: string;
  reasoning: string;
  recommendedAction: string;
  duplicateIds: string[];
  usedMock: boolean;
  mockReason?: string | undefined;
};

export type DuplicateSuggestion = {
  issueId: string;
  category: string;
  distance: string;
  location: string;
  status: CivicIssue["status"];
  date: string;
  similarity: number;
};

const isMockMode = (mode?: "mock" | "real") =>
  mode === "mock" || (mode !== "real" && import.meta.env["VITE_MOCK_AI_MODE"] === "true");

function mockAnalysis(description: string, location?: string): AIAnalysis {
  const text = description.toLowerCase();
  const road = /pothole|road|pavement|street|crater/.test(text);
  const garbage = /garbage|waste|bin|overflow|litter|dump/.test(text);
  const water = /water|leak|pipe|burst|tap/.test(text);
  const drain = /drain|gutter|clog|sewage|storm/.test(text);
  const light = /streetlight|light|dark|pole|wire/.test(text);
  const tree = /tree|branch|fallen/.test(text);

  const category = road
    ? "Road Damage / Pothole"
    : garbage
      ? "Garbage"
      : water
        ? "Water Leakage"
        : drain
          ? "Drainage"
          : light
            ? "Streetlight"
            : tree
              ? "Trees"
              : "Infrastructure";
  const department = road
    ? "Road Maintenance"
    : garbage
      ? "Waste Management"
      : water
        ? "Water Supply"
        : drain
          ? "Drainage"
          : light
            ? "Electrical"
            : tree
              ? "Parks & Gardens"
              : "Infrastructure";
  const severity: CivicIssue["priority"] = /life|collapse|electroc|sinkhole/.test(text)
    ? "Critical"
    : /danger|crash|blocked|accident|burst|flooding|severe|deep/.test(text)
      ? "High"
      : "Medium";
  return {
    category,
    severity,
    impact:
      severity === "Critical"
        ? "Severe public hazard requiring emergency response team."
        : severity === "High"
          ? "May create a public safety risk and disrupt daily movement."
          : "Localized disruption reported by residents.",
    department,
    confidence: road || garbage || water || drain || light ? 94 : 82,
    summary: `The report appears to describe a ${category.toLowerCase()} concern${location ? ` near ${location}` : ""} that needs municipal review.`,
    detectedProblem: description.trim() || `${category} issue`,
    reasoning: "Assisted classification generated from report description and civic patterns.",
    recommendedAction: `Forward ticket to ${department} for inspection and dispatch.`,
    duplicateIds: [],
    usedMock: true,
  };
}

export async function analyzeImage(
  imageData: string | undefined,
  description: string,
  mode?: "mock" | "real",
  locationContext?: string,
): Promise<AIAnalysis> {
  if (isMockMode(mode)) return mockAnalysis(description, locationContext);
  try {
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageData,
        description,
        location: locationContext,
      }),
    });
    if (!response.ok) throw new Error("AI provider unavailable");
    const result = (await response.json()) as Partial<AIAnalysis>;
    if (!result.category || !result.summary || !result.department || !result.severity)
      throw new Error("Invalid AI response");
    return {
      category: result.category,
      severity: result.severity,
      impact: result.impact ?? "Impact requires citizen confirmation.",
      department: result.department,
      confidence: Math.min(100, Math.max(0, Number(result.confidence ?? 75))),
      summary: result.summary,
      detectedProblem: result.detectedProblem ?? description,
      reasoning: result.reasoning ?? "Classified by municipal AI triage.",
      recommendedAction: result.recommendedAction ?? `Dispatch to ${result.department}`,
      duplicateIds: result.duplicateIds ?? [],
      usedMock: Boolean(result.usedMock),
      mockReason: result.mockReason,
    };
  } catch {
    return mockAnalysis(description, locationContext);
  }
}

export async function analyzeText(
  description: string,
  mode?: "mock" | "real",
  locationContext?: string,
) {
  return analyzeImage(undefined, description, mode, locationContext);
}

export function estimateSeverity(description: string): CivicIssue["priority"] {
  return mockAnalysis(description).severity;
}

export function detectDuplicates(
  draft: Pick<CivicIssue, "category" | "description" | "latitude" | "longitude">,
  issues: CivicIssue[],
  radiusMeters = 500,
): DuplicateSuggestion[] {
  const words = new Set(
    draft.description
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3),
  );
  return issues
    .map((issue) => {
      const issueWords = new Set(
        issue.description
          .toLowerCase()
          .split(/\W+/)
          .filter((word) => word.length > 3),
      );
      const sharedWords = [...words].filter((word) => issueWords.has(word)).length;
      const distance =
        draft.latitude != null &&
        draft.longitude != null &&
        issue.latitude != null &&
        issue.longitude != null
          ? Math.round(
              Math.sqrt(
                (draft.latitude - issue.latitude) ** 2 + (draft.longitude - issue.longitude) ** 2,
              ) * 111000,
            )
          : Number.POSITIVE_INFINITY;
      const categoryMatch = draft.category === issue.category ? 35 : 0;
      const distanceScore =
        distance <= radiusMeters ? Math.max(0, 35 - (distance / radiusMeters) * 35) : 0;
      const similarity = Math.min(
        99,
        Math.round(categoryMatch + distanceScore + Math.min(30, sharedWords * 10)),
      );
      return {
        issueId: issue.id,
        category: issue.category,
        distance: Number.isFinite(distance) ? `${distance} m` : "Nearby",
        location: issue.location,
        status: issue.status,
        date: issue.createdAt ?? issue.age,
        similarity,
      };
    })
    .filter((match) => match.similarity >= 35)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

export function generateInsights(issues: CivicIssue[]) {
  const roadCount = issues.filter((issue) => issue.category.includes("Road")).length;
  const garbageCount = issues.filter((issue) => issue.category === "Garbage").length;
  return [
    `Multiple road damage reports have appeared in ${issues.find((issue) => issue.category.includes("Road"))?.ward ?? "the busiest ward"}.`,
    `Garbage overflow reports increased this month (${garbageCount} in the demo register).`,
    `Streetlight complaints are recurring near ${roadCount > 0 ? "a supported civic area" : "this location"}.`,
  ];
}
