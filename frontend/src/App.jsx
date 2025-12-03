import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; 
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import LoadingDots from './components/LoadingDots';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// ⚠️ CONFIGURACIÓN PROPORCIONADA POR EL USUARIO (INCLUYE TOKEN INSEGURO)
const CHATWOOT_CONFIG = {
  BASE_URL: 'https://aurora-chatwoot.zuw8ba.easypanel.host', // Tu URL base de Chatwoot
  ACCOUNT_ID: '1', // ID de tu cuenta Chatwoot
  INBOX_ID: '7',     // ID de tu bandeja de entrada de Sitio Web
  AGENT_TOKEN: 'URX43bmU3AYCZp4ectkQvHvC', // Tu Token de Agente API
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
  const [lastMessageId, setLastMessageId] = useState(0); // Para el Polling
  const pollingRef = useRef(null);

  // Headers de la API (Usando el token explícitamente, inseguro)
  const headers = {
    'Content-Type': 'application/json',
    'api_access_token': CHATWOOT_CONFIG.AGENT_TOKEN,
  };

  // Efecto para hacer scroll al final del chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Lógica de inicio de sesión: Crear Contacto y Conversación
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
    let currentContactId = null;

    try {
      // 2. Crear o Identificar Contacto
      try {
        // Intenta crear el contacto. Si falla, pasamos al catch para buscarlo.
        const createContactResponse = await axios.post(
          `${CHATWOOT_CONFIG.BASE_URL}/api/v1/accounts/${CHATWOOT_CONFIG.ACCOUNT_ID}/contacts`,
          {
            inbox_id: CHATWOOT_CONFIG.INBOX_ID,
            identifier: identifier, 
            name: `Webchat User ${newSessionId.substring(0, 4)}`,
          },
          { headers }
        );
        currentContactId = createContactResponse.data.id;
      } catch (error) {
        // Si la creación falla (ej: identificador ya existe), lo buscamos
        const searchResponse = await axios.get(
          `${CHATWOOT_CONFIG.BASE_URL}/api/v1/accounts/${CHATWOOT_CONFIG.ACCOUNT_ID}/contacts/search`,
          {
            headers,
            params: { identifier: identifier }
          }
        );
        currentContactId = searchResponse.data.payload[0]?.id; 
      }
      
      if (!currentContactId) throw new Error('No se pudo obtener el ID de contacto.');
      setContactId(currentContactId);

      // 3. Crear Conversación
      const convResponse = await axios.post(
        `${CHATWOOT_CONFIG.BASE_URL}/api/v1/accounts/${CHATWOOT_CONFIG.ACCOUNT_ID}/conversations`,
        {
          inbox_id: CHATWOOT_CONFIG.INBOX_ID,
          contact_id: currentContactId,
          status: 'pending' 
        },
        { headers }
      );

      setConversationId(convResponse.data.id);
      
    } catch (error) {
      console.error('Error setting up Chatwoot session:', error);
      // Mensaje visible al usuario en caso de error crítico de conexión
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error de conexión: No se pudo iniciar la sesión en Chatwoot. Revisa la configuración de API.'
      }]);
    }
  };

  // Efecto para iniciar la sesión de Chatwoot al montar
  useEffect(() => {
    setupChatwootSession();
  }, []); 

  // Lógica de Polling para recibir mensajes de Aurora
  useEffect(() => {
    if (conversationId) {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const response = await axios.get(
            `${CHATWOOT_CONFIG.BASE_URL}/api/v1/accounts/${CHATWOOT_CONFIG.ACCOUNT_ID}/conversations/${conversationId}/messages`,
            { headers }
          );

          const fetchedMessages = response.data.payload.reverse(); 

          const newMessages = fetchedMessages.filter(msg => 
            msg.id > lastMessageId && 
            msg.message_type === 'outgoing' // Respuesta de Aurora/Agente
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
            setIsLoading(false);
          }
        } catch (error) {
          // Manejar errores de polling silenciosamente, pero registrar
          // console.error('Error during polling:', error); 
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
    if (isLoading || !input.trim() || !conversationId) return;

    const userMessage = input.trim();
    setInput('');

    // Añadir mensaje del usuario a la UI
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // 4. Enviar el mensaje como 'incoming' a Chatwoot (dispara el n8n webhook)
      await axios.post(
        `${CHATWOOT_CONFIG.BASE_URL}/api/v1/accounts/${CHATWOOT_CONFIG.ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: userMessage,
          message_type: 'incoming', 
          private: false
        },
        { headers }
      );
      
    } catch (error) {
      console.error('Error sending message to Chatwoot:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, hubo un error al enviar tu mensaje a Chatwoot.'
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
