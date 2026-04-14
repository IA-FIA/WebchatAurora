import { useState, useRef } from 'react';
import { ArrowPathIcon, MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

function ChatInput({ value, onChange, disabled, onSend, onReset, onSendAudio }) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const file = new File([audioBlob], "voice_message.webm", { type: 'audio/webm' });
        onSendAudio(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error al acceder al micro:", err);
      alert("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-white shadow-[0_12px_32px_-4px_rgba(25,28,29,0.1)] rounded-full p-2 pr-2.5 flex items-center gap-2 border border-gray-200 focus-within:border-[#569D33]/50 transition-all">
      
      {/* Botón Reiniciar */}
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="p-3 text-[#569D33] hover:text-white bg-green-50 hover:bg-[#569D33] rounded-full transition-colors disabled:opacity-50 ml-1 shrink-0"
        title="Reiniciar sesión"
      >
        <ArrowPathIcon className="h-5 w-5" />
      </button>

      <div className="h-6 w-[1px] bg-gray-200 mx-1 shrink-0"></div>

      {/* Input de texto */}
      <textarea
        value={value}
        onChange={onChange}
        disabled={disabled || isRecording}
        placeholder={isRecording ? "Grabando audio..." : "Escribe aquí..."}
        className="flex-1 bg-transparent border-none focus:ring-0 text-gray-700 placeholder-gray-400 text-sm py-3 px-2 resize-none custom-scrollbar focus:outline-none"
        style={{ minHeight: '44px', height: '44px' }}
        onInput={(e) => {
          e.target.style.height = '44px';
          e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (onSend) onSend();
          }
        }}
      />

      <div className="flex items-center gap-2 shrink-0 ml-2">
        <button 
          type="button" 
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-3 rounded-full transition-all shrink-0 ${
            isRecording 
            ? 'bg-red-500 text-white animate-pulse' 
            : 'text-[#569D33] bg-green-50 hover:bg-[#569D33] hover:text-white'
          }`}
        >
          {isRecording ? <StopIcon className="w-6 h-6" /> : <MicrophoneIcon className="w-6 h-6" />}
        </button>
        
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim() || isRecording}
          className="w-12 h-12 bg-[#569D33] hover:bg-[#569D44] text-white rounded-full flex items-center justify-center shadow-md shrink-0 transition-transform active:scale-95"
        >
          <PaperAirplaneIcon 
            className="w-7 h-7" 
            style={{ 
              width: '28px', 
              height: '28px',
              minWidth: '28px',
              minHeight: '28px'
            }} 
          />
        </button>
      </div>
    </div>
  );
}

export default ChatInput;