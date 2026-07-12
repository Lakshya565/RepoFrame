"use client";

import { Loader2, Lock } from "lucide-react";

import {
  COLLABORATION_OPTIONS,
  INFERRED_GUESS_FIELDS,
  YOUR_CONTEXT_FIELDS,
  type CollaborationMode,
  type UserContext,
  type UserContextTextField,
  type UserContextTextKey,
} from "@/lib/user-context";
import { useDemo } from "@/lib/demo-mode";
import { AnimatedDivider } from "@/components/animated-divider";
import { GateOverlay } from "@/components/gate-overlay";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type UserContextFormProps = {
  context: UserContext;
  onContextChange: (context: UserContext) => void;
  // True while RepoFrame is still seeding its guesses from repo analysis, so the
  // guess section can show an "analyzing" hint instead of looking empty.
  seeding: boolean;
};

// The context REVIEW step. Rather than a blank questionnaire, it presents what
// RepoFrame already inferred from the repo (purpose, target user, technical focus)
// for the user to correct, then asks only for the things the repository genuinely
// cannot prove (ownership, contribution, impact, and explicit "do not claim"
// guardrails). The answers are owned by the parent so the generator and the
// verification agent can read them; this form renders the fields and reports edits
// up through onContextChange. The primary/skip actions live in the parent step.
export function UserContextForm({
  context,
  onContextChange,
  seeding,
}: UserContextFormProps) {
  // In the signed-out demo, the guesses are frozen (locked once seeded) and the
  // user's own context is login-gated — nothing here is editable without an account.
  const demo = useDemo();

  // Updates a single free-text field while leaving the rest of the answers
  // untouched. The parent owns the context, so updates flow up.
  function handleTextChange(key: UserContextTextKey, value: string) {
    onContextChange({ ...context, [key]: value });
  }

  // Sets the solo/team choice. Selecting the active option again clears it so
  // the answer can be left blank if the user is unsure.
  function handleCollaborationChange(value: CollaborationMode) {
    onContextChange({
      ...context,
      collaboration: context.collaboration === value ? "" : value,
    });
  }

  // The "Your context" inputs (ownership + free-text fields), extracted so the demo
  // can render them behind a single login gate without duplicating the markup.
  const yourContextFields = (
    <>
      <div className="mt-4">
        <OwnershipChoice
          value={context.collaboration}
          onChange={handleCollaborationChange}
        />
      </div>

      <div className="mt-5 grid gap-5">
        {YOUR_CONTEXT_FIELDS.map((field) => (
          <ContextField
            field={field}
            key={field.key}
            onChange={handleTextChange}
            value={context[field.key]}
          />
        ))}
      </div>
    </>
  );

  return (
    <Card beam className="p-6">
      <h3 className="text-lg font-semibold">
        Review What RepoFrame Cannot Infer
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        RepoFrame has already analyzed the repo. Add the context that code cannot
        prove, like your role, ownership, impact, and what claims should be handled
        carefully.
      </p>

      {/* Part 1 — RepoFrame's guess: an inferred first pass to review/edit. While
          seeding, each guess field shows its own inset "analyzing" spinner and is
          locked, so the user can't type over a value that's about to arrive. */}
      <section className="mt-6">
        <h4 className="text-base font-semibold">RepoFrame&apos;s Guess</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Review or edit these before generating. These guesses come from the
          README, file tree, detected stack, and selected repo evidence.
        </p>

        <div className="mt-4 grid gap-5">
          {INFERRED_GUESS_FIELDS.map((field) => (
            <ContextField
              field={field}
              key={field.key}
              loading={seeding}
              // In the demo the guesses are frozen once seeded, so lock them.
              locked={demo && !seeding}
              onChange={handleTextChange}
              value={context[field.key]}
            />
          ))}
        </div>
      </section>

      {/* Part 2 — Your context: only what the repo cannot prove. The animated
          hairline replaces a border-t that read too faint between the two
          sections. */}
      <AnimatedDivider className="mt-8" />
      <section className="mt-6">
        <h4 className="text-base font-semibold">Your Context</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          These details help RepoFrame avoid guessing your role, ownership, impact,
          or intent.
        </p>

        {demo ? (
          <GateOverlay
            title="Log in to add your own context"
            className="mt-4"
          >
            {yourContextFields}
          </GateOverlay>
        ) : (
          yourContextFields
        )}
      </section>
    </Card>
  );
}

type ContextFieldProps = {
  field: UserContextTextField;
  value: string;
  onChange: (key: UserContextTextKey, value: string) => void;
  // True only for the guess fields while RepoFrame is still inferring them: the
  // control is disabled and an inset spinner sits over it, so the user can't type
  // into a box whose value is about to be filled in.
  loading?: boolean;
  // True in the demo once seeded: the value is frozen, so the control is read-only
  // and a small lock sits in the label. Distinct from `loading` (which is transient).
  locked?: boolean;
};

// Renders one free-text question (label + optional chip, the input or textarea,
// and helper text) from the shared field metadata, so both sections stay
// consistent without repeating the markup.
function ContextField({
  field,
  value,
  onChange,
  loading = false,
  locked = false,
}: ContextFieldProps) {
  const id = `user-context-${field.key}`;
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium" htmlFor={id}>
        {field.label}
        {locked ? (
          <Lock aria-hidden className="size-3 text-muted-foreground" />
        ) : null}
        {field.optional ? (
          <span className="text-xs font-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
      </label>
      {/* Positioned wrapper so the loading spinner can sit inside the control's box
          (the mt-2 lives here, not on the control, so inset-0 aligns exactly). */}
      <div className="relative mt-2">
        {field.multiline ? (
          <Textarea
            className={cn("min-h-24 resize-y", locked && "cursor-not-allowed")}
            disabled={loading}
            id={id}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={loading ? "" : field.placeholder}
            readOnly={locked}
            value={value}
          />
        ) : (
          <Input
            className={cn("h-11", locked && "cursor-not-allowed")}
            disabled={loading}
            id={id}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={loading ? "" : field.placeholder}
            readOnly={locked}
            type="text"
            value={value}
          />
        )}
        {loading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-brand" />
            Analyzing the repo…
          </div>
        ) : null}
      </div>
      {/* Helper caption sits a shade darker than the input's muted placeholder so
          the two never blend into one gray block. */}
      <p className="mt-1.5 text-sm text-foreground/70">{field.helper}</p>
    </div>
  );
}

type OwnershipChoiceProps = {
  value: UserContext["collaboration"];
  onChange: (value: CollaborationMode) => void;
};

// The solo/team question as a pair of compact toggle cards. Buttons keep the
// active state obvious and let the user clear the choice by tapping the selected
// option again. Ownership matters because it sets how strongly RepoFrame can
// phrase contribution claims.
function OwnershipChoice({ value, onChange }: OwnershipChoiceProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Ownership</legend>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        {COLLABORATION_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-left transition-colors",
                isSelected
                  ? "border-brand bg-accent text-accent-foreground"
                  : "border-input hover:border-foreground/30 hover:bg-accent/50",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {option.helper}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
