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
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Project context
      </p>
      <h2 className="mt-3 text-2xl font-semibold">
        Tell RepoFrame what the repo can&apos;t show
      </h2>
      <p className="mt-3 text-base leading-7 text-slate-600">
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
    </article>
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
              className="flex items-center gap-2 text-sm font-medium text-slate-900"
              htmlFor={`user-context-${field.key}`}
            >
              {field.label}
              {field.optional ? (
                <span className="text-xs font-normal text-slate-400">
                  Optional
                </span>
              ) : null}
            </label>
            {field.multiline ? (
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-base leading-7 text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                id={`user-context-${field.key}`}
                onChange={(event) => onTextChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={context[field.key]}
              />
            ) : (
              <input
                className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                id={`user-context-${field.key}`}
                onChange={(event) => onTextChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                type="text"
                value={context[field.key]}
              />
            )}
            <p className="mt-1.5 text-sm text-slate-500">{field.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="min-h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={onSave}
          type="button"
        >
          Save context
        </button>
        <button
          className="min-h-11 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          onClick={onReset}
          type="button"
        >
          Clear answers
        </button>
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
      <legend className="text-sm font-medium text-slate-900">
        Solo or team
      </legend>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        {COLLABORATION_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              aria-pressed={isSelected}
              className={`flex-1 rounded-md border px-4 py-3 text-left transition ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
                  : "border-slate-300 bg-white hover:border-slate-400"
              }`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              <span className="block text-sm font-semibold text-slate-950">
                {option.label}
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">
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
        <dl className="grid gap-4">
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
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No context saved yet. Add details so RepoFrame doesn&apos;t have to
          guess.
        </p>
      )}

      <button
        className="mt-6 inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
        onClick={onEdit}
        type="button"
      >
        Edit answers
      </button>
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
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-base leading-7 text-slate-950">
        {trimmedValue !== "" ? (
          trimmedValue
        ) : (
          <span className="text-slate-400">Not provided</span>
        )}
      </dd>
    </div>
  );
}
