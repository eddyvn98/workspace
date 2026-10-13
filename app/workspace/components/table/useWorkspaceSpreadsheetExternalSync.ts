"use client";

import { useEffect, useRef, useState } from "react";

interface Params {
  dataSignature: string;
  lastEmittedRef: { current: string };
}

/** Recreates Fortune Sheet from remote snapshots without passing mutable data to its updater. */
export function useWorkspaceSpreadsheetExternalSync({
  dataSignature,
  lastEmittedRef,
}: Params): number {
  const lastPropSignatureRef = useRef(dataSignature);
  const [syncVersion, setSyncVersion] = useState(0);

  useEffect(() => {
    if (dataSignature === lastPropSignatureRef.current) return;
    lastPropSignatureRef.current = dataSignature;
    if (dataSignature === lastEmittedRef.current) return;

    // Fortune Sheet mutates updateSheet inputs inside a React state updater.
    // StrictMode can replay that updater after Immer freezes the first result.
    // Remounting from the remote snapshot avoids that unsafe mutable API path.
    lastEmittedRef.current = dataSignature;
    setSyncVersion((version) => version + 1);
  }, [dataSignature, lastEmittedRef]);

  return syncVersion;
}
