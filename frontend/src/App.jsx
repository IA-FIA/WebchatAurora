import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; 
import ChatMessage from './components/ChatMessage'; // Componente ya existente
import ChatInput from './components/ChatInput';     // Componente ya existente
import LoadingDots from './components/LoadingDots'; // Componente ya existente
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// Configuración de la API (Solo IDs) y URLs de los Proxies de n8n
const CHATWOOT_CONFIG = {
  // IDs de Chatwoot (constantes)
  ACCOUNT_ID: '1', 
  INBOX_ID: '7',     
  
  // URLs de los Webhooks de n8n (reemplazar con las URLs de producción de tus workflows)
  N8N_BASE_URL: 'https://aurora-n8n.zuw8ba.easypanel.host/webhook',
  N8N_INIT_SESSION_URL: 'https://aurora-n8n.zuw8ba.easypanel.host/webhook/webchat/init-session', // Workflow A
  N8N_SEND_MESSAGE_URL: 'https://aurora-n8n.zuw8ba.easypanel.host/webhook/webchat/send-message', // Workflow B
  N8N_FETCH_MESSAGES_URL: 'https://aurora-n8n.zuw8ba.easypanel.host/webhook/webchat/fetch-messages', // Workflow C
};

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // Estados clave para la integración con Chatwoot
  const [sessionId, setSessionId] = useState('');
  const [contactId, setContactId] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [lastMessageId, setLastMessageId] = useState(0); 
  const pollingRef = useRef(null);

  // Efecto para hacer scroll al final del chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);


  // Lógica de inicio de sesión: Llama al Proxy de n8n para crear Contacto y Conversación de forma segura
  const setupChatwootSession = async () => {
    if (conversationId) return;

    // 1. Persistencia de la sesión y ID
    const savedSessionId = sessionStorage.getItem('cw_session_id');
    const newSessionId = savedSessionId || uuidv4();
    if (!savedSessionId) {
      sessionStorage.setItem('cw_session_id', newSessionId);
    }
    setSessionId(newSessionId);

    const identifier = `webchat-${newSessionId}`;
    
    try {
      // 2. Llama al Proxy de n8n (/init-session) que maneja las llamadas seguras a Chatwoot API
      const initResponse = await axios.post(CHATWOOT_CONFIG.N8N_INIT_SESSION_URL, {
          identifier: identifier,
          inbox_id: CHATWOOT_CONFIG.INBOX_ID,
          name: `Webchat User ${newSessionId.substring(0, 4)}`,
          account_id: CHATWOOT_CONFIG.ACCOUNT_ID
      });

      // 3. n8n devuelve los IDs de la conversación y el contacto
      setContactId(initResponse.data.contact_id);
      setConversationId(initResponse.data.conversation_id);
      
    } catch (error) {
      console.error('Error setting up Chatwoot session via n8n proxy:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error de conexión: No se pudo iniciar la sesión. Verifica los workflows de n8n y la configuración de CORS.'
      }]);
    }
  };

  // Efecto para iniciar la sesión de Chatwoot al montar
  useEffect(() => {
    setupChatwootSession();
  }, []); 


  // Lógica de Polling: Llama al Proxy de n8n para obtener mensajes
  useEffect(() => {
    if (conversationId) {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          // Llama al Proxy de n8n (/fetch-messages)
          const response = await axios.get(CHATWOOT_CONFIG.N8N_FETCH_MESSAGES_URL, {
            params: {
              conversation_id: conversationId,
              account_id: CHATWOOT_CONFIG.ACCOUNT_ID,
            }
          });

          // El proxy devuelve la lista de mensajes de Chatwoot
          const fetchedMessages = response.data.payload.reverse(); 

          // Buscar nuevos mensajes 'outgoing' (respuesta de Aurora)
          const newMessages = fetchedMessages.filter(msg => 
            msg.id > lastMessageId && 
            msg.message_type === 'outgoing' 
          );

          if (newMessages.length > 0) {
            setMessages(prev => [
              ...prev,
              ...newMessages.map(msg => ({
                role: 'assistant', 
                content: msg.content
              }))
            ]);
            
            setLastMessageId(newMessages[newMessages.length - 1].id);
            setIsLoading(false); // Detiene el indicador de carga
          }
        } catch (error) {
          // console.error('Error during polling:', error); // Manejar silenciosamente
        }
      }, 2000); 

    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [conversationId, lastMessageId]);


  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    // Deshabilita el envío si está cargando, si el input está vacío o si no hay conversationId
    if (isLoading || !input.trim() || !conversationId) return;

    const userMessage = input.trim();
    setInput('');

    // Añadir mensaje del usuario a la UI
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // 4. Llama al Proxy de n8n (/send-message) que envía el mensaje 'incoming' a Chatwoot
      await axios.post(CHATWOOT_CONFIG.N8N_SEND_MESSAGE_URL, {
        content: userMessage,
        conversation_id: conversationId,
        account_id: CHATWOOT_CONFIG.ACCOUNT_ID,
      });
      
      // La respuesta del agente Aurora se recibirá por el polling
    } catch (error) {
      console.error('Error sending message via n8n proxy:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu mensaje.'
      }]);
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    // Limpia estados y fuerza una nueva sesión
    setMessages([]);
    setContactId(null);
    setConversationId(null);
    setLastMessageId(0);
    sessionStorage.removeItem('cw_session_id');
    // La re-ejecución del useEffect iniciará una nueva sesión
    setupChatwootSession();
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-white">
      <div className="max-w-6xl w-full mx-auto p-4 flex flex-col h-full">

        {/* Área de chat */}
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

        {/* Controles */}
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
              disabled={isLoading || !conversationId}
              onSend={handleSubmit}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !conversationId}
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
