import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import LoadingDots from './components/LoadingDots';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// --- Configuración de Chatwoot ---
// La URL de tu instancia de Chatwoot
const CHATWOOT_BASE_URL = 'https://aurora-chatwoot.zuw8ba.easypanel.host';
// El identificador alfanumérico de tu canal API (proporcionado por Chatwoot)
const INBOX_IDENTIFIER = 'r9m3gToEJG42pQKknM3oMjrd';
// Tu token de acceso (se pasa en un header 'api_access_token')
const API_ACCESS_TOKEN = 'W9HctG1oxrZ1Dhyi8VXscBpN';

const CHATWOOT_API_URL = `${CHATWOOT_BASE_URL}/public/api/v1/`;
// WebSocket seguro para ActionCable
const CHATWOOT_WEBSOCKET_URL = `wss://aurora-chatwoot.zuw8ba.easypanel.host/cable`;

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // Estados para la sesión de Chatwoot
  const [contactIdentifier, setContactIdentifier] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const ws = useRef(null);

  // Cliente Axios para la API de Chatwoot
  const api = axios.create({
    baseURL: CHATWOOT_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': API_ACCESS_TOKEN,
    },
  });

  // Scroll automático hacia abajo cuando llegan mensajes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleIncomingMessage = useCallback((json) => {
    try {
      if (
        json.type === 'ping' ||
        json.type === 'welcome' ||
        json.type === 'confirm_subscription'
      ) {
        return;
      }

      const payload = json.message;

      if (payload && payload.event === 'message.created') {
        const data = payload.data;

        // Solo procesamos mensajes de agentes (1) o bot (3)
        if (data.message_type === 1 || data.message_type === 3) {
          const content = data.content;
          const role = 'assistant';

          setMessages((prev) => {
            let newMessages = [...prev];

            // Si el último mensaje del assistant es un placeholder '', lo reemplazamos
            if (
              newMessages.length > 0 &&
              newMessages[newMessages.length - 1].role === 'assistant' &&
              newMessages[newMessages.length - 1].content === ''
            ) {
              newMessages[newMessages.length - 1].content = content;
            } else {
              newMessages = [...newMessages, { role, content }];
            }

            return newMessages;
          });

          setIsLoading(false);
        }
      }
    } catch (e) {
      console.error('Error al procesar mensaje WebSocket:', e);
    }
  }, []);

  const initializeChatwoot = useCallback(async () => {
    // Cerrar la conexión anterior si existe
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    let contactId = localStorage.getItem('chatwoot_contact_id');
    let pubToken = localStorage.getItem('chatwoot_pubsub_token');
    let convoId = localStorage.getItem('chatwoot_conversation_id');

    try {
      // --- 1. Obtener/Crear contacto ---
      if (!contactId || !pubToken) {
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts`);
        contactId = res.data.source_id;
        pubToken = res.data.pubsub_token;

        localStorage.setItem('chatwoot_contact_id', contactId);
        localStorage.setItem('chatwoot_pubsub_token', pubToken);
      }

      setContactIdentifier(contactId);

      // Si ya había una conversación guardada (de otra visita), solo la reasignamos
      if (convoId) {
        setConversationId(convoId);
      }

      // --- 2. Conexión WebSocket ---
      if (pubToken) {
        ws.current = new WebSocket(CHATWOOT_WEBSOCKET_URL);

        ws.current.onopen = () => {
          console.log('WebSocket conectado. Suscribiendo...');
          const identifier = JSON.stringify({
            channel: 'RoomChannel',
            pubsub_token: pubToken,
          });
          ws.current.send(
            JSON.stringify({
              command: 'subscribe',
              identifier,
            })
          );
        };

        ws.current.onmessage = (event) => {
          const json = JSON.parse(event.data);
          if (json.message) {
            handleIncomingMessage(json);
          }
        };

        ws.current.onerror = (error) => {
          console.error('WebSocket Error:', error);
        };

        ws.current.onclose = () => {
          console.log('WebSocket cerrado.');
        };
      }
    } catch (error) {
      console.error('Error al inicializar Chatwoot:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Lo siento, no pude conectar con el servidor de Chatwoot. Revisa la configuración.',
        },
      ]);
      setIsLoading(false);
    }
  }, [api, handleIncomingMessage]);

  useEffect(() => {
    initializeChatwoot();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [initializeChatwoot]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    if (!contactIdentifier) {
      console.error('No hay contactIdentifier aún, espera a que se inicialice Chatwoot');
      return;
    }

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    // Placeholder para la respuesta del bot
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Si no hay conversación, la creamos AHORA (primer mensaje del usuario)
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        const convoRes = await api.post(
          `inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations`
        );
        activeConversationId = convoRes.data.id;

        setConversationId(activeConversationId);
        localStorage.setItem('chatwoot_conversation_id', activeConversationId);
      }

      // Enviar mensaje a la conversación activa
      await api.post(
        `inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${activeConversationId}/messages`,
        {
          content: userMessage,
        }
      );

      // La respuesta llegará asincrónicamente por WebSocket

    } catch (error) {
      console.error('Error al enviar mensaje a Chatwoot:', error);
      // Reemplazar placeholder por mensaje de error
      setMessages((prev) => {
        const newMessages = [...prev];
        if (
          newMessages.length > 0 &&
          newMessages[newMessages.length - 1].role === 'assistant' &&
          newMessages[newMessages.length - 1].content === ''
        ) {
          newMessages[newMessages.length - 1].content =
            'Lo siento, hubo un error al enviar tu mensaje.';
        }
        return newMessages;
      });
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    // Limpiamos todo para iniciar un chat completamente nuevo
    localStorage.removeItem('chatwoot_contact_id');
    localStorage.removeItem('chatwoot_conversation_id');
    localStorage.removeItem('chatwoot_pubsub_token');

    setMessages([]);
    setContactIdentifier(null);
    setConversationId(null);
    setInput('');
    setIsLoading(false);

    // Re-inicializar: creará nuevo contacto + WebSocket,
    // pero la conversación solo se creará cuando el usuario escriba.
    initializeChatwoot();
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

        {/* Controles abajo */}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="bg-[#569D33] hover:bg-[#569D44] text-white rounded-lg p-2"
            title="Reiniciar chat"
            disabled={isLoading}
          >
            <ArrowPathIcon className="h-6 w-6" />
          </button>

          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <ChatInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading} // ya no depende de conversationId
              onSend={handleSubmit}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()} // ya no depende de conversationId
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
