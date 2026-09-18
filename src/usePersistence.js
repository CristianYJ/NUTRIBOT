import { useEffect, useRef, useState } from "react";
import { stateRequest } from "./api.js";

// Serializes writes and uses the server revision to detect concurrent tabs.
// The recipe history is server-owned and is never uploaded from the browser.
export function usePersistence(initial, snapshot) {
  const serialized = JSON.stringify(snapshot);
  const latest = useRef(serialized);
  latest.current = serialized;
  const accepted = useRef(serialized);
  const revision = useRef(initial.revision);
  const running = useRef(null);
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState(null);
  const dirty = serialized !== accepted.current;

  async function flush() {
    if (running.current) return running.current;
    setError(null);
    const job = async () => {
      try {
        while (latest.current !== accepted.current) {
          setStatus("saving");
          const pending = latest.current;
          const response = await stateRequest("PUT", {
            ...JSON.parse(pending),
            revision: revision.current,
          });
          revision.current = response.revision;
          accepted.current = pending;
        }
        setStatus("saved");
        return revision.current;
      } catch (problem) {
        setStatus("error");
        setError(problem);
        throw problem;
      }
    };
    // Defer so running.current is assigned even when no write is needed.
    running.current = Promise.resolve()
      .then(job)
      .finally(() => {
        running.current = null;
      });
    return running.current;
  }

  useEffect(() => {
    if (!dirty || error) return;
    const timer = setTimeout(() => {
      flush().catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [serialized, error]);
  useEffect(() => {
    const preventLoss = (event) => {
      if (latest.current !== accepted.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, []);
  return {
    status: error ? "error" : dirty ? "saving" : status,
    error,
    flush,
    discardAndReload() {
      // The button explicitly discards pending edits; do not show a second
      // beforeunload warning for that deliberate action.
      accepted.current = latest.current;
      window.location.reload();
    },
    acceptReset(state) {
      const value = JSON.stringify({
        pantry: state.pantry,
        profile: state.profile,
        saved: state.saved,
        feedback: state.feedback,
      });
      latest.current = value;
      accepted.current = value;
      revision.current = state.revision;
      setError(null);
      setStatus("saved");
    },
  };
}
