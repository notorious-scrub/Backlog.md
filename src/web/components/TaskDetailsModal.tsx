import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AcceptanceCriterion, Milestone, Task, TaskAuditEvent } from "../../types";
import Modal from "./Modal";
import { apiClient } from "../lib/api";
import { useTheme } from "../contexts/ThemeContext";
import MDEditor from "@uiw/react-md-editor";
import AcceptanceCriteriaEditor from "./AcceptanceCriteriaEditor";
import MermaidMarkdown from './MermaidMarkdown';
import ChipInput from "./ChipInput";
import DependencyInput from "./DependencyInput";
import { formatStoredUtcDateForDisplay } from "../utils/date-display";
import { applyScreenshotReviewInstruction, toScreenshotReference, toScreenshotUrl } from "../utils/screenshots";
import { getClipboardImageFiles } from "../utils/clipboard-images";
import ReopenTaskModal from "./ReopenTaskModal";
import {
	getDefaultReopenTargetStatus,
	getReopenTargetStatuses,
	prependReopenedDetails,
} from "../utils/reopen";
import {
	type AuditEventFilter,
	formatAuditActor,
	formatAuditEventType,
	formatAuditValue,
	matchesAuditEventFilter,
} from "../utils/audit-log-display";

interface Props {
  task?: Task; // Optional for create mode
  isOpen: boolean;
  onClose: () => void;
  onNavigateTask?: (taskId: string) => void;
  taskNavigationIds?: string[];
  onSaved?: () => Promise<void> | void; // refresh callback
  onSubmit?: (taskData: Partial<Task>) => Promise<void>; // For creating new tasks
  onArchive?: () => void; // For archiving tasks
  availableStatuses?: string[]; // Available statuses for new tasks
  isDraftMode?: boolean; // Whether creating a draft
  availableMilestones?: string[];
  milestoneEntities?: Milestone[];
  archivedMilestoneEntities?: Milestone[];
  definitionOfDoneDefaults?: string[];
  hasPendingExternalUpdates?: boolean;
}

type Mode = "preview" | "edit" | "create";

type TaskUpdatePayload = Partial<Task> & {
  definitionOfDoneAdd?: string[];
  definitionOfDoneRemove?: number[];
  definitionOfDoneCheck?: number[];
  definitionOfDoneUncheck?: number[];
  disableDefinitionOfDoneDefaults?: boolean;
};

type InlineMetaUpdatePayload = Omit<Partial<Task>, "milestone"> & {
  milestone?: string | null;
};

type TextSectionKey = "description" | "plan" | "notes" | "finalSummary";


const DEFAULT_COLLAPSED_TEXT_SECTIONS: Record<TextSectionKey, boolean> = {
  description: false,
  plan: true,
  notes: true,
  finalSummary: true,
};

const buildInitialCollapsedTextSections = (
  task: Task | undefined,
  isCreateMode: boolean,
): Record<TextSectionKey, boolean> => ({
  ...DEFAULT_COLLAPSED_TEXT_SECTIONS,
  finalSummary: !(isCreateMode || (task?.finalSummary ?? "").trim().length > 0),
});

const SectionHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight transition-colors duration-200">
      {title}
    </h3>
    {right ? <div className="ml-2 text-xs text-gray-500 dark:text-gray-400">{right}</div> : null}
  </div>
);

const TASK_AUDIT_FILTERS: Array<{ value: AuditEventFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "task", label: "Task changes" },
	{ value: "automation", label: "Automation" },
];

export const TaskDetailsModal: React.FC<Props> = ({
  task,
  isOpen,
  onClose,
  onNavigateTask,
  taskNavigationIds,
  onSaved,
  onSubmit,
  onArchive,
  availableStatuses,
  availableMilestones,
  milestoneEntities,
  archivedMilestoneEntities,
  isDraftMode,
  definitionOfDoneDefaults,
  hasPendingExternalUpdates,
}) => {
  const { theme } = useTheme();
  const isCreateMode = !task;
  const isFromOtherBranch = Boolean(task?.branch);
  const [mode, setMode] = useState<Mode>(isCreateMode ? "create" : "preview");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Title field for create mode
  const [title, setTitle] = useState(task?.title || "");

  // Editable fields (edit mode)
  const [description, setDescription] = useState(task?.description || "");
  const [plan, setPlan] = useState(task?.implementationPlan || "");
  const [notes, setNotes] = useState(task?.implementationNotes || "");
  const [finalSummary, setFinalSummary] = useState(task?.finalSummary || "");
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>(task?.acceptanceCriteriaItems || []);
  const defaultDefinitionOfDone = useMemo(
    () => (definitionOfDoneDefaults ?? []).map((text, index) => ({ index: index + 1, text, checked: false })),
    [definitionOfDoneDefaults],
  );
  const initialDefinitionOfDone = task?.definitionOfDoneItems ?? (isCreateMode ? defaultDefinitionOfDone : []);
  const [definitionOfDone, setDefinitionOfDone] = useState<AcceptanceCriterion[]>(initialDefinitionOfDone);
  const resolveMilestoneToId = useCallback((value?: string | null): string => {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    const key = normalized.toLowerCase();
    const aliasKeys = new Set<string>([key]);
    const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
    const canonicalInputId = looksLikeMilestoneId
      ? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
      : null;
    if (/^\d+$/.test(normalized)) {
      const numericAlias = String(Number.parseInt(normalized, 10));
      aliasKeys.add(numericAlias);
      aliasKeys.add(`m-${numericAlias}`);
    } else {
      const idMatch = normalized.match(/^m-(\d+)$/i);
      if (idMatch?.[1]) {
        const numericAlias = String(Number.parseInt(idMatch[1], 10));
        aliasKeys.add(numericAlias);
        aliasKeys.add(`m-${numericAlias}`);
      }
    }
    const idMatchesAlias = (milestoneId: string): boolean => {
      const milestoneKey = milestoneId.trim().toLowerCase();
      if (aliasKeys.has(milestoneKey)) {
        return true;
      }
      const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
      if (!idMatch?.[1]) {
        return false;
      }
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
    };
    const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
      const rawExactMatch = milestones.find((milestone) => milestone.id.trim().toLowerCase() === key);
      if (rawExactMatch) {
        return rawExactMatch;
      }
      if (canonicalInputId) {
        const canonicalRawMatch = milestones.find(
          (milestone) => milestone.id.trim().toLowerCase() === canonicalInputId,
        );
        if (canonicalRawMatch) {
          return canonicalRawMatch;
        }
      }
      return milestones.find((milestone) => idMatchesAlias(milestone.id));
    };
    const activeMilestones = milestoneEntities ?? [];
    const archivedMilestones = archivedMilestoneEntities ?? [];
    const activeIdMatch = findIdMatch(activeMilestones);
    if (activeIdMatch) {
      return activeIdMatch.id;
    }
    if (looksLikeMilestoneId) {
      const archivedIdMatch = findIdMatch(archivedMilestones);
      if (archivedIdMatch) {
        return archivedIdMatch.id;
      }
    }
    const activeTitleMatches = activeMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    if (activeTitleMatches.length === 1) {
      return activeTitleMatches[0]?.id ?? normalized;
    }
    if (activeTitleMatches.length > 1) {
      return normalized;
    }
    const archivedIdMatch = findIdMatch(archivedMilestones);
    if (archivedIdMatch) {
      return archivedIdMatch.id;
    }
    const archivedTitleMatches = archivedMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    if (archivedTitleMatches.length === 1) {
      return archivedTitleMatches[0]?.id ?? normalized;
    }
    return normalized;
  }, [milestoneEntities, archivedMilestoneEntities]);
  const resolveMilestoneLabel = useCallback((value?: string | null): string => {
    const normalized = (value ?? "").trim();
    if (!normalized) return "";
    const key = normalized.toLowerCase();
    const aliasKeys = new Set<string>([key]);
    const canonicalInputId =
      /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized)
        ? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
        : null;
    if (/^\d+$/.test(normalized)) {
      const numericAlias = String(Number.parseInt(normalized, 10));
      aliasKeys.add(numericAlias);
      aliasKeys.add(`m-${numericAlias}`);
    } else {
      const idMatch = normalized.match(/^m-(\d+)$/i);
      if (idMatch?.[1]) {
        const numericAlias = String(Number.parseInt(idMatch[1], 10));
        aliasKeys.add(numericAlias);
        aliasKeys.add(`m-${numericAlias}`);
      }
    }
    const idMatchesAlias = (milestoneId: string): boolean => {
      const milestoneKey = milestoneId.trim().toLowerCase();
      if (aliasKeys.has(milestoneKey)) {
        return true;
      }
      const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
      if (!idMatch?.[1]) {
        return false;
      }
      const numericAlias = String(Number.parseInt(idMatch[1], 10));
      return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
    };
    const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
      const rawExactMatch = milestones.find((milestone) => milestone.id.trim().toLowerCase() === key);
      if (rawExactMatch) {
        return rawExactMatch;
      }
      if (canonicalInputId) {
        const canonicalRawMatch = milestones.find(
          (milestone) => milestone.id.trim().toLowerCase() === canonicalInputId,
        );
        if (canonicalRawMatch) {
          return canonicalRawMatch;
        }
      }
      return milestones.find((milestone) => idMatchesAlias(milestone.id));
    };
    const allMilestones = [...(milestoneEntities ?? []), ...(archivedMilestoneEntities ?? [])];
    const idMatch = findIdMatch(allMilestones);
    if (idMatch) {
      return idMatch.title;
    }
    const titleMatches = allMilestones.filter((milestone) => milestone.title.trim().toLowerCase() === key);
    return titleMatches.length === 1 ? (titleMatches[0]?.title ?? normalized) : normalized;
  }, [milestoneEntities, archivedMilestoneEntities]);

  // Sidebar metadata (inline edit)
  const [status, setStatus] = useState(task?.status || (isDraftMode ? "Draft" : (availableStatuses?.[0] || "To Do")));
  const [assignee, setAssignee] = useState<string[]>(task?.assignee || []);
  const [labels, setLabels] = useState<string[]>(task?.labels || []);
  const [priority, setPriority] = useState<string>(task?.priority || "");
  const [dependencies, setDependencies] = useState<string[]>(task?.dependencies || []);
  const [references, setReferences] = useState<string[]>(task?.references || []);
  const [availableScreenshots, setAvailableScreenshots] = useState<string[]>([]);
  const [selectedScreenshots, setSelectedScreenshots] = useState<string[]>([]);
  const [screenshotViewMode, setScreenshotViewMode] = useState<"thumbnails" | "list">("thumbnails");
  const [hoveredScreenshotPreview, setHoveredScreenshotPreview] = useState<{ path: string; url: string } | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const previousIsOpenRef = useRef(false);
  const previousTaskIdRef = useRef<string | null>(null);
  const [collapsedTextSections, setCollapsedTextSections] = useState<Record<TextSectionKey, boolean>>(
    () => buildInitialCollapsedTextSections(task, isCreateMode),
  );
  const [isScreenshotLibraryCollapsed, setIsScreenshotLibraryCollapsed] = useState(true);
  const [milestone, setMilestone] = useState<string>(task?.milestone || "");
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [taskAuditEvents, setTaskAuditEvents] = useState<TaskAuditEvent[]>([]);
  const [taskAuditFilter, setTaskAuditFilter] = useState<AuditEventFilter>("all");
  const [taskAuditLoading, setTaskAuditLoading] = useState(false);
  const [taskAuditError, setTaskAuditError] = useState<string | null>(null);
  const milestoneSelectionValue = resolveMilestoneToId(milestone);

  const loadTaskAuditEvents = useCallback(async (taskId: string | undefined) => {
    if (!taskId) {
      setTaskAuditEvents([]);
      setTaskAuditLoading(false);
      setTaskAuditError(null);
      return;
    }
    setTaskAuditLoading(true);
    try {
      const page = await apiClient.fetchTaskAuditLog(taskId, { limit: 50 });
      setTaskAuditEvents(page.events);
      setTaskAuditError(null);
    } catch (err) {
      setTaskAuditEvents([]);
      setTaskAuditError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setTaskAuditLoading(false);
    }
  }, []);

  const focusDescriptionEditor = useCallback(() => {
    setCollapsedTextSections((current) => ({ ...current, description: false }));
    const focusEditor = (): boolean => {
      const textarea = descriptionEditorContainerRef.current?.querySelector<HTMLTextAreaElement>("textarea");
      if (!textarea) {
        return false;
      }
      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
      return true;
    };

    if (!focusEditor()) {
      requestAnimationFrame(() => {
        focusEditor();
      });
    }
  }, []);

  const toggleTextSectionCollapsed = useCallback((section: TextSectionKey) => {
    setCollapsedTextSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);
  const hasMilestoneSelection = (milestoneEntities ?? []).some((milestoneEntity) => milestoneEntity.id === milestoneSelectionValue);

  // Keep a baseline for dirty-check
  const baseline = useMemo(() => ({
    title: task?.title || "",
    description: task?.description || "",
    plan: task?.implementationPlan || "",
    notes: task?.implementationNotes || "",
    finalSummary: task?.finalSummary || "",
    criteria: JSON.stringify(task?.acceptanceCriteriaItems || []),
    definitionOfDone: JSON.stringify(task?.definitionOfDoneItems || (isCreateMode ? defaultDefinitionOfDone : [])),
  }), [task, defaultDefinitionOfDone, isCreateMode]);

  const isDirty = useMemo(() => {
    return (
      title !== baseline.title ||
      description !== baseline.description ||
      plan !== baseline.plan ||
      notes !== baseline.notes ||
      finalSummary !== baseline.finalSummary ||
      JSON.stringify(criteria) !== baseline.criteria ||
      JSON.stringify(definitionOfDone) !== baseline.definitionOfDone
    );
  }, [title, description, plan, notes, finalSummary, criteria, definitionOfDone, baseline]);

  const taskNavigationIndex = useMemo(() => {
    if (!task?.id || !taskNavigationIds || taskNavigationIds.length === 0) {
      return -1;
    }
    return taskNavigationIds.findIndex((taskId) => taskId === task.id);
  }, [task?.id, taskNavigationIds]);
  const visibleTaskAuditEvents = useMemo(
    () => taskAuditEvents.filter((event) => matchesAuditEventFilter(event.eventType, taskAuditFilter)),
    [taskAuditEvents, taskAuditFilter],
  );

  const previousTaskId = taskNavigationIndex > 0 ? (taskNavigationIds?.[taskNavigationIndex - 1] ?? null) : null;
  const nextTaskId =
    taskNavigationIndex >= 0 && taskNavigationIds && taskNavigationIndex < taskNavigationIds.length - 1
      ? (taskNavigationIds[taskNavigationIndex + 1] ?? null)
      : null;

  const handleNavigateToTask = useCallback(
    (targetTaskId: string | null) => {
      if (!targetTaskId || !onNavigateTask) return;
      if ((mode === "edit" || mode === "create") && isDirty) {
        if (!window.confirm("Discard unsaved changes and move to another task?")) {
          return;
        }
      }
      setError(null);
      setMode("preview");
      onNavigateTask(targetTaskId);
    },
    [onNavigateTask, mode, isDirty],
  );

  // Intercept Escape to cancel edit (not close modal) when in edit mode
  useEffect(() => {
    if (isReopenModalOpen) {
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (mode === "edit" && (e.key === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        handleCancelEdit();
      }
      if (mode === "edit" && ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        e.stopPropagation();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
  }, [mode, title, description, plan, notes, finalSummary, criteria, definitionOfDone, status, isReopenModalOpen]);

  // Reset local state when task changes or modal opens
  useEffect(() => {
    const taskId = task?.id ?? null;
    const wasOpen = previousIsOpenRef.current;
    const previousTaskId = previousTaskIdRef.current;

    const didOpen = isOpen && !wasOpen;
    const changedTaskWhileOpen = isOpen && wasOpen && previousTaskId !== taskId;

    previousIsOpenRef.current = isOpen;
    previousTaskIdRef.current = taskId;

    if (!didOpen && !changedTaskWhileOpen) {
      return;
    }

    setTitle(task?.title || "");
    setDescription(task?.description || "");
    setPlan(task?.implementationPlan || "");
    setNotes(task?.implementationNotes || "");
    setFinalSummary(task?.finalSummary || "");
    setCriteria(task?.acceptanceCriteriaItems || []);
    setDefinitionOfDone(task?.definitionOfDoneItems || (isCreateMode ? defaultDefinitionOfDone : []));
    setStatus(task?.status || (isDraftMode ? "Draft" : (availableStatuses?.[0] || "To Do")));
    setAssignee(task?.assignee || []);
    setLabels(task?.labels || []);
    setPriority(task?.priority || "");
    setDependencies(task?.dependencies || []);
    setReferences(task?.references || []);
    setAvailableScreenshots([]);
    setSelectedScreenshots([]);
    setScreenshotViewMode("thumbnails");
    setHoveredScreenshotPreview(null);
    setIsUploadingScreenshot(false);
    setIsReopenModalOpen(false);
    setIsReopening(false);
    setCollapsedTextSections(buildInitialCollapsedTextSections(task, isCreateMode));
    setIsScreenshotLibraryCollapsed(true);
    setMilestone(task?.milestone || "");
    setTaskAuditFilter("all");
    setMode(isCreateMode ? "create" : "preview");
    setError(null);
    void loadTaskAuditEvents(task?.id);
    // Preload tasks for dependency picker
    apiClient.fetchTasks().then(setAvailableTasks).catch(() => setAvailableTasks([]));
    apiClient.fetchScreenshots()
      .then((screenshots) => {
        setAvailableScreenshots(screenshots);
        setSelectedScreenshots((current) => current.filter((path) => screenshots.includes(path)));
      })
      .catch(() => {
        setAvailableScreenshots([]);
        setSelectedScreenshots([]);
      });

    if (isOpen && isCreateMode) {
      requestAnimationFrame(() => {
        const input = titleInputRef.current;
        if (!input) {
          return;
        }
        input.focus();
        const cursorPosition = input.value.length;
        input.setSelectionRange(cursorPosition, cursorPosition);
      });
    }
  }, [task, isOpen, isCreateMode, isDraftMode, availableStatuses, defaultDefinitionOfDone, loadTaskAuditEvents]);

  const handleCancelEdit = () => {
    if (isDirty) {
      const confirmDiscard = window.confirm("Discard unsaved changes?");
      if (!confirmDiscard) return;
    }
    if (isCreateMode) {
      // In create mode, close the modal on cancel
      onClose();
    } else {
      setTitle(task?.title || "");
      setDescription(task?.description || "");
      setPlan(task?.implementationPlan || "");
      setNotes(task?.implementationNotes || "");
      setFinalSummary(task?.finalSummary || "");
      setCriteria(task?.acceptanceCriteriaItems || []);
      setDefinitionOfDone(task?.definitionOfDoneItems || []);
      setMode("preview");
    }
  };

  const normalizeChecklistItems = (items: AcceptanceCriterion[]): AcceptanceCriterion[] => {
    return items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);
  };

  const buildDefinitionOfDoneCreatePayload = (): TaskUpdatePayload => {
    const cleanedCurrent = normalizeChecklistItems(definitionOfDone);
    const defaults = (definitionOfDoneDefaults ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
    const defaultItems = defaults.map((text, index) => ({ index: index + 1, text, checked: false }));
    const defaultsMatch =
      cleanedCurrent.length >= defaultItems.length &&
      defaultItems.every(
        (item, index) =>
          cleanedCurrent[index]?.text === item.text && cleanedCurrent[index]?.checked === false,
      );

    const disableDefaults = !defaultsMatch;
    const definitionOfDoneAdd = disableDefaults
      ? cleanedCurrent.map((item) => item.text)
      : cleanedCurrent.slice(defaultItems.length).map((item) => item.text);

    const payload: TaskUpdatePayload = {};
    if (definitionOfDoneAdd.length > 0) {
      payload.definitionOfDoneAdd = definitionOfDoneAdd;
    }
    if (disableDefaults) {
      payload.disableDefinitionOfDoneDefaults = true;
    }
    return payload;
  };

  const buildDefinitionOfDoneEditPayload = (): TaskUpdatePayload => {
    const original = task?.definitionOfDoneItems ?? [];
    const cleanedCurrent = normalizeChecklistItems(definitionOfDone);
    const originalByIndex = new Map(original.map((item) => [item.index, item]));
    const currentByIndex = new Map(cleanedCurrent.map((item) => [item.index, item]));
    const removals = new Set<number>();
    const additions: string[] = [];
    const checks: number[] = [];
    const unchecks: number[] = [];

    let nextIndex = original.reduce((max, item) => Math.max(max, item.index), 0);

    for (const item of cleanedCurrent) {
      const originalItem = originalByIndex.get(item.index);
      if (!originalItem) {
        additions.push(item.text);
        nextIndex += 1;
        if (item.checked) {
          checks.push(nextIndex);
        }
        continue;
      }
      if (originalItem.text !== item.text) {
        removals.add(item.index);
        additions.push(item.text);
        nextIndex += 1;
        if (item.checked) {
          checks.push(nextIndex);
        }
        continue;
      }
      if (originalItem.checked !== item.checked) {
        if (item.checked) {
          checks.push(item.index);
        } else {
          unchecks.push(item.index);
        }
      }
    }

    for (const originalItem of original) {
      if (!currentByIndex.has(originalItem.index)) {
        removals.add(originalItem.index);
      }
    }

    const payload: TaskUpdatePayload = {};
    if (additions.length > 0) {
      payload.definitionOfDoneAdd = additions;
    }
    if (removals.size > 0) {
      payload.definitionOfDoneRemove = Array.from(removals);
    }
    if (checks.length > 0) {
      payload.definitionOfDoneCheck = checks;
    }
    if (unchecks.length > 0) {
      payload.definitionOfDoneUncheck = unchecks;
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Validation for create mode
    if (isCreateMode && !title.trim()) {
      setError("Title is required");
      setSaving(false);
      return;
    }

    try {
      const taskData: TaskUpdatePayload = {
        title: title.trim(),
        description,
        implementationPlan: plan,
        implementationNotes: notes,
        finalSummary,
        acceptanceCriteriaItems: criteria,
        status,
        assignee,
        labels,
        priority: (priority === "" ? undefined : priority) as "high" | "medium" | "low" | undefined,
        dependencies,
        references,
        milestone: milestone.trim().length > 0 ? milestone.trim() : undefined,
      };

      if (isCreateMode && onSubmit) {
        Object.assign(taskData, buildDefinitionOfDoneCreatePayload());
        // Create new task
        await onSubmit(taskData);
        // Only close if successful (no error thrown)
        onClose();
      } else if (task) {
        Object.assign(taskData, buildDefinitionOfDoneEditPayload());
        // Update existing task
        await apiClient.updateTask(task.id, taskData);
        setMode("preview");
        if (onSaved) await onSaved();
        await loadTaskAuditEvents(task.id);
      }
    } catch (err) {
      // Extract and display the error message from API response
      let errorMessage = 'Failed to save task';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'error' in err) {
        errorMessage = String((err as any).error);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCriterion = async (index: number, checked: boolean) => {
    if (!task) return; // Can't toggle in create mode
    if (isFromOtherBranch) return; // Can't toggle for cross-branch tasks
    // Optimistic update
    const next = (criteria || []).map((c) => (c.index === index ? { ...c, checked } : c));
    setCriteria(next);
    try {
      await apiClient.updateTask(task.id, { acceptanceCriteriaItems: next });
      if (onSaved) await onSaved();
      await loadTaskAuditEvents(task.id);
    } catch (err) {
      // rollback
      setCriteria(criteria);
      console.error("Failed to update criterion", err);
    }
  };

  const handleToggleDefinitionOfDone = async (index: number, checked: boolean) => {
    if (!task) return; // Can't toggle in create mode
    if (isFromOtherBranch) return; // Can't toggle for cross-branch tasks
    const next = (definitionOfDone || []).map((c) => (c.index === index ? { ...c, checked } : c));
    setDefinitionOfDone(next);
    try {
      const updates: TaskUpdatePayload = checked
        ? { definitionOfDoneCheck: [index] }
        : { definitionOfDoneUncheck: [index] };
      await apiClient.updateTask(task.id, updates);
      if (onSaved) await onSaved();
      await loadTaskAuditEvents(task.id);
    } catch (err) {
      setDefinitionOfDone(definitionOfDone);
      console.error("Failed to update Definition of Done item", err);
    }
  };

  const handleInlineMetaUpdate = async (updates: InlineMetaUpdatePayload) => {
    // Don't allow updates for cross-branch tasks
    if (isFromOtherBranch) return;

    // Optimistic UI
    if (updates.status !== undefined) setStatus(String(updates.status));
    if (updates.assignee !== undefined) setAssignee(updates.assignee as string[]);
    if (updates.labels !== undefined) setLabels(updates.labels as string[]);
    if (updates.priority !== undefined) setPriority(String(updates.priority));
    if (updates.dependencies !== undefined) setDependencies(updates.dependencies as string[]);
    if (updates.references !== undefined) setReferences(updates.references as string[]);
    if (updates.description !== undefined) setDescription(String(updates.description ?? ""));
    if (updates.milestone !== undefined) setMilestone((updates.milestone ?? "") as string);

    // Only update server if editing existing task
    if (task) {
      try {
        await apiClient.updateTask(task.id, updates);
        if (onSaved) await onSaved();
        await loadTaskAuditEvents(task.id);
      } catch (err) {
        console.error("Failed to update task metadata", err);
        // No rollback for simplicity; caller can refresh
      }
    }
  };

  // labels handled via ChipInput; no textarea parsing

  const normalizeReferenceList = (input: string[]): string[] => {
    const unique = new Set<string>();
    for (const value of input) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        unique.add(trimmed);
      }
    }
    return Array.from(unique);
  };

  const updateReferencesWithScreenshotInstructions = async (nextReferencesInput: string[]) => {
    const nextReferences = normalizeReferenceList(nextReferencesInput);
    const nextDescription = applyScreenshotReviewInstruction(description, nextReferences);

    if (task && mode === "preview") {
      await handleInlineMetaUpdate({
        references: nextReferences,
        description: nextDescription,
      });
      return;
    }

    setReferences(nextReferences);
    setDescription(nextDescription);
  };

  const toggleScreenshotSelection = (path: string) => {
    setSelectedScreenshots((current) =>
      current.includes(path) ? current.filter((value) => value !== path) : [...current, path]
    );
  };

  const showScreenshotPreview = (path: string, url: string) => {
    setHoveredScreenshotPreview({ path, url });
  };

  const hideScreenshotPreview = () => {
    setHoveredScreenshotPreview(null);
  };

  const handleAttachSelectedScreenshots = async () => {
    if (selectedScreenshots.length === 0 || isFromOtherBranch) {
      return;
    }
    const screenshotReferences = selectedScreenshots
      .map((path) => toScreenshotReference(path))
      .filter((value): value is string => Boolean(value));
    if (screenshotReferences.length === 0) {
      return;
    }
    const nextReferences = normalizeReferenceList([...references, ...screenshotReferences]);
    if (nextReferences.length === references.length) {
      setSelectedScreenshots([]);
      return;
    }
    await updateReferencesWithScreenshotInstructions(nextReferences);
      setSelectedScreenshots([]);
    };

  const handleUnassociateScreenshot = async (screenshotPath: string) => {
    const screenshotReference = toScreenshotReference(screenshotPath);
    if (!screenshotReference || !references.includes(screenshotReference)) {
      return;
    }
    const nextReferences = references.filter((ref) => ref !== screenshotReference);
    await updateReferencesWithScreenshotInstructions(nextReferences);
    setSelectedScreenshots((current) => current.filter((value) => value !== screenshotPath));
  };

  const handlePasteScreenshotIntoReferences = async (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (isFromOtherBranch) {
      return;
    }
    const pastedImages = getClipboardImageFiles(event.clipboardData);
    if (pastedImages.length === 0) {
      return;
    }
    event.preventDefault();
    setError(null);
    setIsUploadingScreenshot(true);
    try {
      const uploads = await Promise.all(
        pastedImages.map((file, index) =>
          apiClient.uploadScreenshot(file, {
            prefix: "task",
            taskId: task?.id,
            filename: task?.id ? undefined : `pasted-${Date.now()}-${index + 1}`,
          }),
        ),
      );
      const pastedReferences = uploads
        .map((upload) => toScreenshotReference(upload.path))
        .filter((value): value is string => Boolean(value));
      if (pastedReferences.length > 0) {
        await updateReferencesWithScreenshotInstructions([...references, ...pastedReferences]);
      }
      const screenshotPaths = await apiClient.fetchScreenshots().catch(() => null);
      if (screenshotPaths) {
        setAvailableScreenshots(screenshotPaths);
      } else {
        setAvailableScreenshots((current) => {
          const merged = new Set([...current, ...uploads.map((upload) => upload.path)]);
          return Array.from(merged).sort((a, b) => a.localeCompare(b));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload pasted screenshot");
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  const reopenStatusOptions = useMemo(
    () => getReopenTargetStatuses(availableStatuses ?? []),
    [availableStatuses],
  );
  const defaultReopenStatus = useMemo(
    () => getDefaultReopenTargetStatus(reopenStatusOptions, status || "In Progress"),
    [reopenStatusOptions, status],
  );

  const handleReopenTask = async (details: string, nextStatus: string) => {
    if (!task || isFromOtherBranch) {
      return;
    }
    setIsReopening(true);
    setError(null);
    try {
      const nextDescription = prependReopenedDetails(description, details, new Date());
      await apiClient.updateTask(task.id, { status: nextStatus, description: nextDescription });
      setDescription(nextDescription);
      setStatus(nextStatus);
      setIsReopenModalOpen(false);
      if (onSaved) await onSaved();
      await loadTaskAuditEvents(task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReopening(false);
    }
  };

	const handleComplete = async () => {
		if (!task) return;
		if (!window.confirm("Complete this task? It will be moved to the completed folder.")) return;
		try {
			await apiClient.completeTask(task.id);
			if (onSaved) await onSaved();
			onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleArchive = async () => {
    if (!task || !onArchive) return;
    if (!window.confirm(`Are you sure you want to archive "${task.title}"? This will move the task to the archive folder.`)) return;
    onArchive();
    onClose();
  };

  const checkedCount = (criteria || []).filter((c) => c.checked).length;
  const totalCount = (criteria || []).length;
  const definitionCheckedCount = (definitionOfDone || []).filter((c) => c.checked).length;
  const definitionTotalCount = (definitionOfDone || []).length;
  const normalizedStatus = (status || "").toLowerCase();
  const isDoneStatus = normalizedStatus.includes("done") || normalizedStatus.includes("complete");

  const displayId = task?.id ?? "";
  const documentation = task?.documentation ?? [];
  const modalTitle = isCreateMode ? (
    isDraftMode ? "Create New Draft" : "Create New Task"
  ) : (
    <div className="flex items-center gap-2 min-w-0">
      {onNavigateTask && taskNavigationIndex !== -1 && (
        <div className="flex items-center gap-1 flex-shrink-0 mr-1">
          <button
            type="button"
            onClick={() => handleNavigateToTask(previousTaskId)}
            disabled={!previousTaskId}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
            title="Previous task"
            aria-label="Previous task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleNavigateToTask(nextTaskId)}
            disabled={!nextTaskId}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
            title="Next task"
            aria-label="Next task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
      <span className="truncate">{`${displayId} — ${task.title}`}</span>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        // When in edit mode, confirm closing if dirty
        if (mode === "edit" && isDirty) {
          if (!window.confirm("Discard unsaved changes and close?")) return;
        }
        onClose();
      }}
      title={modalTitle}
      maxWidthClass="max-w-5xl"
      heightClass="h-[94vh]"
      disableEscapeClose={mode === "edit" || mode === "create"}
      actions={
        <div className="flex items-center gap-2">
              {isDoneStatus && mode === "preview" && !isCreateMode && !isFromOtherBranch && reopenStatusOptions.length > 0 && (
                <button
                  onClick={() => setIsReopenModalOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
                  title="Re-open this task and add context to description"
                >
                  Re-open
                </button>
              )}
		          {isDoneStatus && mode === "preview" && !isCreateMode && !isFromOtherBranch && (
		            <button
		              onClick={handleComplete}
		              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
		              title="Move to completed folder (removes from board)"
		            >
		              Completed
		            </button>
		          )}
		          {mode === "preview" && !isCreateMode && !isFromOtherBranch ? (
		            <button
		              onClick={() => setMode("edit")}
		              className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
		              title="Edit"
		            >
              Edit
            </button>
          ) : (mode === "edit" || mode === "create") ? (
            <div className="flex items-center gap-2">
		              <button
		                onClick={handleCancelEdit}
		                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
		                title="Cancel"
		              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
		              <button
		                onClick={() => void handleSave()}
		                disabled={saving}
		                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200 disabled:opacity-50"
		                title="Save"
		              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {saving ? "Saving…" : (isCreateMode ? "Create" : "Save")}
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      {error && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {hasPendingExternalUpdates && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <span>Updates are pending and will sync when you close this window.</span>
        </div>
      )}

      {/* Cross-branch task indicator */}
      {isFromOtherBranch && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200">
          <svg className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <div className="flex-1">
            <span className="font-medium">Read-only:</span> This task exists in the <span className="font-semibold">{task?.branch}</span> branch. Switch to that branch to edit it.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="md:col-span-2 space-y-6">
          {/* Title field for create mode */}
          {isCreateMode && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader title="Title" />
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    focusDescriptionEditor();
                  }
                }}
                placeholder="Enter task title"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200"
              />
            </div>
          )}
          {/* Description */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader
              title="Description"
              right={
                <button
                  type="button"
                  onClick={() => toggleTextSectionCollapsed("description")}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {collapsedTextSections.description ? "Expand" : "Collapse"}
                </button>
              }
            />
            {collapsedTextSections.description ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Section collapsed</div>
            ) : mode === "preview" ? (
              description ? (
                <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                  <MermaidMarkdown source={description} />
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No description</div>
              )
            ) : (
              <div ref={descriptionEditorContainerRef} className="border border-gray-200 dark:border-gray-700 rounded-md">
                <MDEditor
                  value={description}
                  onChange={(val) => setDescription(val || "")}
                  preview="edit"
                  height={320}
                  data-color-mode={theme}
                />
              </div>
            )}
          </div>

          {/* References */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader title="References" />
            <div className="space-y-3">
              {references.length > 0 ? (
                <ul className="space-y-2">
                  {references.map((ref, idx) => {
                    const screenshotUrl = toScreenshotUrl(ref);
                    return (
                      <li key={idx} className="flex items-center gap-3 group">
                        <span className="flex-1 min-w-0">
                          {ref.startsWith("http://") || ref.startsWith("https://") ? (
                            <a
                              href={ref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                            >
                              {ref}
                            </a>
                          ) : screenshotUrl ? (
                            <a
                              href={screenshotUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                              title="Open screenshot"
                            >
                              {ref}
                            </a>
                          ) : (
                            <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
                              {ref}
                            </code>
                          )}
                        </span>
                        {screenshotUrl && (
                          <button
                            type="button"
                            className="text-gray-400 hover:text-blue-500 transition-colors flex-shrink-0"
                            onMouseEnter={() => showScreenshotPreview(ref, screenshotUrl)}
                            onMouseLeave={hideScreenshotPreview}
                            onFocus={() => showScreenshotPreview(ref, screenshotUrl)}
                            onBlur={hideScreenshotPreview}
                            aria-label={`Preview ${ref}`}
                            title="Hover to preview"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
                              <circle cx="12" cy="12" r="3" strokeWidth={2} />
                            </svg>
                          </button>
                        )}
                        {!isFromOtherBranch && (
                          <button
                            onClick={() => {
                              const newRefs = references.filter((_, i) => i !== idx);
                              void updateReferencesWithScreenshotInstructions(newRefs);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                            title="Remove reference"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No references</p>
              )}
              {!isFromOtherBranch && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem("newRef") as HTMLInputElement;
                    const value = input.value.trim();
                    if (value && !references.includes(value)) {
                      void updateReferencesWithScreenshotInstructions([...references, value]);
                      input.value = "";
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="newRef"
                    type="text"
                    placeholder="URL or file path..."
                    onPaste={(event) => {
                      void handlePasteScreenshotIntoReferences(event);
                    }}
                    className="flex-1 text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    Add
                  </button>
                </form>
              )}
              {!isFromOtherBranch && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Paste image from clipboard in the field above to upload to `backlog/images` and auto-attach.
                  {isUploadingScreenshot ? " Uploading..." : ""}
                </p>
              )}
              {!isFromOtherBranch && (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsScreenshotLibraryCollapsed((current) => !current)}
                    className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  >
                    <svg className={`h-3 w-3 transition-transform ${isScreenshotLibraryCollapsed ? "" : "rotate-90"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    {isScreenshotLibraryCollapsed ? "Show screenshot library" : "Hide screenshot library"}
                  </button>
                  {!isScreenshotLibraryCollapsed && (
                    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/20">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Attach screenshot from `backlog/images`
                        </div>
                        <div className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setScreenshotViewMode("thumbnails")}
                            className={`px-2 py-1 text-xs font-medium transition-colors ${
                              screenshotViewMode === "thumbnails"
                                ? "bg-blue-500 text-white"
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            }`}
                            aria-pressed={screenshotViewMode === "thumbnails"}
                          >
                            Thumbnails
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenshotViewMode("list")}
                            className={`px-2 py-1 text-xs font-medium border-l border-gray-300 dark:border-gray-600 transition-colors ${
                              screenshotViewMode === "list"
                                ? "bg-blue-500 text-white"
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            }`}
                            aria-pressed={screenshotViewMode === "list"}
                          >
                            List
                          </button>
                        </div>
                      </div>
                  {availableScreenshots.length > 0 ? (
                    <div className="space-y-3">
                      {screenshotViewMode === "thumbnails" ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                          {availableScreenshots.map((screenshotPath) => {
                            const screenshotUrl = toScreenshotUrl(screenshotPath);
                            const screenshotReference = toScreenshotReference(screenshotPath);
                            const isAttached = screenshotReference ? references.includes(screenshotReference) : false;
                            const isSelected = selectedScreenshots.includes(screenshotPath);
                            return (
                              <div
                                key={screenshotPath}
                                className={`rounded-md border p-2 transition-colors ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-600"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleScreenshotSelection(screenshotPath)}
                                    className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded"
                                    aria-label={`Select ${screenshotPath}`}
                                  />
                                  {isAttached && (
                                    <>
                                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                        Attached
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => void handleUnassociateScreenshot(screenshotPath)}
                                        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                        aria-label={`Unassociate ${screenshotPath}`}
                                        title="Unassociate screenshot"
                                      >
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                  <div className="ml-auto">
                                    <button
                                      type="button"
                                      className={`inline-flex items-center justify-center h-7 w-7 -m-1 rounded-full transition-colors ${
                                        screenshotUrl
                                          ? "text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-300 dark:hover:text-blue-300 dark:hover:bg-blue-900/40"
                                          : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                                      }`}
                                      onMouseEnter={() => {
                                        if (screenshotUrl) {
                                          showScreenshotPreview(screenshotPath, screenshotUrl);
                                        }
                                      }}
                                      onMouseLeave={hideScreenshotPreview}
                                      onFocus={() => {
                                        if (screenshotUrl) {
                                          showScreenshotPreview(screenshotPath, screenshotUrl);
                                        }
                                      }}
                                      onBlur={hideScreenshotPreview}
                                      disabled={!screenshotUrl}
                                      aria-label={`Preview ${screenshotPath}`}
                                      title={screenshotUrl ? "Hover to preview" : "Preview unavailable"}
                                    >
                                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
                                        <circle cx="12" cy="12" r="3" strokeWidth={2} />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                {screenshotUrl ? (
                                  <img
                                    src={screenshotUrl}
                                    alt={screenshotPath}
                                    className="w-full h-20 object-cover rounded border border-gray-200 dark:border-gray-700 mb-1"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-20 rounded border border-gray-200 dark:border-gray-700 mb-1 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-400">
                                    Preview unavailable
                                  </div>
                                )}
                                <div className="text-[11px] text-gray-700 dark:text-gray-300 break-all line-clamp-2">
                                  {screenshotPath}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                          {availableScreenshots.map((screenshotPath) => {
                            const screenshotUrl = toScreenshotUrl(screenshotPath);
                            const screenshotReference = toScreenshotReference(screenshotPath);
                            const isAttached = screenshotReference ? references.includes(screenshotReference) : false;
                            const isSelected = selectedScreenshots.includes(screenshotPath);
                            return (
                              <div
                                key={screenshotPath}
                                className={`rounded-md border px-2 py-1.5 transition-colors ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-600"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleScreenshotSelection(screenshotPath)}
                                    className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded"
                                    aria-label={`Select ${screenshotPath}`}
                                  />
                                  <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 truncate" title={screenshotPath}>
                                    {screenshotPath}
                                  </span>
                                  {isAttached && (
                                    <>
                                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                        Attached
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => void handleUnassociateScreenshot(screenshotPath)}
                                        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                        aria-label={`Unassociate ${screenshotPath}`}
                                        title="Unassociate screenshot"
                                      >
                                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className={`inline-flex items-center justify-center h-7 w-7 -m-1 rounded-full transition-colors ${
                                      screenshotUrl
                                        ? "text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-300 dark:hover:text-blue-300 dark:hover:bg-blue-900/40"
                                        : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                                    }`}
                                    onMouseEnter={() => {
                                      if (screenshotUrl) {
                                        showScreenshotPreview(screenshotPath, screenshotUrl);
                                      }
                                    }}
                                    onMouseLeave={hideScreenshotPreview}
                                    onFocus={() => {
                                      if (screenshotUrl) {
                                        showScreenshotPreview(screenshotPath, screenshotUrl);
                                      }
                                    }}
                                    onBlur={hideScreenshotPreview}
                                    disabled={!screenshotUrl}
                                    aria-label={`Preview ${screenshotPath}`}
                                    title={screenshotUrl ? "Hover to preview" : "Preview unavailable"}
                                  >
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
                                      <circle cx="12" cy="12" r="3" strokeWidth={2} />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {selectedScreenshots.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleAttachSelectedScreenshots()}
                          disabled={selectedScreenshots.length === 0}
                          className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                        >
                          Attach selected
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No screenshots found in `backlog/images`.
                    </p>
                  )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Documentation */}
          {documentation.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader title="Documentation" />
              <div className="space-y-2">
                <ul className="space-y-2">
                  {documentation.map((doc, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        {doc.startsWith("http://") || doc.startsWith("https://") ? (
                          <a
                            href={doc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {doc}
                          </a>
                        ) : (
                          <code className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded break-all">
                            {doc}
                          </code>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader
              title={`Acceptance Criteria ${totalCount ? `(${checkedCount}/${totalCount})` : ""}`}
              right={mode === "preview" ? (
                <span>Toggle to update</span>
              ) : null}
            />
            {mode === "preview" ? (
              <ul className="space-y-2">
                {(criteria || []).map((c) => (
                  <li key={c.index} className="flex items-start gap-2 rounded-md px-2 py-1">
                    <input
                      type="checkbox"
                      checked={c.checked}
                      onChange={(e) => void handleToggleCriterion(c.index, e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="text-sm text-gray-800 dark:text-gray-100">{c.text}</div>
                  </li>
                ))}
                {totalCount === 0 && (
                  <li className="text-sm text-gray-500 dark:text-gray-400">No acceptance criteria</li>
                )}
              </ul>
            ) : (
              <AcceptanceCriteriaEditor criteria={criteria} onChange={setCriteria} />
            )}
          </div>

          {/* Definition of Done */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader
              title={`Definition of Done ${definitionTotalCount ? `(${definitionCheckedCount}/${definitionTotalCount})` : ""}`}
              right={mode === "preview" ? (
                <span>Toggle to update</span>
              ) : null}
            />
            {mode === "preview" ? (
              <ul className="space-y-2">
                {(definitionOfDone || []).map((item) => (
                  <li key={item.index} className="flex items-start gap-2 rounded-md px-2 py-1">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => void handleToggleDefinitionOfDone(item.index, e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="text-sm text-gray-800 dark:text-gray-100">{item.text}</div>
                  </li>
                ))}
                {definitionTotalCount === 0 && (
                  <li className="text-sm text-gray-500 dark:text-gray-400">No Definition of Done items</li>
                )}
              </ul>
            ) : (
              <AcceptanceCriteriaEditor
                criteria={definitionOfDone}
                onChange={setDefinitionOfDone}
                label="Definition of Done"
                preserveIndices
                disableToggle={isCreateMode}
              />
            )}
          </div>

          {/* Implementation Plan */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader
              title="Implementation Plan"
              right={
                <button
                  type="button"
                  onClick={() => toggleTextSectionCollapsed("plan")}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {collapsedTextSections.plan ? "Expand" : "Collapse"}
                </button>
              }
            />
            {collapsedTextSections.plan ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Section collapsed</div>
            ) : mode === "preview" ? (
              plan ? (
                <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                  <MermaidMarkdown source={plan} />
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No plan</div>
              )
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-md">
                <MDEditor
                  value={plan}
                  onChange={(val) => setPlan(val || "")}
                  preview="edit"
                  height={280}
                  data-color-mode={theme}
                />
              </div>
            )}
          </div>

          {/* Implementation Notes */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <SectionHeader
              title="Implementation Notes"
              right={
                <button
                  type="button"
                  onClick={() => toggleTextSectionCollapsed("notes")}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {collapsedTextSections.notes ? "Expand" : "Collapse"}
                </button>
              }
            />
            {collapsedTextSections.notes ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Section collapsed</div>
            ) : mode === "preview" ? (
              notes ? (
                <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                  <MermaidMarkdown source={notes} />
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">No notes</div>
              )
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-md">
                <MDEditor
                  value={notes}
                  onChange={(val) => setNotes(val || "")}
                  preview="edit"
                  height={280}
                  data-color-mode={theme}
                />
              </div>
            )}
          </div>

          {/* Audit Log */}
          {task && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader
                title="Audit Log"
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    {TASK_AUDIT_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => setTaskAuditFilter(filter.value)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 ${
                          taskAuditFilter === filter.value
                            ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                            : "bg-gray-100 text-gray-600 hover:text-gray-800 dark:bg-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                }
              />
              {taskAuditError ? (
                <div className="text-sm text-red-600 dark:text-red-400">{taskAuditError}</div>
              ) : taskAuditLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading audit events...</div>
              ) : visibleTaskAuditEvents.length > 0 ? (
                <div className="space-y-3">
                  {visibleTaskAuditEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{event.summary}</span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {formatAuditEventType(event.eventType)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
                        <span>When: {formatStoredUtcDateForDisplay(event.occurredAt)}</span>
                        <span>Actor: {formatAuditActor(event)}</span>
                        {Object.entries(event.data).slice(0, 8).map(([key, value]) => (
                          <span key={`${event.id}-${key}`}>
                            {key}: {formatAuditValue(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No {taskAuditFilter === "all" ? "" : `${taskAuditFilter} `}audit events recorded yet
                </div>
              )}
            </div>
          )}

          {/* Final Summary */}
          {(mode !== "preview" || finalSummary.trim().length > 0) && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <SectionHeader
                title="Final Summary"
                right={
                  <div className="flex items-center gap-3">
                    <span>Completion summary</span>
                    <button
                      type="button"
                      onClick={() => toggleTextSectionCollapsed("finalSummary")}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {collapsedTextSections.finalSummary ? "Expand" : "Collapse"}
                    </button>
                  </div>
                }
              />
              {collapsedTextSections.finalSummary ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Section collapsed</div>
              ) : mode === "preview" ? (
                <div className="prose prose-sm !max-w-none wmde-markdown" data-color-mode={theme}>
                  <MermaidMarkdown source={finalSummary} />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-md">
                  <MDEditor
                    value={finalSummary}
                    onChange={(val) => setFinalSummary(val || "")}
                    preview="edit"
                    height={220}
                    data-color-mode={theme}
                    textareaProps={{
                      placeholder: "PR-style summary of what was implemented (write when task is complete)",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1 space-y-4">
          {/* Dates */}
	          {task && (
	            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
	              <div><span className="font-semibold text-gray-800 dark:text-gray-100">Created:</span> <span className="text-gray-700 dark:text-gray-200">{formatStoredUtcDateForDisplay(task.createdDate)}</span></div>
	              {task.updatedDate && (
	                <div><span className="font-semibold text-gray-800 dark:text-gray-100">Updated:</span> <span className="text-gray-700 dark:text-gray-200">{formatStoredUtcDateForDisplay(task.updatedDate)}</span></div>
	              )}
	            </div>
	          )}
          {/* Title (editable for existing tasks) */}
          {task && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
              <SectionHeader title="Title" />
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                onBlur={() => {
                  if (title.trim() && title !== task.title) {
                    void handleInlineMetaUpdate({ title: title.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={isFromOtherBranch}
                className={`w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
          )}

          {/* Status */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Status" />
            <StatusSelect current={status} onChange={(val) => handleInlineMetaUpdate({ status: val })} disabled={isFromOtherBranch} />
          </div>

          {/* Assignee */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Assignee" />
            <ChipInput
              name="assignee"
              label=""
              value={assignee}
              onChange={(value) => handleInlineMetaUpdate({ assignee: value })}
              placeholder="Type name and press Enter"
              disabled={isFromOtherBranch}
            />
          </div>

          {/* Labels */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Labels" />
            <ChipInput
              name="labels"
              label=""
              value={labels}
              onChange={(value) => handleInlineMetaUpdate({ labels: value })}
              placeholder="Type label and press Enter or comma"
              disabled={isFromOtherBranch}
            />
          </div>

          {/* Priority */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Priority" />
            <select
              className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={priority}
              onChange={(e) => handleInlineMetaUpdate({ priority: e.target.value as any })}
              disabled={isFromOtherBranch}
            >
              <option value="">No Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Milestone */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Milestone" />
            <select
              className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${isFromOtherBranch ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={milestoneSelectionValue}
				onChange={(e) => {
					const value = e.target.value;
					setMilestone(value);
					handleInlineMetaUpdate({ milestone: value.trim().length > 0 ? value : null });
				}}
              disabled={isFromOtherBranch}
            >
              <option value="">No milestone</option>
              {!hasMilestoneSelection && milestoneSelectionValue ? (
                <option value={milestoneSelectionValue}>{resolveMilestoneLabel(milestoneSelectionValue)}</option>
              ) : null}
              {(milestoneEntities ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* Dependencies */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <SectionHeader title="Dependencies" />
            <DependencyInput
              value={dependencies}
              onChange={(value) => handleInlineMetaUpdate({ dependencies: value })}
              availableTasks={availableTasks}
              currentTaskId={task?.id}
              label=""
              disabled={isFromOtherBranch}
            />
          </div>

          {/* Archive button at bottom of sidebar */}
		          {task && onArchive && !isFromOtherBranch && (
		            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
		              <button
		                onClick={handleArchive}
		                className="w-full inline-flex items-center justify-center px-4 py-2 bg-red-500 dark:bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-600 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-red-400 dark:focus:ring-red-500 transition-colors duration-200"
		              >
		                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Archive Task
              </button>
            </div>
          )}
        </div>
      </div>
      {hoveredScreenshotPreview && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center pointer-events-none">
          <div className="max-w-5xl max-h-[85vh] p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
            <img
              src={hoveredScreenshotPreview.url}
              alt={hoveredScreenshotPreview.path}
              className="max-w-[75vw] max-h-[75vh] object-contain rounded-md"
            />
            <div className="mt-2 text-xs text-gray-700 dark:text-gray-300 break-all">
              {hoveredScreenshotPreview.path}
            </div>
          </div>
        </div>
      )}
      <ReopenTaskModal
        isOpen={isReopenModalOpen}
        onClose={() => {
          if (!isReopening) {
            setIsReopenModalOpen(false);
          }
        }}
        onConfirm={handleReopenTask}
        taskTitle={task?.title ?? "Task"}
        statusOptions={reopenStatusOptions.length > 0 ? reopenStatusOptions : [status]}
        defaultStatus={defaultReopenStatus}
        isSubmitting={isReopening}
      />
    </Modal>
  );
};

const StatusSelect: React.FC<{ current: string; onChange: (v: string) => void; disabled?: boolean }> = ({ current, onChange, disabled }) => {
  const [statuses, setStatuses] = useState<string[]>([]);
  useEffect(() => {
    apiClient.fetchStatuses().then(setStatuses).catch(() => setStatuses(["To Do", "In Progress", "Done"]));
  }, []);
  return (
    <select
      className={`w-full h-10 px-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {statuses.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
};

const AutoResizeTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}> = ({ value, onChange, onBlur, placeholder }) => {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      rows={1}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 focus:border-transparent transition-colors duration-200 resize-none"
      placeholder={placeholder}
    />
  );
};

export default TaskDetailsModal;
