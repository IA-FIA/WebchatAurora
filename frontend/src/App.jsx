import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios'; 
import ChatMessage from './components/ChatMessage.jsx';
import ChatInput from './components/ChatInput.jsx';
import LoadingDots from './components/LoadingDots.jsx';
import { PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

// --- Configuración de Chatwoot ---
// La URL de tu instancia de Chatwoot
const CHATWOOT_BASE_BASE_URL = 'https://aurora-chatwoot.zuw8ba.easypanel.host';
// El identificador alfanumérico de tu canal API (proporcionado por ti)
const INBOX_IDENTIFIER = 'r9m3gToEJG42pQKknM3oMjrd'; 
// Tu token de acceso (se pasa en un header 'api_access_token')
const API_ACCESS_TOKEN = 'W9HctG1oxrZ1Dhyi8VXscBpN'; 

const CHATWOOT_API_URL = `${CHATWOOT_BASE_BASE_URL}/public/api/v1/`;
// Usamos wss:// para conexiones seguras (HTTPS) con WebSockets (/cable es el path por defecto de ActionCable)
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
  const typingEffectTimeout = useRef(null); // Nuevo ref para gestionar el tiempo de escritura

  useEffect(() => {
    // Scroll al final al recibir mensajes
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Cliente Axios configurado con el token
  const api = axios.create({
    baseURL: CHATWOOT_API_URL,
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': API_ACCESS_TOKEN, 
    },
  });

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
          
          // Limpiar cualquier timeout anterior
          if (typingEffectTimeout.current) {
              clearTimeout(typingEffectTimeout.current);
          }

          // Función para simular el typing effect (streaming)
          const typeMessage = (index) => {
            if (index < fullContent.length) {
              setMessages(prev => {
                let newMessages = [...prev];
                const contentChunk = fullContent.substring(0, index + 1);

                // Reemplazamos el placeholder o la porción anterior
                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                  newMessages[newMessages.length - 1].content = contentChunk;
                } else {
                  newMessages = [...newMessages, { role: 'assistant', content: contentChunk }];
                }
                return newMessages;
              });
              
              // Programar el siguiente carácter (ajusta el tiempo: 20ms es rápido)
              typingEffectTimeout.current = setTimeout(() => typeMessage(index + 1), 20);
            } else {
              // Cuando termina, detenemos el loading
              setIsLoading(false);
            }
          };

          // Inicializar o reemplazar el mensaje placeholder y comenzar la escritura
          setMessages(prev => {
            let newMessages = [...prev];
            // Si el último mensaje es el placeholder de carga, lo reemplazamos por el inicio del texto
            if (newMessages.length > 0 && newMessages[newMessages.length - 1].content === '') {
                // No hacemos nada, el typeMessage lo manejará desde el índice 0
            } else {
                // Si no hay placeholder, añadimos el inicio del mensaje
                newMessages.push({ role: 'assistant', content: '' });
            }
            return newMessages;
          });
          
          // Comenzar el efecto de escritura desde el índice 0
          typeMessage(0); 
        }
      }
    } catch (e) {
      console.error('Error al procesar mensaje WebSocket:', e);
    }
  }, []);

  // Función de creación de conversación, se ejecuta solo en el primer mensaje
  const createConversationIfNew = async (contactId) => {
    let convoId = localStorage.getItem('chatwoot_conversation_id');

    // Si el estado local (conversationId) es null, creamos una nueva.
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
    
    // Al iniciar, solo nos aseguramos de tener un contacto y la conexión WS.

    try {
      // --- 1. Obtener/Crear Contacto ---
      if (!contactId || !pubToken) {
        // Si no hay contacto, creamos uno nuevo.
        const res = await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts`);
        contactId = res.data.source_id;
        pubToken = res.data.pubsub_token;
        localStorage.setItem('chatwoot_contact_id', contactId);
        localStorage.setItem('chatwoot_pubsub_token', pubToken);
      } 
      
      setContactIdentifier(contactId);
      
      // Aseguramos que la conversación siempre empiece como NULL en el estado
      // Esto fuerza la creación de una nueva conversación al primer mensaje del usuario.
      setConversationId(null);
      localStorage.removeItem('chatwoot_conversation_id');


      // --- 2. Conexión WebSocket (siempre después de tener contacto) ---
      if (pubToken) {
        ws.current = new WebSocket(CHATWOOT_WEBSOCKET_URL);

        ws.current.onopen = () => {
          console.log('WebSocket conectado. Suscribiendo...');
          // Suscribirse al canal ActionCable con el token pubsub del contacto
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
    // Modificamos este useEffect para que solo se ejecute una vez
    const hasInitialized = localStorage.getItem('chatwoot_initialized');
    if (!hasInitialized) {
        initializeChatwoot();
        // Marcamos la inicialización para mantener el contacto, pero forzar nueva conversación
        localStorage.setItem('chatwoot_initialized', 'true'); 
    }
    
    // Función de limpieza para cerrar el WebSocket al desmontar el componente
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      // Limpiar también el timeout de escritura si existe
      if (typingEffectTimeout.current) {
          clearTimeout(typingEffectTimeout.current);
      }
    };
  }, [initializeChatwoot]); 

  
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    const userMessage = input.trim();
    // Requiere contactIdentifier ya que es lo mínimo para operar
    if (!userMessage || isLoading || !contactIdentifier) return; 

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    // Añadimos un placeholder para el mensaje del asistente
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
        // --- 1. Crear Conversación si es la primera vez (LAZY CREATION) ---
        let currentConversationId = conversationId;
        
        // El estado conversationId es null al cargar la página (creación bajo demanda)
        if (!currentConversationId) {
            currentConversationId = await createConversationIfNew(contactIdentifier);
        }

        // Si la conversación sigue siendo nula después de intentar crearla, salimos.
        if (!currentConversationId) {
            throw new Error('No se pudo establecer la conversación.');
        }

      // --- 2. Enviar Mensaje a Chatwoot API ---
      await api.post(`inboxes/${INBOX_IDENTIFIER}/contacts/${contactIdentifier}/conversations/${currentConversationId}/messages`, {
        content: userMessage,
      });

      // La respuesta del asistente llegará de forma asíncrona por el WebSocket

    } catch (error) {
      console.error('Error en handleSubmit:', error);
      // Reemplazamos el placeholder del asistente con un mensaje de error
      setMessages(prev => {
        const newMessages = [...prev];
        // Aseguramos que el último mensaje sea el de error si estaba vacío
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].content === '') {
            newMessages[newMessages.length - 1].content = 'Lo siento, hubo un error al enviar tu mensaje.';
        }
        return newMessages;
      });
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    // **CAMBIO CLAVE AQUÍ: También eliminamos la bandera de inicialización para que initializeChatwoot se ejecute al recargar**
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
