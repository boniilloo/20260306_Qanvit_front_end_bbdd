
import React from 'react';
import { Send } from 'lucide-react';

const SearchBar = () => {
  return (
    <div className="search-container w-full max-w-[800px] mx-auto mt-8">
      <input 
        type="text" 
        placeholder="What product, process, or supplier capability do you need?"
        className="w-full h-[56px] px-5 rounded-xl border-2 border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
      />
      <button className="search-icon-button p-2 text-primary hover:text-primary/80 transition-colors">
        <Send size={20} fill="#1BB3FF" />
      </button>
    </div>
  );
};

export default SearchBar;
