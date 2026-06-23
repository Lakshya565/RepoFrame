"use client";

import { useState } from "react";

import {
  COLLABORATION_OPTIONS,
  EMPTY_USER_CONTEXT,
  USER_CONTEXT_TEXT_FIELDS,
  getCollaborationLabel,
  hasAnyUserContext,
  type CollaborationMode,
  type UserContext,
  type UserContextTextKey,
} from "@/lib/user-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type UserContextFormProps = {
  context: UserContext;
  onContextChange: (context: UserContext) => void;
};

// Collects the project context that the repository cannot reveal on its own.
// The answers are owned by the parent (lifted in Phase 11) so the writeup
// generator can read them; this form renders the editable questionnaire and a
// read-only saved summary, reporting edits up through onContextChange. Database
// persistence is still left to a later phase.
export function UserContextForm({
  context,
  onContextChange,
}: UserContextFormProps) {
  // Tracks whether the user is editing the answers or viewing the saved summary.
  // The form opens in edit mode so the first interaction is filling it in.
  const [isEditing, setIsEditing] = useState(true);

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

  // Clears every answer back to the empty questionnaire.
  function handleReset() {
    onContextChange(EMPTY_USER_CONTEXT);
  }

  return (
    <Card beam className="p-6">
      <h3 className="text-lg font-semibold">
        Tell RepoFrame what the repo can&apos;t show
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        These answers cover the parts of your project that code and config files
        cannot reveal. RepoFrame uses them so generated writeups stay grounded in
        what you tell it, instead of guessing intent, ownership, or impact.
      </p>

      {isEditing ? (
        <UserContextFields
          context={context}
          onTextChange={handleTextChange}
          onCollaborationChange={handleCollaborationChange}
          onSave={() => setIsEditing(false)}
          onReset={handleReset}
        />
      ) : (
        <UserContextSummary
          context={context}
          onEdit={() => setIsEditing(true)}
        />
      )}
    </Card>
  );
}

type UserContextFieldsProps = {
  context: UserContext;
  onTextChange: (key: UserContextTextKey, value: string) => void;
  onCollaborationChange: (value: CollaborationMode) => void;
  onSave: () => void;
  onReset: () => void;
};

// Renders the editable questionnaire: the solo/team choice plus every free-text
// question, driven by the shared field metadata so layout stays consistent.
function UserContextFields({
  context,
  onTextChange,
  onCollaborationChange,
  onSave,
  onReset,
}: UserContextFieldsProps) {
  return (
    <div className="mt-6">
      <CollaborationChoice
        value={context.collaboration}
        onChange={onCollaborationChange}
      />

      <div className="mt-6 grid gap-5">
        {USER_CONTEXT_TEXT_FIELDS.map((field) => (
          <div key={field.key}>
            <label
              className="flex items-center gap-2 text-sm font-medium"
              htmlFor={`user-context-${field.key}`}
            >
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
                id={`user-context-${field.key}`}
                onChange={(event) => onTextChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={context[field.key]}
              />
            ) : (
              <Input
                className="mt-2 h-11"
                id={`user-context-${field.key}`}
                onChange={(event) => onTextChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                type="text"
                value={context[field.key]}
              />
            )}
            <p className="mt-1.5 text-sm text-muted-foreground">
              {field.helper}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={onSave}>Save context</Button>
        <Button variant="outline" onClick={onReset}>
          Clear answers
        </Button>
      </div>
    </div>
  );
}

type CollaborationChoiceProps = {
  value: UserContext["collaboration"];
  onChange: (value: CollaborationMode) => void;
};

// Renders the solo/team question as a pair of toggle buttons. Using buttons
// keeps the active state obvious and lets the user clear the choice by tapping
// the selected option again.
function CollaborationChoice({ value, onChange }: CollaborationChoiceProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Solo or team</legend>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        {COLLABORATION_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "flex-1 cursor-pointer rounded-md border px-4 py-3 text-left transition-colors",
                isSelected
                  ? "border-brand bg-accent text-accent-foreground"
                  : "border-input hover:border-foreground/30 hover:bg-accent/50",
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="block text-sm font-semibold">
                {option.label}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {option.helper}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type UserContextSummaryProps = {
  context: UserContext;
  onEdit: () => void;
};

// Shows the saved answers as a read-only summary. Blank answers render as
// "Not provided" so the layout stays stable, and a single button returns the
// user to the editable form.
function UserContextSummary({ context, onEdit }: UserContextSummaryProps) {
  return (
    <div className="mt-6">
      {hasAnyUserContext(context) ? (
        <dl className="grid gap-3">
          <SummaryRow
            label="Solo or team"
            value={getCollaborationLabel(context.collaboration)}
          />
          {USER_CONTEXT_TEXT_FIELDS.map((field) => (
            <SummaryRow
              key={field.key}
              label={field.label}
              value={context[field.key]}
            />
          ))}
        </dl>
      ) : (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No context saved yet. Add details so RepoFrame doesn&apos;t have to
          guess.
        </p>
      )}

      <Button variant="outline" className="mt-6" onClick={onEdit}>
        Edit answers
      </Button>
    </div>
  );
}

type SummaryRowProps = {
  label: string;
  value: string;
};

// Renders one saved answer. Empty values are shown as a muted "Not provided"
// placeholder so the summary communicates completeness at a glance.
function SummaryRow({ label, value }: SummaryRowProps) {
  const trimmedValue = value.trim();
  return (
    <div className="rounded-md border bg-muted/40 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
        {trimmedValue !== "" ? (
          trimmedValue
        ) : (
          <span className="text-muted-foreground">Not provided</span>
        )}
      </dd>
    </div>
  );
}
