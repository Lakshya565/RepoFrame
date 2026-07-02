"use client";

import { Loader2 } from "lucide-react";

import {
  COLLABORATION_OPTIONS,
  INFERRED_GUESS_FIELDS,
  YOUR_CONTEXT_FIELDS,
  type CollaborationMode,
  type UserContext,
  type UserContextTextField,
  type UserContextTextKey,
} from "@/lib/user-context";
import { AnimatedDivider } from "@/components/animated-divider";
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

      {/* Part 1 — RepoFrame's guess: an inferred first pass to review/edit. */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h4 className="text-base font-semibold">RepoFrame&apos;s Guess</h4>
          {seeding ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-brand" />
              Analyzing the repo…
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Review or edit these before generating. These guesses come from the
          README, file tree, detected stack, and selected repo evidence.
        </p>

        <div className="mt-4 grid gap-5">
          {INFERRED_GUESS_FIELDS.map((field) => (
            <ContextField
              field={field}
              key={field.key}
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
      </section>
    </Card>
  );
}

type ContextFieldProps = {
  field: UserContextTextField;
  value: string;
  onChange: (key: UserContextTextKey, value: string) => void;
};

// Renders one free-text question (label + optional chip, the input or textarea,
// and helper text) from the shared field metadata, so both sections stay
// consistent without repeating the markup.
function ContextField({ field, value, onChange }: ContextFieldProps) {
  const id = `user-context-${field.key}`;
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium" htmlFor={id}>
        {field.label}
        {field.optional ? (
          <span className="text-xs font-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
      </label>
      {field.multiline ? (
        <Textarea
          className="mt-2 min-h-24 resize-y"
          id={id}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          value={value}
        />
      ) : (
        <Input
          className="mt-2 h-11"
          id={id}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          type="text"
          value={value}
        />
      )}
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
