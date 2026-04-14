import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import LoadingDots from './components/LoadingDots';

const CHATWOOT_BASE_URL = 'https://aurora-chatwoot.zuw8ba.easypanel.host';
const INBOX_IDENTIFIER = 'r9m3gToEJG42pQKknM3oMjrd';
const API_ACCESS_TOKEN = 'W9HctG1oxrZ1Dhyi8VXscBpN';
const CHATWOOT_API_URL = `${CHATWOOT_BASE_URL}/public/api/v1/`;
const CHATWOOT_WEBSOCKET_URL = `wss://aurora-chatwoot.zuw8ba.easypanel.host/cable`;

const DEFAULT_WELCOME_MESSAGE = {
  role: 'assistant',
  content: '¡Hola! Soy el Asistente Virtual de la Fundación para la Innovación Agraria. Estoy para ayudarte con consultas sobre nuestra información institucional y acceder a nuestras fuentes de información de innovación en el sector silvoagropecuario. ¿En qué puedo ayudarte?'
};

function App() {
  const [messages, setMessages] = useState([DEFAULT_WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef(null);
  const [contactIdentifier, setContactIdentifier] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const ws = useRef(null);

  const api = axios.create({
    baseURL: CHATWOOT_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': API_ACCESS_TOKEN,
    },
  });

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleIncomingMessage = useCallback((json) => {
    try {
      if (['ping', 'welcome', 'confirm_subscription'].includes(json.type)) return;
      const payload = json.message;
      if (payload && payload.event === 'message.created') {
        const data = payload.data;
        if (data.message_type === 1 || data.message_type === 3) {
          // Agregamos el mensaje nuevo directamente
          setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
          setIsLoading(false);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  const initializeChatwoot = useCallback(async () => {
    let contactId = localStorage.getItem('chatwoot_contact_id');
    let pubToken = localStorage.getItem('chatwoot_pubsub_token');
    let convoId = localStorage.getItem('chatwoot_conversation_id');

    try {
      if (!contactId || !pubToken) {
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts`);
        contactId = res.data.source_id;
        pubToken = res.data.pubsub_token;
        localStorage.setItem('chatwoot_contact_id', contactId);
        localStorage.setItem('chatwoot_pubsub_token', pubToken);
      }
      setContactIdentifier(contactId);
      if (convoId) setConversationId(convoId);

      if (pubToken) {
        ws.current = new WebSocket(CHATWOOT_WEBSOCKET_URL);
        ws.current.onopen = () => {
          const identifier = JSON.stringify({ channel: 'RoomChannel', pubsub_token: pubToken });
          ws.current.send(JSON.stringify({ command: 'subscribe', identifier }));
        };
        ws.current.onmessage = (e) => handleIncomingMessage(JSON.parse(e.data));
      }
    } catch (e) { console.error(e); }
  }, [api, handleIncomingMessage]);

  useEffect(() => {
    initializeChatwoot();
    return () => ws.current?.close();
  }, [initializeChatwoot]);

  const handleSubmit = async () => {
  if (!input.trim() || !contactIdentifier || isLoading) return;
  const msg = input.trim();
  setInput('');
  
  // 1. Solo agregamos el mensaje del usuario
  setMessages(prev => [...prev, { role: 'user', content: msg }]);
  setIsLoading(true);

  try {
    let cId = conversationId;
    if (!cId) {
      const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations`);
      cId = res.data.id;
      setConversationId(cId);
      localStorage.setItem('chatwoot_conversation_id', cId);
    }
    await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${cId}/messages`, { content: msg });
  } catch (e) { 
    setIsLoading(false); 
    console.error("Error al enviar:", e);
  }
};

  const handleSendAudio = async (file) => {
    if (!contactIdentifier) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: "🎤 Mensaje de voz enviado" }, { role: 'assistant', content: '' }]);

    try {
      let cId = conversationId;
      if (!cId) {
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations`);
        cId = res.data.id;
        setConversationId(cId);
      }
      const formData = new FormData();
      formData.append('attachments[]', file);
      formData.append('content', 'Mensaje de voz');
      await axios.post(`${CHATWOOT_API_URL}inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${cId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'api_access_token': API_ACCESS_TOKEN }
      });
    } catch (e) { setIsLoading(false); }
  };

  const handleReset = () => {
    localStorage.clear();
    setMessages([DEFAULT_WELCOME_MESSAGE]);
    setContactIdentifier(null);
    setConversationId(null);
    initializeChatwoot();
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#F8F9FA] font-sans">
      <div className="max-w-5xl w-full mx-auto p-4 flex flex-col h-full relative">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto rounded-2xl bg-white p-6 md:p-10 custom-scrollbar mb-4 shadow-2xl ring-1 ring-gray-200 relative">
          <div className="mt-4">
            {messages.map((m, i) => (
              m.content !== '' && (
                <ChatMessage key={i} message={m} animate={i === messages.length - 1 && m.role === 'assistant'} />
              )
            ))}
          </div>
          {isLoading && (
            <div className="flex items-center gap-4 mb-8 ml-2 animate-fade-in-up">
              {/* Mini logo opcional al lado de los puntos para mantener el contexto */}
              <div className="w-6 h-6 rounded-lg overflow-hidden opacity-50 grayscale">
                <img src="/f-ia.png" alt="pensando" className="w-full h-full object-cover" />
              </div>
              <LoadingDots />
            </div>
          )}
          <div className="h-28"></div>
        </div>
        <div className="absolute bottom-8 left-8 right-8 z-30">
          <ChatInput value={input} onChange={(e)=>setInput(e.target.value)} disabled={isLoading} onSend={handleSubmit} onReset={handleReset} onSendAudio={handleSendAudio} />
          <p className="text-[10px] text-center mt-3 font-medium"></p>
        </div>
      </div>
    </div>
  );
}

export default App;