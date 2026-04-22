import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ChatMessage({ message, animate }) {
  if (message.role === "user") {
  return (
    <div className="flex justify-end group mb-8">
      {/* Añadimos text-white aquí para forzar el color blanco */}
      <div className="max-w-[80%] bg-[#569D44] text-white px-6 py-4 rounded-2xl rounded-br-sm shadow-md">
        {/* Eliminamos prose-invert si quieres control total, o añadimos text-white al div interno */}
        <div className="prose max-w-none text-sm font-medium leading-relaxed text-white">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

  return (
    <section className={`group mb-10 ${animate ? 'animate-fade-in-up opacity-0' : ''}`}>
      <div className="flex gap-4 md:gap-6">
        
        {/* Foto de perfil F-IA */}
        {/* Foto de perfil F-IA */}
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm mt-1 border border-gray-100 p-1">
            <img src="/f-ia.png" alt="F-IA Logo" className="w-full h-full object-contain" />
          </div>
        <div className="flex-1">
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-[0_12px_32px_-4px_rgba(25,28,29,0.06)] border border-gray-100/50">
            <div className="prose max-w-none text-gray-700 text-sm leading-relaxed marker:text-[#569D33]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => <a {...props} className="text-[#569D33] hover:text-[#94bb1e] underline font-medium" target="_blank" rel="noopener noreferrer" />,
                  strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-gray-900" />,
                  h3: ({ node, ...props }) => <h3 {...props} className="text-xl font-bold tracking-tight mb-4 flex items-center gap-2 text-gray-800" />,
                  blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-[#569D33] bg-gray-50 pl-4 py-3 italic text-gray-600 rounded-r-lg my-4" />,
                  ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 space-y-2 my-4" />,
                  ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 space-y-2 my-4" />
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChatMessage;