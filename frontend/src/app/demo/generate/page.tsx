import { ProjectWriteupSection } from "@/components/project-writeup-section";
import { DEMO_REPO_URL } from "@/lib/demo-fixture";

// The demo's Generate tab. The very same writeup workspace the real app uses, run
// inside DemoModeProvider (see the demo layout): the guesses are frozen and
// read-only, the user's own context and every custom-instruction box are login-
// gated, and Generate / Regenerate / the verification agent all work — just backed
// by the frozen fixture instead of OpenAI.
export default function DemoGeneratePage() {
  return <ProjectWriteupSection repoUrl={DEMO_REPO_URL} />;
}
