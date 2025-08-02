import { useState } from "react";
import "./App.css";
import "./index.css";
import AudioVisualizerWithObject from "./components/three/AudioVisualizerWithObj";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex h-full max-h-[100vh] w-full max-w-[100vw]">
      <AudioVisualizerWithObject />
      {/* <AudioVisualizer /> */}
    </div>
  );
}

export default App;
