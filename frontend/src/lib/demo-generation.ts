import {
  type ClaimVerification,
  type GeneratedOutputs,
  type InterviewTopic,
  type ProjectProfileData,
  type UsageTotals,
  type VerifyProgressEvent,
} from "@/lib/repo-api";
import { DEMO_PROJECT } from "@/lib/demo-fixture";

// Hardcoded stand-ins for the paid OpenAI generation calls, used only inside the
// signed-out demo (see useDemo). They return the committed DEMO_PROJECT writeup on
// the same response shape the real API helpers use, so ProjectWriteupSection drives
// them through its existing handlers — same busy lock, same reveal — without a
// single token spent. The verify stand-in even replays the agent's real progress
// stages so the checklist animates exactly as it does live.

// The demo spends nothing, so every call reports zero usage.
const ZERO_USAGE: UsageTotals = {
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

// The first generation "reads the project", so it lingers a beat longer than the
// follow-ups — mirroring the real flow's slower first call. All tunable here.
export const DEMO_PROFILE_DELAY_MS = 1600;
export const DEMO_GENERATE_DELAY_MS = 1300;
export const DEMO_VERIFY_STEP_MS = 900;

// The frozen writeup, with the null-safe fallbacks the ProjectDetail type allows.
const DEMO_PROFILE = DEMO_PROJECT.profile as ProjectProfileData;
const DEMO_OUTPUTS = DEMO_PROJECT.outputs;
const DEMO_INTERVIEW = DEMO_PROJECT.interviewTopics ?? [];
const DEMO_VERIFICATIONS = DEMO_PROJECT.verifications ?? [];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function demoGenerateProfile(): Promise<{
  profile: ProjectProfileData;
  usage: UsageTotals;
}> {
  await delay(DEMO_PROFILE_DELAY_MS);
  return { profile: DEMO_PROFILE, usage: ZERO_USAGE };
}

export async function demoGenerateOutputs(): Promise<{
  outputs: GeneratedOutputs;
  usage: UsageTotals;
}> {
  await delay(DEMO_GENERATE_DELAY_MS);
  return { outputs: DEMO_OUTPUTS, usage: ZERO_USAGE };
}

export async function demoGenerateInterview(): Promise<{
  topics: InterviewTopic[];
  usage: UsageTotals;
}> {
  await delay(DEMO_GENERATE_DELAY_MS);
  return { topics: DEMO_INTERVIEW, usage: ZERO_USAGE };
}

// Replays the four verification stages (with a couple of "checking" detail lines,
// like the live agent inspecting evidence) before resolving with the frozen
// findings, so the agent checklist animates identically to a real run.
export async function demoVerifyClaims(
  onProgress: (event: VerifyProgressEvent) => void,
): Promise<{ verifications: ClaimVerification[]; usage: UsageTotals }> {
  onProgress({ stage: "gathering_evidence", detail: null });
  await delay(DEMO_VERIFY_STEP_MS);

  onProgress({ stage: "analyzing", detail: null });
  await delay(DEMO_VERIFY_STEP_MS);

  onProgress({ stage: "checking", detail: "backend/app/main.py" });
  await delay(DEMO_VERIFY_STEP_MS);
  onProgress({ stage: "checking", detail: "backend/app/services/usage_store.py" });
  await delay(DEMO_VERIFY_STEP_MS);

  onProgress({ stage: "compiling", detail: null });
  await delay(DEMO_VERIFY_STEP_MS);

  return { verifications: DEMO_VERIFICATIONS, usage: ZERO_USAGE };
}
