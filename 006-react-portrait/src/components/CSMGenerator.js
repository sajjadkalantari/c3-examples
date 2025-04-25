import React, { useState, useRef } from 'react';
import { FaMicrophone, FaDownload } from 'react-icons/fa';
import Comput3API from '../services/comput3Api';
import StoredApiKey from './StoredApiKey';

// Proxy URL for development
const PROXY_URL = 'http://localhost:8080/';

// Fallback node to use if we can't get instance info
const FALLBACK_NODE = "widely-gladly-choice-gpu.comput3.ai";

const CSMGenerator = () => {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('random');
  const [temperature, setTemperature] = useState(0.9);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const audioRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // Map API voice parameter to CSM internal parameter names
  const voiceMapping = {
    'random': 'random_voice',
    'conversational_a': 'conversational_a',
    'conversational_b': 'conversational_b'
  };

  const voices = [
    { id: 'random', name: 'Random Voice' },
    { id: 'conversational_a', name: 'Conversational A' },
    { id: 'conversational_b', name: 'Conversational B' }
  ];

  const handleApiKeyChange = (key) => {
    setApiKey(key);
  };

  // Close event source if exists
  const closeEventSource = () => {
    if (eventSourceRef.current) {
      console.log('Closing event source');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Please enter some text to convert to speech');
      return;
    }

    if (!apiKey) {
      setError('Please enter your API key');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(10);
    closeEventSource();

    try {
      // Step 1: Get node information
      let node;
      
      try {
        // Try to get media instance
        const api = new Comput3API(apiKey);
        const mediaInstance = await api.getMediaInstance();

        if (!mediaInstance) {
          console.warn('No media instance available, falling back to default node');
          node = FALLBACK_NODE;
        } else {
          node = mediaInstance.node;
        }
      } catch (err) {
        console.error('Error getting media instance:', err);
        console.warn('Falling back to default node');
        node = FALLBACK_NODE;
      }
      
      console.log(`Using node: ${node}`);
      
      // Create the UI URL as shown in the curl examples
      // Make sure to include the https:// protocol in the URL for the proxy
      const baseUrl = `${PROXY_URL}https://ui-${node}/csm`;
      console.log(`Using base URL: ${baseUrl}`);
      
      // Generate a unique session hash
      const sessionHash = `s${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Session hash: ${sessionHash}`);
      
      // Step 2: Prepare the conversation JSON
      // For single-speaker monologue, we use a simple format with speaker_id 0
      const conversationJson = JSON.stringify([
        { speaker_id: 0, text: text }
      ]);
      
      // Step 3: Prepare the data array according to the curl example
      // This needs to match the exact format seen in the curl request
      const speakerVoice = voiceMapping[voice] || 'random_voice';
      const dataArray = [
        null,                 // First null parameter
        "conversational_a",   // Default voice for speaker 1
        "",                   // Empty string
        null,                 // null
        "conversational_b",   // Default voice for speaker 2
        "",                   // Empty string
        null,                 // null
        speakerVoice,         // Our selected voice
        "",                   // Empty string
        null,                 // null
        "random_voice",       // Extra voices (not used)
        "",                   // Empty string
        null,                 // null
        "random_voice",
        "",
        null,
        "random_voice",
        "",
        null,
        "random_voice",
        "",
        null,
        "random_voice",
        "",
        null,
        "random_voice",
        "",
        null,
        "random_voice",
        "",
        null,
        150,                  // pause_duration
        conversationJson,     // Our conversation JSON
        temperature,          // temperature
        50,                   // topk
        10000                 // max_audio_length
      ];
      
      // Step 4: Submit the job using the queue/join endpoint
      console.log('Submitting job...');
      
      const joinPayload = {
        data: dataArray, 
        event_data: null,
        fn_index: 12,                 // Function index from curl example
        trigger_id: Math.floor(Math.random() * 100), // Random trigger ID
        session_hash: sessionHash
      };
      
      try {
        // Send the request to join the queue
        const joinResponse = await fetch(`${baseUrl}/gradio_api/queue/join?`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-C3-API-KEY': apiKey  // Use header-based authentication
          },
          body: JSON.stringify(joinPayload)
        });
        
        if (!joinResponse.ok) {
          const errorText = await joinResponse.text();
          throw new Error(`Failed to submit job: ${joinResponse.status} - ${errorText}`);
        }
        
        const joinData = await joinResponse.json();
        console.log('Job submitted:', joinData);
        
        if (!joinData.event_id) {
          throw new Error('No event ID returned from server');
        }
        
        const eventId = joinData.event_id;
        console.log(`Got event ID: ${eventId}`);
        setProgress(20);
        
        // Step 5: Poll for status using custom fetch-based polling
        console.log('Starting to listen for events...');
        
        // Create stream URL
        const streamUrl = `${baseUrl}/gradio_api/queue/data?session_hash=${sessionHash}`;
        console.log(`Stream URL: ${streamUrl}`);
        
        // Return a promise that resolves when processing is complete
        return new Promise((resolve, reject) => {
          // For SSE we need to create a custom polling implementation
          // since we need to add custom headers for authentication
          const streamController = new AbortController();
          const signal = streamController.signal;
          
          // Function to poll for event data as a replacement for EventSource
          const pollForEvents = async () => {
            try {
              const response = await fetch(streamUrl, {
                headers: {
                  'Accept': 'text/event-stream',
                  'X-C3-API-KEY': apiKey,
                  'X-Requested-With': 'XMLHttpRequest'
                },
                signal: signal
              });
              
              if (!response.ok) {
                throw new Error(`Stream error: ${response.status}`);
              }
              
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete event messages
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep last incomplete chunk in buffer
                
                for (const line of lines) {
                  if (line.trim() && line.startsWith('data: ')) {
                    const eventData = line.substring(6); // Remove "data: " prefix
                    handleEventData(eventData);
                  }
                }
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                console.error('Polling error:', err);
                
                // Try to recover if connection is lost
                setTimeout(() => {
                  pollForEvents();
                }, 2000);
              }
            }
          };
          
          // Start polling
          pollForEvents();
          
          // Store the controller for cleanup
          eventSourceRef.current = {
            close: () => {
              streamController.abort();
            }
          };
          
          let audioFilePath = null;
          
          // Process event data (same as the onmessage handler before)
          const handleEventData = (eventText) => {
            try {
              const data = JSON.parse(eventText);
              console.log('Event received:', data);
              
              // Handle different message types
              switch (data.msg) {
                case 'estimation':
                  console.log(`In queue: position ${data.rank} of ${data.queue_size}`);
                  setProgress(25);
                  break;
                  
                case 'process_starts':
                  console.log('Processing started');
                  setProgress(30);
                  break;
                  
                case 'heartbeat':
                  // Increment progress slightly on each heartbeat
                  setProgress(prev => Math.min(80, prev + 5));
                  break;
                  
                case 'process_completed':
                  console.log('Processing completed!', data);
                  if (data.output && data.output.data && data.output.data[0] && data.output.data[0].path) {
                    audioFilePath = data.output.data[0].path;
                    
                    // Get download URL from the response
                    const downloadUrl = data.output.data[0].url;
                    console.log(`Download URL from response: ${downloadUrl}`);
                    
                    // Always construct the URL with the proxy and full https protocol
                    let fullDownloadUrl;
                    if (downloadUrl) {
                      // If we have a URL in the response, make sure it uses the proxy
                      // First check if it's already an absolute URL
                      if (downloadUrl.startsWith('http')) {
                        // Just prepend our proxy
                        fullDownloadUrl = `${PROXY_URL}${downloadUrl}`;
                      } else {
                        // It's a relative URL, construct the full URL with https
                        fullDownloadUrl = `${PROXY_URL}https://ui-${node}/csm${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
                      }
                    } else {
                      // Construct the URL ourselves
                      fullDownloadUrl = `${PROXY_URL}https://ui-${node}/csm/gradio_api/file=${encodeURIComponent(audioFilePath)}`;
                    }
                    
                    console.log(`Full download URL with proxy: ${fullDownloadUrl}`);
                    downloadAudio(fullDownloadUrl);
                  } else {
                    reject(new Error('No audio data in response'));
                  }
                  break;
                  
                case 'close_stream':
                  console.log('Stream closed by server');
                  if (eventSourceRef.current) {
                    eventSourceRef.current.close();
                  }
                  break;
              }
            } catch (err) {
              console.error('Error processing event data:', err);
            }
          };
          
          // Function to download audio file
          const downloadAudio = async (fileUrl) => {
            try {
              console.log(`Downloading audio from: ${fileUrl}`);
              setProgress(90);
              
              // Download the file
              const audioResponse = await fetch(fileUrl, {
                headers: {
                  'X-Requested-With': 'XMLHttpRequest',
                  'X-C3-API-KEY': apiKey // Use header-based authentication
                }
              });
              
              if (!audioResponse.ok) {
                throw new Error(`Failed to download audio: ${audioResponse.status}`);
              }
              
              // Create a blob URL
              const audioBlob = await audioResponse.blob();
              const url = URL.createObjectURL(audioBlob);
              setAudioUrl(url);
              setProgress(100);
              resolve(url);
            } catch (err) {
              console.error('Error downloading audio:', err);
              reject(err);
            } finally {
              setIsGenerating(false);
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
              }
            }
          };
        });
      } catch (err) {
        console.error('Error communicating with CSM service:', err);
        throw new Error(`Failed to communicate with speech service: ${err.message}`);
      }
    } catch (err) {
      console.error('Error generating speech:', err);
      setError(err.message);
      setProgress(0);
      setIsGenerating(false);
      closeEventSource();
    }
  };

  // Clean up event source on unmount
  React.useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, []);

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = 'generated-speech.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="text-center mb-8 pb-5 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">CSM Text-to-Speech</h1>
        <p className="text-gray-600 text-lg">Convert your text into natural-sounding speech</p>
      </div>

      <StoredApiKey onChange={handleApiKeyChange} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-2">
            Enter Text
          </label>
          <textarea
            id="text"
            rows="4"
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste your text here..."
            disabled={isGenerating}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="voice" className="block text-sm font-medium text-gray-700 mb-2">
              Voice Type
            </label>
            <select
              id="voice"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={isGenerating}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {temperature}
            </label>
            <input
              type="range"
              id="temperature"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
              disabled={isGenerating}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md">
            <p>{error}</p>
          </div>
        )}

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isGenerating || !text.trim() || !apiKey}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            <FaMicrophone className="mr-2" />
            {isGenerating ? 'Generating...' : 'Generate Speech'}
          </button>
        </div>
      </form>

      {isGenerating && (
        <div className="mt-6">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {audioUrl && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-center">
            <audio
              ref={audioRef}
              controls
              className="w-full"
              src={audioUrl}
            />
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center"
            >
              <FaDownload className="mr-2" />
              Download Audio
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CSMGenerator; 