import { ExternalLink } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { DemoCta } from "@/components/demo-cta";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DEMO_PROJECT, DEMO_REPO_URL } from "@/lib/demo-fixture";

// The signed-out demo (Phase 15.3c): a static, read-only presentation of one
// frozen analysis (RepoFrame's own repo) so an anonymous visitor sees exactly what
// the tool produces — with zero GitHub calls, zero tokens, and no way to trigger a
// live run. It reads entirely from the committed DEMO_PROJECT fixture. Live
// analysis of your own repo requires logging in (the CTA); the backend enforces
// that separately.

const { metadata, profile, outputs, interviewTopics, verifications } =
  DEMO_PROJECT;

export default function DemoPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
        {/* Banner: what this is + the login CTA. */}
        <div className="flex flex-col gap-4 rounded-lg border border-brand/30 bg-brand/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">This is a live demo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A frozen example analysis of RepoFrame&apos;s own repository. Log in
              to analyze any repository of your own.
            </p>
          </div>
          <DemoCta />
        </div>

        {/* Repo overview. */}
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {metadata.owner}/{metadata.repo}
            </h1>
            <a
              href={DEMO_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand"
            >
              GitHub
              <ExternalLink className="size-4" />
            </a>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {metadata.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile?.detectedTechStack.map((tech) => (
              <Badge key={tech} variant="muted">
                {tech}
              </Badge>
            ))}
          </div>
        </section>

        {/* Two-sentence summary. */}
        {profile ? (
          <Card className="mt-6 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Project profile
            </h2>
            <p className="mt-3 text-base leading-7">{profile.twoSentenceSummary}</p>
          </Card>
        ) : null}

        {/* Resume bullets. */}
        {outputs.resumeBullets && outputs.resumeBullets.length > 0 ? (
          <DemoSection title="Resume bullets">
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
              {outputs.resumeBullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          </DemoSection>
        ) : null}

        {/* README intro. */}
        {outputs.readmeIntro ? (
          <DemoSection title="README intro">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm leading-6">
              {outputs.readmeIntro}
            </pre>
          </DemoSection>
        ) : null}

        {/* Portfolio blurb. */}
        {outputs.portfolioBlurb ? (
          <DemoSection title="Portfolio blurb">
            <p className="text-sm leading-6">{outputs.portfolioBlurb}</p>
          </DemoSection>
        ) : null}

        {/* LinkedIn description. */}
        {outputs.linkedinDescription ? (
          <DemoSection title="LinkedIn description">
            <p className="text-sm leading-6">{outputs.linkedinDescription}</p>
          </DemoSection>
        ) : null}

        {/* Interview prep. */}
        {interviewTopics && interviewTopics.length > 0 ? (
          <DemoSection title="Interview prep">
            <div className="flex flex-col gap-5">
              {interviewTopics.map((topic, index) => (
                <div key={index}>
                  <p className="text-sm font-semibold">{topic.question}</p>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
                    {topic.talkingPoints.map((point, pointIndex) => (
                      <li key={pointIndex}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </DemoSection>
        ) : null}

        {/* Claim verification — RepoFrame's differentiator. */}
        {verifications && verifications.length > 0 ? (
          <DemoSection title="Claim verification">
            <div className="flex flex-col gap-4">
              {verifications.map((verification, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{verification.claim}</p>
                    <Badge variant="success" className="shrink-0 capitalize">
                      {verification.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {verification.explanation}
                  </p>
                </div>
              ))}
            </div>
          </DemoSection>
        ) : null}
      </div>
    </main>
  );
}

// One titled block of the demo writeup — keeps the section markup consistent.
function DemoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-6 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}
