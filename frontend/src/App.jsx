import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; 
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import LoadingDots from './components/LoadingDots';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// --- Configuración de Chatwoot ---
// La URL de tu instancia de Chatwoot
const CHATWOOT_BASE_URL = 'https://aurora-chatwoot.zuw8ba.easypanel.host';
// El identificador alfanumérico de tu canal API
const INBOX_IDENTIFIER = 'r9m3gToEJG42pQKknM3oMjrd'; 
// Tu token de acceso
const API_ACCESS_TOKEN = 'W9HctG1oxrZ1Dhyi8VXscBpN'; 

const CHATWOOT_API_URL = `${CHATWOOT_BASE_URL}/public/api/v1/`;
// Usamos wss:// para conexiones seguras (HTTPS) con WebSockets
const CHATWOOT_WEBSOCKET_URL = `wss://aurora-chatwoot.zuw8ba.easypanel.host/cable`; 
// -----------------------------------------------------------

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef(null);
  
  // Estados para la sesión de Chatwoot
  const [contactIdentifier, setContactIdentifier] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const ws = useRef(null); 
  
  // ESTADOS PARA EL STREAMING VISUAL
  const typingEffectTimeout = useRef(null); 
  const [typingBuffer, setTypingBuffer] = useState(null); // Almacena el mensaje completo del bot (el texto a escribir)

  useEffect(() => {
    // Scroll al final al recibir mensajes
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Manejo del efecto de escritura usando el buffer
  useEffect(() => {
      // SOLO proceder si hay texto en el buffer.
      if (!typingBuffer) return; 

      let index = 0;
      
      // Limpiar cualquier timeout anterior (es esencial para evitar fugas de memoria y mensajes duplicados)
      if (typingEffectTimeout.current) {
          clearTimeout(typingEffectTimeout.current);
      }
      
      // Función recursiva para mostrar el texto carácter por carácter
      const typeMessage = () => {
          if (index < typingBuffer.length) {
              const contentChunk = typingBuffer.substring(0, index + 1);
              
              setMessages(prev => {
                  let newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  
                  // Reemplazar la última porción del mensaje del asistente (el placeholder creado en handleSubmit)
                  if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                      newMessages[lastIndex].content = contentChunk;
                  }
                  return newMessages;
              });
              
              index++;
              // 30ms por carácter para una velocidad de escritura promedio
              typingEffectTimeout.current = setTimeout(typeMessage, 30); 
          } else {
              // La animación ha terminado:
              // 1. Apagar el estado de carga
              setIsLoading(false);
              // 2. Limpiar el buffer para permitir el próximo mensaje y liberar el useEffect
              setTypingBuffer(null); 
          }
      };

      // Iniciar el efecto (se dispara cada vez que typingBuffer recibe un nuevo string)
      typeMessage();
      
      return () => {
          // Cleanup: Asegurar que el timeout se detenga si se desmonta o el buffer cambia
          if (typingEffectTimeout.current) {
              clearTimeout(typingEffectTimeout.current);
          }
      };
  }, [typingBuffer]);


  // Cliente Axios configurado con el token
  const api = axios.create({
    baseURL: CHATWOOT_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': API_ACCESS_TOKEN, 
    },
  });

  // LÓGICA DE RECEPCIÓN: Solo guarda el mensaje completo en el buffer
  const handleIncomingMessage = useCallback((json) => {
    try {
      if (json.type === 'ping' || json.type === 'welcome' || json.type === 'confirm_subscription') {
        return;
      }
      
      const payload = json.message;

      if (payload && payload.event === 'message.created') {
        const data = payload.data;
        // Procesamos mensajes de agentes (1) o bot (3)
        if (data.message_type === 1 || data.message_type === 3) {
          
          const fullContent = data.content;
          
          // Establecer el mensaje completo en el buffer para iniciar el efecto de escritura
          setTypingBuffer(fullContent);
          // setIsLoading se apaga DENTRO del useEffect del typing.
        }
      }
    } catch (e) {
      console.error('Error al procesar mensaje WebSocket:', e);
      setIsLoading(false); 
      setTypingBuffer(null);
    }
  }, []);

  // Función de creación de conversación, se ejecuta solo en el primer mensaje
  const createConversationIfNew = async (contactId) => {
    let convoId = localStorage.getItem('chatwoot_conversation_id');

    if (!convoId || conversationId === null) { 
      // Crear una nueva conversación
      try {
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactId}/conversations`);
        convoId = res.data.id;
        localStorage.setItem('chatwoot_conversation_id', convoId);
        setConversationId(convoId);
        return convoId;
      } catch (error) {
        console.error('Error al crear conversación:', error);
        throw new Error('No se pudo crear la conversación en Chatwoot.');
      }
    }
    return convoId; 
  };


  const initializeChatwoot = useCallback(async () => {
    // Cerrar la conexión anterior si existe
    if (ws.current) {
        ws.current.close();
        ws.current = null;
    }

    let contactId = localStorage.getItem('chatwoot_contact_id');
    let pubToken = localStorage.getItem('chatwoot_pubsub_token');
    
    try {
      // --- 1. Obtener/Crear Contacto ---
      if (!contactId || !pubToken) {
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts`);
        contactId = res.data.source_id;
        pubToken = res.data.pubsub_token;
        localStorage.setItem('chatwoot_contact_id', contactId);
        localStorage.setItem('chatwoot_pubsub_token', pubToken);
      } 
      
      setContactIdentifier(contactId);
      
      // Se reinicia la conversación a null para forzar la creación al primer mensaje
      setConversationId(null);
      localStorage.removeItem('chatwoot_conversation_id');


      // --- 2. Conexión WebSocket (siempre después de tener contacto) ---
      if (pubToken) {
        ws.current = new WebSocket(CHATWOOT_WEBSOCKET_URL);

        ws.current.onopen = () => {
          console.log('WebSocket conectado. Suscribiendo...');
          const identifier = JSON.stringify({
            channel: 'RoomChannel',
            pubsub_token: pubToken,
          });
          ws.current.send(JSON.stringify({ command: 'subscribe', identifier }));
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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, no pude conectar con el servidor de Chatwoot. Revisa la configuración.' }]);
      setIsLoading(false);
    }
  }, [api, handleIncomingMessage]);


  useEffect(() => {
    // Inicialización del contacto y websocket
    const hasInitialized = localStorage.getItem('chatwoot_initialized');
    if (!hasInitialized) {
        initializeChatwoot();
        localStorage.setItem('chatwoot_initialized', 'true'); 
    }
    
    // Función de limpieza
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      // Asegurar que el efecto de escritura se detenga al desmontar
      if (typingEffectTimeout.current) {
          clearTimeout(typingEffectTimeout.current);
      }
    };
  }, [initializeChatwoot]); 

  
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const userMessage = input.trim();
    if (!userMessage || isLoading || !contactIdentifier) return; 

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    // Añadimos el placeholder de mensaje del asistente.
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
        // --- 1. Creación de Conversación (bajo demanda) ---
        let currentConversationId = conversationId;
        
        if (!currentConversationId) {
            currentConversationId = await createConversationIfNew(contactIdentifier);
        }

        if (!currentConversationId) {
            throw new Error('No se pudo establecer la conversación.');
        }

      // --- 2. Enviar Mensaje a Chatwoot API ---
      await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${currentConversationId}/messages`, {
        content: userMessage,
      });

      // El mensaje del bot llegará por WebSocket y disparará startTypingEffect

    } catch (error) {
      console.error('Error en handleSubmit:', error);
      // En caso de error, reemplazar el placeholder vacío con un mensaje de error
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].content === '') {
            newMessages[newMessages.length - 1].content = 'Lo siento, hubo un error al enviar tu mensaje.';
        }
        return newMessages;
      });
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    // Limpiamos los datos de la sesión almacenados en localStorage
    localStorage.removeItem('chatwoot_contact_id');
    localStorage.removeItem('chatwoot_conversation_id');
    localStorage.removeItem('chatwoot_pubsub_token');
    localStorage.removeItem('chatwoot_initialized');

    setMessages([]);
    setContactIdentifier(null);
    setConversationId(null);
    setInput('');
    setIsLoading(false);
    
    // Reiniciar la inicialización del chat (cerrará el viejo WS y abrirá uno nuevo)
    initializeChatwoot();
  };

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
            disabled={isLoading}
          >
            <ArrowPathIcon className="h-6 w-6" />
          </button>

          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <ChatInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || !contactIdentifier} 
              onSend={handleSubmit}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !contactIdentifier}
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
