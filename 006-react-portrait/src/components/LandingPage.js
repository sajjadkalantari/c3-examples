import React from 'react';
import { FaHeadphones, FaMicrophone, FaVideo } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-blue-900 text-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
        <div className="absolute top-96 -right-24 w-96 h-96 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-24 left-96 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
        <div className="absolute -bottom-24 right-96 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-6000"></div>
      </div>
      
      <Navbar />
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-24 pt-32 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500">
            Comput3 AI Studio
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl mx-auto text-gray-300">
            Unleash the power of AI with our cutting-edge tools for content creation, speech processing, and media generation
          </p>
          <div className="mt-10">
            <button 
              className="px-8 py-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-lg font-semibold shadow-lg transform transition duration-300 hover:scale-105"
            >
              Get Started
            </button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Portrait Generation Card */}
          <div 
            className="group bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-xl overflow-hidden shadow-lg border border-gray-700 transform transition duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
            onClick={() => navigate('/portrait')}
          >
            <div className="h-48 bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center p-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern"></div>
              </div>
              <FaVideo className="w-32 h-32 text-white relative z-10" />
            </div>
            <div className="p-6">
              <h3 className="text-2xl font-bold mb-2 text-blue-400 group-hover:text-blue-300">Portrait Generation</h3>
              <p className="text-gray-300">
                Transform your photos into stunning animations with our advanced AI portrait generator.
              </p>
              <div className="mt-4">
                <span className="inline-block bg-blue-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-blue-300 mr-2">
                  #Animation
                </span>
                <span className="inline-block bg-blue-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-blue-300">
                  #Portraits
                </span>
              </div>
            </div>
          </div>

          {/* CSM Text-to-Speech Card */}
          <div 
            className="group bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-xl overflow-hidden shadow-lg border border-gray-700 transform transition duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
            onClick={() => navigate('/csm')}
          >
            <div className="h-48 bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center p-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 left-0 w-full h-full bg-dots-pattern"></div>
              </div>
              <FaMicrophone className="w-32 h-32 text-white relative z-10" />
            </div>
            <div className="p-6">
              <h3 className="text-2xl font-bold mb-2 text-pink-400 group-hover:text-pink-300">CSM Text-to-Speech</h3>
              <p className="text-gray-300">
                Convert your text into natural-sounding speech with our state-of-the-art CSM voice synthesis.
              </p>
              <div className="mt-4">
                <span className="inline-block bg-pink-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-pink-300 mr-2">
                  #VoiceSynthesis
                </span>
                <span className="inline-block bg-pink-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-pink-300">
                  #TTS
                </span>
              </div>
            </div>
          </div>

          {/* WHISPER Speech-to-Text Card */}
          <div 
            className="group bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-xl overflow-hidden shadow-lg border border-gray-700 transform transition duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
          >
            <div className="h-48 bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center p-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 left-0 w-full h-full bg-wave-pattern"></div>
              </div>
              <FaHeadphones className="w-32 h-32 text-white relative z-10" />
            </div>
            <div className="p-6">
              <h3 className="text-2xl font-bold mb-2 text-teal-400 group-hover:text-teal-300">WHISPER Speech-to-Text</h3>
              <p className="text-gray-300">
                Accurately transcribe audio to text with our powerful WHISPER model, supporting multiple languages.
              </p>
              <div className="mt-4">
                <span className="inline-block bg-teal-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-teal-300 mr-2">
                  #Transcription
                </span>
                <span className="inline-block bg-teal-900 bg-opacity-50 rounded-full px-3 py-1 text-sm text-teal-300">
                  #MultiLingual
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to experience the future of AI?</h2>
          <p className="text-xl mb-8 text-gray-300 max-w-3xl mx-auto">
            Join thousands of creators and businesses leveraging our AI tools to create amazing content.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-semibold shadow-lg transform transition duration-300 hover:scale-105">
              Try for Free
            </button>
            <button className="px-8 py-3 rounded-full bg-gray-800 hover:bg-gray-700 text-lg font-semibold shadow-lg transform transition duration-300 hover:scale-105">
              View Pricing
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 py-8 border-t border-gray-800 relative z-10">
        <div className="container mx-auto px-4">
          <div className="text-center text-gray-400">
            <p>© 2023 Comput3 AI Studio. All rights reserved.</p>
            <div className="mt-4 flex justify-center space-x-4">
              <button className="hover:text-blue-400 transition-colors">Terms</button>
              <button className="hover:text-blue-400 transition-colors">Privacy</button>
              <button className="hover:text-blue-400 transition-colors">Contact</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 