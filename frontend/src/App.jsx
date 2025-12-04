import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import LoadingDots from './components/LoadingDots';
import { PaperAirplaneIcon, ArrowPathIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/solid';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    setSessionId(uuidv4());
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pregunta: userMessage,
          session_id: sessionId,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      let assistantMessage = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        assistantMessage += chunk;

        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = assistantMessage;
          return newMessages;
        });
      }
    } catch (error) {
    console.error('Error:', error);
    setMessages(prev => [...prev, {
    role: 'assistant',
    content: 'Lo siento, hubo un error al procesar tu mensaje.'
    }]);
    } finally {
    setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setSessionId(uuidv4());
  };

/*  const openFormInNewTab = () => {
    window.open('https://forms.gle/99aNGsLUgehEnAAk7', '_blank' ); // '_blank' asegura que se abra en una nueva pestaña [2, 4, 5]
  };
*/
  return (
    <div className="w-screen h-screen flex flex-col bg-white">
      <div className="max-w-6xl w-full mx-auto p-4 flex flex-col h-full">

        {/* Área de chat que ocupa el espacio disponible */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto rounded-lg bg-white p-4 custom-scrollbar mb-4 shadow-2xl ring-1 ring-gray-300/70 ring-offset-2 ring-offset-white"
        >
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#569D33] text-white rounded-lg px-4 py-2 max-w-[80%]">
                <LoadingDots />
              </div>
            </div>
          )}
        </div>

        {/* Controles pegados abajo */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="bg-[#569D33] hover:bg-[#569D44] text-white rounded-lg p-2"
            title="Reiniciar chat"
          >
            <ArrowPathIcon className="h-6 w-6" />
          </button>

          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <ChatInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              onSend={handleSubmit}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-[#569D33] hover:bg-[#569D44] text-white rounded-lg p-2 disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-6 w-6" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default App;
