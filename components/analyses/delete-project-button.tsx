"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { deleteProject, type DeleteState } from "@/app/(app)/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INITIAL: DeleteState = { error: null, deleted: false };

/**
 * Confirmation before deleting a project. Deleting cascades to the analysis,
 * stored map, routes, and cached explanations. On success the browser does a
 * full navigation to /dashboard so any live progress channels tear down cleanly.
 */
export function DeleteProjectButton({
  projectId,
  repository,
  iconOnly = false,
}: {
  projectId: string;
  repository: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteProject, INITIAL);

  useEffect(() => {
    if (state.deleted) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load tears down any live progress channels cleanly
      window.location.assign("/dashboard");
    }
  }, [state.deleted]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
        }
      }}
    >
      <AlertDialogTrigger
        aria-label={`Delete ${repository}`}
        title={`Delete ${repository}`}
        className={cn(
          buttonVariants({
            variant: iconOnly ? "ghost" : "outline",
            size: iconOnly ? "icon-xs" : "xs",
          }),
          iconOnly
            ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            : "text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <Trash2 className="size-3" aria-hidden="true" />
        {iconOnly ? (
          <span className="sr-only">Delete {repository}</span>
        ) : (
          "Delete"
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete repository</AlertDialogTitle>
          <AlertDialogDescription>
            Remove{" "}
            <span className="font-mono text-foreground">{repository}</span> and
            its parsed map, routes, and explanations from this workspace. You
            can analyse it again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.error ? (
          <p
            role="alert"
            className="font-mono text-[10.5px] wrap-break-word text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <form action={action}>
            <input type="hidden" name="projectId" value={projectId} />
            <AlertDialogAction
              type="submit"
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
