import { useRef, useState } from "react";
import { useChat } from "../hooks/useChat";
import { FaMicrophone } from "react-icons/fa";

export const UI = ({ hidden, ...props }) => {
  const input = useRef();
  const { chat, loading, cameraZoomed, setCameraZoomed, message } = useChat();

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        
        chat(formData);

        // try {
        //   const response = await fetch("http://localhost:5000/upload", {
        //     method: "POST",
        //     body: formData,
        //   });

        //   const data = await response.json();
        //   if (response.ok) {
        //     console.log("audio file saved.");
        //   } else {
        //     console.error("Error:", data);
        //   }
        // } catch (error) {
        //   console.error("Upload failed:", error);
        // }
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // const [listening, setListening] = useState(false);
  // const [text, setText] = useState("");

  // const recognition = useRef(
  //   new window.webkitSpeechRecognition()
  // );

  // recognition.lang = window.navigator.language;
  // recognition.interimResults = true;

  // const toggleListening = () => {
  //   console.log("clicked");
  //   setListening(!listening);

  //   if (!listening) {
  //     recognition.current.start();
  //     recognition.current.onresult = (event) => {
  //       const lastResult = event.results[event.results.length - 1][0].transcript;
  //       setText(lastResult);
  //     };
  //   } else {
  //     recognition.current.stop();
  //     // now just sent the text message to the sendMessage function
  //   }
  // };

  const sendMessage = () => {
    const text = input.current.value;
    if (!loading && !message) {
      chat(text);
      input.current.value = "";
    }
  };

  if (hidden) {
    return null;
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-center items-end p-4 pointer-events-none">

        <div className="flex flex-col items-center justify-center">
          <button
            disabled={false}
            onClick={recording ? stopRecording : startRecording}
            className={`pointer-events-auto mt-[12px] w-16 h-16 flex items-center justify-center rounded-full transition-all duration-300 shadow-md hover:scale-[1.2] ${recording ? "bg-red-500 animate-pulse text-white" : "bg-gray-300 text-black"}`}
          >
            <FaMicrophone size={28} />
          </button>
        </div>

      </div>
    </>
  );
};
