import { useEffect, useMemo, useRef, useState } from "react";
import { RavatarApi } from "../../api/ravatar";
import { storage } from "../../utils/storage";
import type { Avatar, Language, ConnectionResponse } from "../../types/ravatar";

import styles from "./SettingsPanel.module.css";
import { generateUserID } from "../../utils/uuid";

interface SettingsPanelProps {
  onApiUrlSet: (url: string) => void;
  onJwtReceived: (jwt: string) => void;
  onConnectionReceived: (connection: ConnectionResponse) => void;
  onAvatarSelected: (avatarId: string) => void;
  onLanguageSelected: (language: string) => void;
  step2Complete: boolean;
  step3Complete: boolean;
  step4Complete: boolean;
}

const STORAGE_USER_ID_KEY = "user-id";
const STORAGE_PROJECT_ID_KEY = "ravatar-project-id";

export function SettingsPanel({
  onApiUrlSet,
  onJwtReceived,
  onConnectionReceived,
  onAvatarSelected,
  onLanguageSelected,
  step2Complete,
  step3Complete,
  step4Complete,
}: SettingsPanelProps) {
  const [apiUrl] = useState<string>("https://chat.rvtr.ai");

  const [userId] = useState<string>(() => {
    const storedUserId = storage.get<string>(STORAGE_USER_ID_KEY);
    return storedUserId || generateUserID();
  });

  const [projectId, setProjectId] = useState<string>(() => {
    return storage.get<string>(STORAGE_PROJECT_ID_KEY) || "";
  });

  const [jwtToken, setJwtToken] = useState<string>("");
  const [jwtStatus, setJwtStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  // Lists populated from the connection payload to drive the dropdowns
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");

  const [error, setError] = useState<string>("");

  const progress = useMemo(() => {
    const step1IsComplete = Boolean(userId.trim()) && Boolean(projectId.trim());
    const step2Active = step1IsComplete;
    const hasJwt = Boolean(jwtToken) || jwtStatus === "success";
    const step3Active = step2Complete || hasJwt;
    const hasConnection = connectionStatus === "success";
    const step4Active = step3Complete || hasConnection;

    const allStepsComplete =
      step1IsComplete && step2Complete && step3Complete && step4Complete;

    const completedStepsLocal =
      Number(step1IsComplete) +
      Number(step2Complete) +
      Number(step3Complete) +
      Number(step4Complete);

    return {
      step1IsComplete,
      step2Active,
      step3Active,
      step4Active,
      allStepsComplete,
      completedStepsLocal,
    };
  }, [
    connectionStatus,
    jwtStatus,
    jwtToken,
    projectId,
    step2Complete,
    step3Complete,
    step4Complete,
    userId,
  ]);

  const {
    step1IsComplete,
    step2Active,
    step3Active,
    step4Active,
    allStepsComplete,
    completedStepsLocal,
  } = progress;

  // API sometimes returns `_id` / `language_code` instead of `id` / `code`
  // Normalize avatar identifiers returned by the API into a single string
  const getAvatarId = (avatar: Partial<Avatar> & { _id?: string }): string => {
    return (
      (avatar as Avatar & { _id?: string }).id ||
      (avatar as Avatar & { _id?: string })._id ||
      ""
    );
  };

  // Normalize language codes to the same field regardless of API variant
  const getLanguageCode = (
    lang: Partial<Language> & { language_code?: string },
  ): string => {
    return (
      (lang as Language & { language_code?: string }).code ||
      (lang as Language & { language_code?: string }).language_code ||
      ""
    );
  };

  // Create API instance when URL changes
  const api = useMemo(() => {
    if (!apiUrl) return null;
    return new RavatarApi(apiUrl);
  }, [apiUrl]);

  // Inform parent about API URL (configured via env)
  useEffect(() => {
    if (!apiUrl) return;
    onApiUrlSet(apiUrl);
  }, [apiUrl, onApiUrlSet]);

  useEffect(() => {
    storage.set(STORAGE_USER_ID_KEY, userId);
  }, [userId]);

  useEffect(() => {
    storage.set(STORAGE_PROJECT_ID_KEY, projectId);
  }, [projectId]);

  // Keep API instance in sync with the latest JWT token
  useEffect(() => {
    if (!api) return;
    api.setJwtToken(jwtToken || null);
  }, [api, jwtToken]);

  // Step 2 action: request a JWT for the provided user/project pair
  const handleGetJWT = async () => {
    if (!api) {
      setError("Missing API URL. ");
      return;
    }

    if (!userId.trim()) {
      setError("Please enter user_id");
      return;
    }

    if (!projectId.trim()) {
      setError("Please enter project_id");
      return;
    }

    setJwtStatus("loading");
    setError("");

    try {
      const token = await api.getJWT({
        userId: userId.trim(),
        projectId: projectId.trim(),
      });
      setJwtToken(token);
      setJwtStatus("success");
      onJwtReceived(token);
    } catch (err) {
      setJwtStatus("error");
      setError(err instanceof Error ? err.message : "Failed to get JWT token");
      console.error("JWT error:", err);
    }
  };

  // Step 3 action: fetch the connection payload and prime local state
  const handleLoadConnection = async () => {
    if (!api || !jwtToken) {
      setError("Please get JWT token first");
      return;
    }

    setConnectionStatus("loading");
    setError("");

    try {
      const connection = await api.getConnection();
      setAvatars(connection.avatars_info || []);
      setLanguages(connection.languages || []);
      setSessionId(connection.session || "");
      setConnectionStatus("success");
      onConnectionReceived(connection);

      // Auto-select first avatar and language if available
      if (connection.avatars_info?.length > 0) {
        const firstAvatar = getAvatarId(connection.avatars_info[0]);
        if (firstAvatar) {
          setSelectedAvatar(firstAvatar);
          onAvatarSelected(firstAvatar);
        }
      }
      if (connection.languages?.length > 0) {
        const firstLanguage = getLanguageCode(connection.languages[0]);
        if (firstLanguage) {
          setSelectedLanguage(firstLanguage);
          onLanguageSelected(firstLanguage);
        }
      }
    } catch (err) {
      setConnectionStatus("error");
      setError(
        err instanceof Error ? err.message : "Failed to load connection",
      );
      console.error("Connection error:", err);
    }
  };

  // Step 4 handler: bubble up avatar selection changes
  const handleAvatarChange = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    onAvatarSelected(avatarId);
  };

  // Step 4 handler: bubble up language selection changes
  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    onLanguageSelected(language);
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case "loading":
        return "⏳";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⚪";
    }
  };

  const getStepStatus = (
    stepComplete: boolean,
    stepActive: boolean,
    stepStatus: string,
  ) => {
    if (stepComplete) return "✅";
    if (!stepActive) return "⚪";
    if (stepStatus === "loading") return "⏳";
    if (stepStatus === "error") return "❌";
    return "⏳";
  };

  // Determine which steps are active (can be interacted with)
  const step1Active = true; // Always active

  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const step4Ref = useRef<HTMLDivElement | null>(null);

  // Visually animate the progress indicator whenever step completion changes
  useEffect(() => {
    const el = progressFillRef.current;
    if (!el) return;
    const pct = Math.min(100, Math.max(0, (completedStepsLocal / 4) * 100));
    el.style.width = `${pct}%`;
  }, [completedStepsLocal]);

  // Auto-scroll to Step 4 after successful connection load
  useEffect(() => {
    if (connectionStatus !== "success") return;

    // Defer to the next frame so the Step 4 section is rendered/enabled
    requestAnimationFrame(() => {
      step4Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [connectionStatus]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Setup</h2>
        <div className={styles.progressBar}>
          <div className={styles.progressText}>
            {allStepsComplete
              ? "✅ All steps completed! You can now go to the Chat tab."
              : `⚙️ Progress: ${completedStepsLocal}/4 steps completed`}
          </div>
          <div className={styles.progressBarContainer}>
            <div ref={progressFillRef} className={styles.progressBarFill} />
          </div>
        </div>
      </div>

      {error && <div className={styles.error}>❌ {error}</div>}

      {allStepsComplete && (
        <div className={styles.successMessage}>
          🎉 <strong>Setup complete!</strong> All configuration steps are done.
          You can now switch to the Chat tab to start chatting with your avatar.
        </div>
      )}

      {/* Step 1: Configure Credentials */}
      <div
        className={`${styles.section} ${step1Active ? "" : styles.sectionDisabled}`}
      >
        <h3 className={styles.sectionTitle}>
          {getStepStatus(step1IsComplete, step1Active, "idle")} Step 1: Set
          Project ID
        </h3>

        <div className={styles.field}>
          <label className={styles.label}>User ID (random Unique ID)</label>
          <input
            type="text"
            value={userId}
            // onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID"
            className={styles.input}
            disabled
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Project ID</label>
          <input
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="RAVATAR project ID"
            className={styles.input}
            disabled={!step1Active}
          />
        </div>

        {step1IsComplete && (
          <div className={styles.stepCompleteHint}>✓ Credentials saved</div>
        )}
      </div>

      {/* Step 2: Get JWT Token */}
      <div
        className={`${styles.section} ${step2Active ? "" : styles.sectionDisabled}`}
      >
        <h3 className={styles.sectionTitle}>
          {getStepStatus(step2Complete, step2Active, jwtStatus)} Step 2: Get JWT
          token
        </h3>
        {!step2Active && (
          <div className={styles.stepHint}>
            ⚠️ Complete Step 1 to enable this step
          </div>
        )}
        <div className={styles.statusRow}>
          <span>
            JWT status: {getStatusEmoji(jwtStatus)} {jwtStatus}
          </span>
          <button
            onClick={handleGetJWT}
            disabled={!step2Active || jwtStatus === "loading"}
            className={`${styles.button} ${!step2Active || jwtStatus === "loading" ? styles.buttonDisabled : ""}`}
          >
            {jwtStatus === "loading" ? "Getting JWT..." : "Get JWT"}
          </button>
        </div>
        {step2Complete && (
          <div className={styles.stepCompleteHint}>
            ✓ JWT token received successfully
          </div>
        )}
      </div>

      {/* Step 3: Load Connection */}
      <div
        className={`${styles.section} ${step3Active ? "" : styles.sectionDisabled}`}
      >
        <h3 className={styles.sectionTitle}>
          {getStepStatus(step3Complete, step3Active, connectionStatus)} Step 3:
          Load connection
        </h3>
        {!step3Active && (
          <div className={styles.stepHint}>
            ⚠️ Complete Step 2 to enable this step
          </div>
        )}
        <div className={styles.statusRow}>
          <span>
            Connection status: {getStatusEmoji(connectionStatus)}{" "}
            {connectionStatus}
          </span>
          <button
            onClick={handleLoadConnection}
            disabled={!step3Active || connectionStatus === "loading"}
            className={`${styles.button} ${!step3Active || connectionStatus === "loading" ? styles.buttonDisabled : ""}`}
          >
            {connectionStatus === "loading" ? "Loading..." : "Load connection"}
          </button>
        </div>
        {sessionId && (
          <div className={styles.info}>Session ID: {sessionId}</div>
        )}
        {step3Complete && (
          <div className={styles.stepCompleteHint}>
            ✓ Connection loaded successfully
          </div>
        )}
      </div>

      {/* Step 4: Select Avatar & Language */}
      <div
        ref={step4Ref}
        className={`${styles.section} ${step4Active ? "" : styles.sectionDisabled}`}
      >
        <h3 className={styles.sectionTitle}>
          {getStepStatus(step4Complete, step4Active, "idle")} Step 4: Use loaded
          connection data
        </h3>
        {!step4Active && (
          <div className={styles.stepHint}>
            ⚠️ Complete Step 3 to load connection data and enable this step
          </div>
        )}

        {step4Active && connectionStatus === "success" && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Avatar</label>
              <select
                value={selectedAvatar}
                onChange={(e) => handleAvatarChange(e.target.value)}
                className={styles.select}
                disabled={!step4Active}
              >
                {avatars.map((avatar) => {
                  const id = getAvatarId(avatar);
                  const label = avatar.name ? `${avatar.name} (${id})` : id;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {selectedAvatar && (
                <div className={styles.info}>Avatar ID: {selectedAvatar}</div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Language</label>
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className={styles.select}
                disabled={!step4Active}
              >
                {languages.map((lang) => {
                  const code = getLanguageCode(lang);
                  return (
                    <option key={code} value={code}>
                      {lang.name} ({code})
                    </option>
                  );
                })}
              </select>
            </div>

            {step4Complete && (
              <div className={styles.stepCompleteHint}>
                ✓ Avatar and language selected
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
