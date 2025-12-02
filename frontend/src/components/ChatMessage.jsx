import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/solid";

function ChatMessage({ message }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  if (message.role === "user") {
    // Mensaje del usuario: burbuja verde a la derecha
    return (
      <div className="flex justify-end mb-4 items-start">
        <div className="relative rounded-lg px-4 py-2 max-w-[80%] bg-[#569D44] text-white">
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    className="text-blue-200 hover:text-blue-100 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ),
                strong: ({ node, ...props }) => (
                  <strong {...props} className="font-bold" />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Mensaje del asistente: bloque centrado, texto negro, sin burbuja
  return (
    <div className="flex justify-center mb-4 items-start w-full">
      <div className="w-full max-w-4xl mx-auto relative pr-12"> {/* pr-12 agrega espacio a la derecha */}
        <div className="prose max-w-none text-black">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node, ...props }) => (
                <a
                  {...props}
                  className="text-[#94bb1e] hover:text-[#569D33] underline"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
              strong: ({ node, ...props }) => (
                <strong {...props} className="font-bold" />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {/* Botón de copiar*/}
        <button
          onClick={copyToClipboard}
          className="absolute top-2 -right-2 p-0 bg-transparent border-none shadow-none hover:bg-transparent focus:bg-transparent"
          title="Copiar respuesta"
        >
          {copied ? (
            <ClipboardDocumentCheckIcon className="h-5 w-5 text-[#569D33]" />
          ) : (
            <ClipboardDocumentIcon className="h-5 w-5 text-[#569D33]" />
          )}
        </button>
      </div>
    </div>
  );
}

export default ChatMessage;