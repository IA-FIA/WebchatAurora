function ChatInput({ value, onChange, disabled, onSend }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Escribe tu mensaje aquí..."
      className="flex-1 resize-none overflow-y-auto max-h-32 p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#569D33] focus:border-transparent bg-white text-black"
      style={{
        minHeight: '40px',
        height: 'auto',
      }}
      onInput={(e) => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (onSend) onSend();
        }
      }}
    />
  );
}

export default ChatInput;