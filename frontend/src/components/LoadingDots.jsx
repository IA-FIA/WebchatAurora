function LoadingDots() {
    return (
      <div className="flex space-x-1">
        <div className="animate-bounce delay-0 h-2 w-2 bg-[#94bb1e] rounded-full"></div>
        <div className="animate-bounce delay-100 h-2 w-2 bg-[#94bb1e] rounded-full"></div>
        <div className="animate-bounce delay-200 h-2 w-2 bg-[#94bb1e] rounded-full"></div>
      </div>
    );
  }
  
  export default LoadingDots;