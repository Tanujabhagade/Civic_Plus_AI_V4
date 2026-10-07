import { GoogleGenAI, Type } from "@google/genai";
import { categories, departments } from "../lib/civic-data";
import { normalizeSeverity } from "../services/severityService";

export type ServerAIRequest = {
  imageData?: string;
  description?: string;
  location?: string;
};

export type ServerAIResponse = {
  category: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  department: string;
  summary: string;
  detectedProblem: string;
  confidence: number;
  reasoning: string;
  recommendedAction: string;
  impact: string;
  usedMock: boolean;
  mockReason?: string | undefined;
};

const ALLOWED_CATEGORIES = categories;
const ALLOWED_DEPARTMENTS = departments;

function normalizeCategory(raw?: string): string {
  if (!raw) return ALLOWED_CATEGORIES[0] ?? "Road Damage / Pothole";
  const lower = raw.toLowerCase();
  if (lower.includes("pothole") || lower.includes("road")) return "Road Damage / Pothole";
  if (lower.includes("garb") || lower.includes("waste") || lower.includes("trash"))
    return "Garbage";
  if (lower.includes("drain") || lower.includes("sewer")) return "Drainage";
  if (lower.includes("water") || lower.includes("leak") || lower.includes("pipe"))
    return "Water Leakage";
  if (lower.includes("light") || lower.includes("lamp") || lower.includes("pole"))
    return "Streetlight";
  if (lower.includes("tree") || lower.includes("branch") || lower.includes("leaf")) return "Trees";
  return "Infrastructure";
}

function normalizeDepartment(raw?: string, category?: string): string {
  if (raw) {
    const lower = raw.toLowerCase();
    for (const dept of ALLOWED_DEPARTMENTS) {
      if (dept.toLowerCase() === lower || lower.includes(dept.toLowerCase())) {
        return dept;
      }
    }
  }
  switch (category) {
    case "Road Damage / Pothole":
      return "Road Maintenance";
    case "Garbage":
      return "Waste Management";
    case "Drainage":
      return "Drainage";
    case "Water Leakage":
      return "Water Supply";
    case "Streetlight":
      return "Electrical";
    case "Trees":
      return "Parks & Gardens";
    default:
      return "Infrastructure";
  }
}

export function generateServerMockAnalysis(description: string, reason?: string): ServerAIResponse {
  const text = (description || "").toLowerCase();
  const road = /pothole|road|pavement|asphalt|street|crater/.test(text);
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

  const department = normalizeDepartment(undefined, category);
  const isHigh = /danger|crash|blocked|accident|burst|flooding|severe|deep/.test(text);
  const isCritical = /life|collapse|electroc|sinkhole/.test(text);
  const severity = isCritical ? "Critical" : isHigh ? "High" : "Medium";

  return {
    category,
    severity,
    department,
    summary: `Civic issue regarding ${category.toLowerCase()} requiring municipal response in the ward.`,
    detectedProblem: description || `Reported ${category.toLowerCase()} concern`,
    confidence: road || garbage || water || drain ? 92 : 80,
    reasoning:
      "Assisted classification generated from report description and local civic patterns.",
    recommendedAction: `Forward ticket to ${department} for inspection and dispatch.`,
    impact:
      severity === "Critical"
        ? "Severe public hazard requiring emergency response team."
        : severity === "High"
          ? "May disrupt local movement and create pedestrian/vehicle safety risk."
          : "Localized disruption reported by nearby residents.",
    usedMock: true,
    mockReason: reason,
  };
}

export async function processAiAnalyze(body: ServerAIRequest): Promise<ServerAIResponse> {
  const { imageData, description = "", location = "" } = body;
  const apiKey = process.env["GEMINI_API_KEY"];

  if (!apiKey || apiKey.trim() === "") {
    return generateServerMockAnalysis(
      description,
      "No GEMINI_API_KEY configured on server; using assisted local model.",
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    // Extract inline image data if provided
    if (imageData && imageData.startsWith("data:")) {
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        const mimeType = match[1];
        const data = match[2];
        // Enforce maximum 10MB payload size
        if (data.length < 14_000_000) {
          parts.push({
            inlineData: {
              mimeType,
              data,
            },
          });
        }
      }
    }

    const promptText = `
Citizen Report Description: "${description || "Civic problem photo attached"}"
Location Context: "${location || "Maharashtra Municipal Area"}"

Allowed Categories: ${ALLOWED_CATEGORIES.join(", ")}
Allowed Departments: ${ALLOWED_DEPARTMENTS.join(", ")}
Allowed Severities: Critical, High, Medium, Low

Please analyze this civic issue report. Identify the primary infrastructure problem, assess severity, assign the most appropriate municipal department, estimate public impact, and give a confidence score (0-100).
`.trim();

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: { parts },
      config: {
        systemInstruction:
          "You are the senior municipal triage intelligence officer for CivicPulse in Maharashtra, India. Classify citizen reports accurately into official municipal departments and categories. Respond ONLY with valid JSON matching the schema.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: "The primary civic issue category",
            },
            severity: {
              type: Type.STRING,
              description: "Critical, High, Medium, or Low",
            },
            department: {
              type: Type.STRING,
              description: "The municipal department responsible for fixing this",
            },
            summary: {
              type: Type.STRING,
              description: "Concise summary of the civic condition",
            },
            detectedProblem: {
              type: Type.STRING,
              description: "The specific physical fault detected",
            },
            confidence: {
              type: Type.INTEGER,
              description: "Confidence percentage between 50 and 100",
            },
            reasoning: {
              type: Type.STRING,
              description: "Brief rationale based on visible evidence or description",
            },
            recommendedAction: {
              type: Type.STRING,
              description: "Suggested municipal field action",
            },
            impact: {
              type: Type.STRING,
              description: "Impact on citizens, pedestrians, or traffic",
            },
          },
          required: [
            "category",
            "severity",
            "department",
            "summary",
            "detectedProblem",
            "confidence",
            "reasoning",
            "recommendedAction",
            "impact",
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from AI model");
    }

    const parsed = JSON.parse(responseText.trim()) as Partial<ServerAIResponse>;
    const category = normalizeCategory(parsed.category);
    const severity = normalizeSeverity(parsed.severity);
    const department = normalizeDepartment(parsed.department, category);
    const confidence = Math.min(99, Math.max(50, Math.round(Number(parsed.confidence) || 85)));

    return {
      category,
      severity,
      department,
      summary: parsed.summary || `Civic issue regarding ${category.toLowerCase()}`,
      detectedProblem: parsed.detectedProblem || description || category,
      confidence,
      reasoning: parsed.reasoning || "Analyzed using vision and text triage.",
      recommendedAction: parsed.recommendedAction || `Dispatch to ${department}.`,
      impact: parsed.impact || "Localized disruption in neighborhood.",
      usedMock: false,
    };
  } catch (err) {
    console.warn("[CivicPulse AI Server] Real AI call failed, falling back to mock:", err);
    return generateServerMockAnalysis(
      description,
      err instanceof Error ? err.message : "AI service temporarily unavailable",
    );
  }
}
