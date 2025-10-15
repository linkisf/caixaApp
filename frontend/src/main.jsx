import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [api, setApi] = React.useState(null);
  React.useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || "http://localhost:8000") + "/health")
      .then(r => r.json()).then(setApi).catch(() => setApi({status:"erro"}));
  }, []);
  return (
    <div style={{fontFamily:"sans-serif", padding:24}}>
      <h1>Frontend OK</h1>
      <p>Backend /health: {api ? JSON.stringify(api) : "carregando..."}</p>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
