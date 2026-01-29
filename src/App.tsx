import { useState } from "react";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { ChatPanel } from "./features/chat/ChatPanel";
import type { ConnectionResponse } from "./types/ravatar";
import "./styles.css";

function App() {
  const [activeTab, setActiveTab] = useState<"settings" | "chat">("settings");
  const [apiUrl, setApiUrl] = useState<string>("");
  const [jwtToken, setJwtToken] = useState<string>("");
  const [connection, setConnection] = useState<ConnectionResponse | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");

  const handleApiUrlSet = (url: string) => {
    setApiUrl(url);
  };

  const handleJwtReceived = (jwt: string) => {
    setJwtToken(jwt);
  };

  const handleConnectionReceived = (conn: ConnectionResponse) => {
    setConnection(conn);
  };

  const handleAvatarSelected = (avatarId: string) => {
    setSelectedAvatarId(avatarId);
  };

  const handleLanguageSelected = (language: string) => {
    setSelectedLanguage(language);
  };

  // Track completion of all 4 steps
  const step1Complete = !!apiUrl;
  const step2Complete = !!jwtToken;
  const step3Complete = !!connection;
  const step4Complete = !!selectedAvatarId && !!selectedLanguage;

  const completedSteps = [
    step1Complete,
    step2Complete,
    step3Complete,
    step4Complete,
  ].filter(Boolean).length;
  const allStepsComplete = completedSteps === 4;

  const isConfigured = allStepsComplete;

  return (
    <div className="app">
      <nav className="app-nav">
        <button
          className={activeTab === "settings" ? "active" : ""}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Settings
        </button>
        <button
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
          disabled={!isConfigured}
          title={
            !isConfigured
              ? `Complete all 4 setup steps to enable Chat (${completedSteps}/4 completed)`
              : "Go to Chat"
          }
        >
          💬 Chat
        </button>
      </nav>

      <main className="app-content">
        {activeTab === "settings" && (
          <SettingsPanel
            onApiUrlSet={handleApiUrlSet}
            onJwtReceived={handleJwtReceived}
            onConnectionReceived={handleConnectionReceived}
            onAvatarSelected={handleAvatarSelected}
            onLanguageSelected={handleLanguageSelected}
            step2Complete={step2Complete}
            step3Complete={step3Complete}
            step4Complete={step4Complete}
          />
        )}
        {activeTab === "chat" && (
          <ChatPanel
            jwtToken={jwtToken}
            avatarId={selectedAvatarId}
            language={selectedLanguage}
            sessionId={connection?.session}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          {isConfigured
            ? `✅ All steps completed! Ready to Chat`
            : `⚙️ Setup in progress: ${completedSteps}/4 steps completed`}
        </p>
      </footer>
    </div>
  );
}

export default App;
