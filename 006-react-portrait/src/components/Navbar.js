import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <nav className={`w-full py-4 ${isHomePage ? 'absolute top-0 z-10' : 'bg-gray-900'}`}>
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-white flex items-center">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            Comput3 AI
          </span>
        </Link>
        
        <div className="flex items-center space-x-4">
          {!isHomePage && (
            <Link 
              to="/" 
              className="text-white hover:text-blue-300 transition-colors"
            >
              Home
            </Link>
          )}
          <a 
            href="#" 
            className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 