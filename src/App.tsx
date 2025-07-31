import { useState } from "react";
import "./App.css";
import "./index.css";
import AudioVisualizer from "./components/three/AudioVisualizer2";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex h-full max-h-[100vh] w-full max-w-[100vw]">
      {/* <AudioVisualizer /> */}
      <AudioVisualizer />
    </div>
  );
}

export default App;
